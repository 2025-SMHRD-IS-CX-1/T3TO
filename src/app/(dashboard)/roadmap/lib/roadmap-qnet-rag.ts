/**
 * RAG 기반 자격증 추천 - Hallucination 방지 및 맞춤형 추천
 * 실제 Q-Net API 결과만 사용하고, RAG로 필터링 및 우선순위 결정
 */

/** 'AI 관련 자격증', 'OO 관련 자격증' 등 일반 문구를 실제 자격증 정식명으로 치환 (화면 표기용) */
function normalizeCertDisplayName(name: string, targetJob?: string): string {
    const t = (name || '').trim()
    if (!t) return name
    if (/^AI\s*관련\s*자격증$|^인공지능\s*관련\s*자격증$/i.test(t)) return '빅데이터분석기사'
    if (/^데이터\s*관련\s*자격증$/i.test(t)) return 'ADsP(데이터분석준전문가)'
    if (/^목표\s*직무\s*관련\s*자격증$|^직무\s*관련\s*자격증$|^전공\s*관련\s*자격증$/i.test(t)) {
        const job = (targetJob || '').trim()
        if (/개발|백엔드|소프트웨어|프로그래머|웹\s*개발|풀스택|프론트엔드|IT\s*엔지니어|데이터\s*분석|AI/i.test(job)) return '정보처리기사'
        if (/전기|전자/i.test(job)) return '전기기사'
        if (/기계|자동차/i.test(job)) return '기계설계기사'
    }
    return name
}

import OpenAI from 'openai'
import { getRoadmapModel } from '@/lib/ai-models'
import { filterQualificationsByEligibility, getExamScheduleWrittenAndPractical } from './roadmap-qnet'
import {
    CERT_RECOMMENDATION_SYSTEM_PROMPT,
    CERT_OPENAI_FALLBACK_SYSTEM_PROMPT,
    CERT_TAVILY_CONTEXT_SYSTEM_PROMPT,
    buildCertificationRecommendationContext,
    buildTavilyCertRecommendationContext,
} from './roadmap-prompts'

interface RecommendCertificationsOpts {
    qualifications: unknown[]
    examSchedule: unknown[]
    targetJob: string
    major: string
    analysisList: Array<{ strengths?: string; interest_keywords?: string; career_values?: string }>
    jobInfoFromTavily?: { jobTitle: string; requirements?: string; trends?: string; skills?: string; certifications?: string } | null
    education_level?: string
    work_experience_years?: number
    /** Q-Net API 미제공 시 Tavily 시험일정 검색 결과 */
    examScheduleTavilyFallback?: { summary?: string; url?: string }
    /** 프로필에 기록된 보유 자격·기술스택(예: skill_vector). 있으면 이미 보유한 자격은 추천 제외 */
    existingSkillsOrCerts?: string
    profileId?: string
    counselorId?: string | null
}

export async function recommendCertificationsWithRag(
    opts: RecommendCertificationsOpts
): Promise<Array<{
    type: string
    name: string
    status: string
    color: string
    details?: {
        written?: string
        practical?: string
        difficulty?: string
        examSchedule?: string
        examScheduleWritten?: string
        examSchedulePractical?: string
        description?: string
    }
}>> {
    const { qualifications, examSchedule, targetJob, major, analysisList, jobInfoFromTavily, education_level = '', work_experience_years = 0, examScheduleTavilyFallback, existingSkillsOrCerts } = opts

    if (qualifications.length === 0) {
        return []
    }

    // 학력·경력에 따른 자격조건 필터: 고졸→기능사, 전문대→산업기사, 4년제 대학교 재학 이상→기사
    const eligibleQuals = filterQualificationsByEligibility(qualifications, education_level, work_experience_years)
    if (eligibleQuals.length === 0) {
        return []
    }

    // roadmap-prompts.ts의 메인 프롬프트 구조 활용 (Tavily 직무정보 + 학력·경력 + 시험일정 Tavily 폴백 반영)
    const userPrompt = buildCertificationRecommendationContext({
        targetJob,
        major,
        analysisList,
        qualifications: eligibleQuals,
        jobInfoFromTavily,
        education_level,
        work_experience_years,
        examScheduleTavilyFallback,
        existingSkillsOrCerts,
    })

    try {
        const openaiApiKey = process.env.OPENAI_API_KEY
        if (!openaiApiKey) {
            console.warn('[자격증 RAG] OPENAI_API_KEY가 없어 키워드 기반 필터링으로 대체합니다')
            return fallbackToKeywordFiltering(opts)
        }

        const openai = new OpenAI({ apiKey: openaiApiKey })
        const model = getRoadmapModel()

        const res = await openai.chat.completions.create({
            model,
            messages: [
                { role: 'system', content: CERT_RECOMMENDATION_SYSTEM_PROMPT },
                { role: 'user', content: userPrompt },
            ],
            temperature: 0.3,
            response_format: { type: 'json_object' },
        })

        const text = res.choices[0]?.message?.content?.trim() || ''

        let parsed: { recommended?: Array<{ qualName: string; relevanceScore: number; reason: string }> }
        try {
            parsed = JSON.parse(text)
        } catch (e) {
            console.error('[자격증 RAG] JSON 파싱 실패:', e)
            return fallbackToKeywordFiltering(opts)
        }

        if (!parsed.recommended || !Array.isArray(parsed.recommended)) {
            console.warn('[자격증 RAG] 잘못된 응답 형식, 키워드 필터링으로 대체')
            return fallbackToKeywordFiltering(opts)
        }

        // RAG 추천 결과를 실제 자격증 데이터와 매칭
        const recommendedCerts: Array<{
            type: string
            name: string
            status: string
            color: string
            details?: {
                written?: string
                practical?: string
                difficulty?: string
                examSchedule?: string
                examScheduleWritten?: string
                examSchedulePractical?: string
                description?: string
            }
        }> = []

        const seenNames = new Set<string>()

        parsed.recommended = parsed.recommended.slice(0, 5)
        for (let idx = 0; idx < parsed.recommended.length; idx++) {
            const rec = parsed.recommended[idx]
            // 자격조건 필터된 목록에서만 매칭 (학력·경력에 맞는 자격만)
            const matchedQual = eligibleQuals.find((qual) => {
                if (!qual || typeof qual !== 'object') return false
                const qualObj = qual as Record<string, unknown>
                const qualName = String(qualObj.qualName || qualObj.qualNm || qualObj.name || qualObj.jmfldnm || '').trim()
                return qualName === rec.qualName || qualName.includes(rec.qualName) || rec.qualName.includes(qualName)
            })

            if (!matchedQual || seenNames.has(rec.qualName)) continue

            const qualObj = matchedQual as Record<string, unknown>
            const qualName = String(qualObj.qualName || qualObj.qualNm || qualObj.name || qualObj.jmfldnm || '').trim()
            const qualDesc = String(qualObj.description || qualObj.desc || qualObj.qualDesc || qualObj.obligfldnm || qualObj.mdobligfldnm || '').trim()

            // 시험 일정: API 데이터만 사용 (필기/실기 시행월·회차, 환각 금지)
            const { examScheduleWritten, examSchedulePractical } = getExamScheduleWrittenAndPractical(examSchedule, qualName)

            const colors = [
                'text-blue-600 bg-blue-50',
                'text-green-600 bg-green-50',
                'text-orange-600 bg-orange-50',
                'text-purple-600 bg-purple-50',
                'text-red-600 bg-red-50',
            ]
            const status = '취득 권장'

            recommendedCerts.push({
                type: '자격증',
                name: qualName,
                status,
                color: colors[recommendedCerts.length % colors.length],
                details: {
                    description: rec.reason || qualDesc || `${qualName}에 관한 국가기술자격증입니다.`,
                    examScheduleWritten,
                    examSchedulePractical,
                    difficulty: '난이도: 중',
                    written: '필기: 100점 만점에 60점 이상',
                    practical: '실기: 100점 만점에 60점 이상',
                },
            })

            seenNames.add(qualName)
        }

        return applyEducationCertFilter(recommendedCerts, education_level, work_experience_years)
    } catch (error) {
        console.error('[자격증 RAG] 에러 발생:', error)
        return fallbackToKeywordFiltering(opts)
    }
}

/** Tavily 자격증 검색 결과를 RAG로 사용해 자격증 추천 (Q-Net API 대체). 내담자 프로필·DB·상담 기반 분석 후 Tavily 검색 결과에서만 선별. */
export async function getCertificationsFromTavilyContext(opts: {
    targetJob: string
    major: string
    analysisList: Array<{ strengths?: string; interest_keywords?: string; career_values?: string }>
    tavilyCertContext: { summary: string; results: Array<{ title: string; url: string; content: string }> }
    jobInfoFromTavily?: { jobTitle: string; requirements?: string; trends?: string; skills?: string; certifications?: string } | null
    education_level?: string
    /** 프로필에 기록된 보유 자격·기술스택. 있으면 추천에서 제외 */
    existingSkillsOrCerts?: string
}): Promise<Array<{
    type: string
    name: string
    status: string
    color: string
    details?: { written?: string; practical?: string; difficulty?: string; examSchedule?: string; examScheduleWritten?: string; examSchedulePractical?: string; description?: string }
}>> {
    const { targetJob, major, analysisList, tavilyCertContext, jobInfoFromTavily, education_level, existingSkillsOrCerts } = opts
    const openaiApiKey = process.env.OPENAI_API_KEY
    if (!openaiApiKey) {
        console.warn('[자격증 Tavily RAG] OPENAI_API_KEY가 없어 OpenAI 폴백으로 대체')
        return getCertificationsFromOpenAIFallback({ targetJob, major, analysisList, jobInfoFromTavily: jobInfoFromTavily ?? undefined, education_level, existingSkillsOrCerts })
    }

    const userPrompt = buildTavilyCertRecommendationContext({
        targetJob,
        major,
        analysisList,
        tavilyCertContext,
        jobInfoFromTavily: jobInfoFromTavily ?? undefined,
        existingSkillsOrCerts,
    })

    try {
        const educationNote = education_level
            ? /대학교|대졸|4년제|졸업\s*예정|대학원|석사|박사/i.test(education_level)
                ? `\n\n**[학력 필터] 내담자 학력: ${education_level} → 기사 등급만 추천. 기능사·산업기사는 4년제 대학생에게 하위 등급이므로 절대 추천 금지. 연관 자격증으로 3~5개 채울 때도 이 필터를 적용할 것.**`
                : `\n\n[학력 참고] 내담자 학력: ${education_level}`
            : ''

        const openai = new OpenAI({ apiKey: openaiApiKey })
        const model = getRoadmapModel()
        const res = await openai.chat.completions.create({
            model,
            messages: [
                { role: 'system', content: CERT_TAVILY_CONTEXT_SYSTEM_PROMPT },
                { role: 'user', content: userPrompt + educationNote },
            ],
            temperature: 0.3,
            response_format: { type: 'json_object' },
        })

        const text = res.choices[0]?.message?.content?.trim() || ''
        const parsed = JSON.parse(text) as { recommended?: Array<{ qualName: string; relevanceScore: number; reason: string }> }
        if (!parsed.recommended || !Array.isArray(parsed.recommended)) return []

        let list = applyEducationCertFilter(parsed.recommended.slice(0, 5), education_level)

        const colors = [
            'text-blue-600 bg-blue-50',
            'text-green-600 bg-green-50',
            'text-orange-600 bg-orange-50',
            'text-purple-600 bg-purple-50',
            'text-red-600 bg-red-50',
        ]

        return list.map((rec, i) => {
            const displayName = normalizeCertDisplayName(rec.qualName, targetJob)
            return {
                type: '자격증',
                name: displayName,
                status: '취득 권장',
                color: colors[i % colors.length],
                details: {
                    description: rec.reason || `${displayName} 관련 자격증입니다.`,
                    examScheduleWritten: '',
                    examSchedulePractical: '',
                    difficulty: '난이도: 중',
                    written: '필기: 100점 만점에 60점 이상',
                    practical: '실기: 100점 만점에 60점 이상',
                },
            }
        })
    } catch (error) {
        console.error('[자격증 Tavily RAG] 에러:', error)
        return getCertificationsFromOpenAIFallback({ targetJob, major, analysisList, jobInfoFromTavily: jobInfoFromTavily ?? undefined, education_level, existingSkillsOrCerts })
    }
}

/** 4년제 재학·졸업예정·졸업·대학원 등 기술사/기능장 미충족으로 볼 수 있는 학력 여부 */
function isFourYearStudentOrNewGraduate(education_level: string | undefined): boolean {
    if (!education_level || !education_level.trim()) return false
    const level = education_level.trim()
    if (/고등학교\s*졸업|^고졸$/i.test(level)) return false
    if (/전문대|2년제|2년\s*제/i.test(level) && !/4년|대학교|대학원|석사|박사/i.test(level)) return false
    return /대학교|대학\s*재학|재학|4년|졸업\s*예정|대졸|대학원|석사|박사/i.test(level)
}

/** 학력·경력에 따른 자격증 필터 (한 번에 적용). 4년제 재학·졸업예정 등 → 기술사·기능장·기능사·산업기사 제외. 경력 4년 미만만 해당 시 → 기술사·기능장만 제외. qualName 또는 name 필드 사용. */
function applyEducationCertFilter<T extends { qualName?: string; name?: string }>(
    list: T[],
    education_level: string | undefined,
    work_experience_years?: number
): T[] {
    const getName = (rec: T) => (rec.qualName ?? rec.name ?? '').trim()
    const hasHighTier = (rec: T) => /기술사|기능장/.test(getName(rec))
    const hasLowerTier = (rec: T) => /기능사|산업기사/.test(getName(rec))

    if (isFourYearStudentOrNewGraduate(education_level)) {
        return list.filter((rec) => !hasHighTier(rec) && !hasLowerTier(rec))
    }
    if (work_experience_years != null && work_experience_years < 4) {
        return list.filter((rec) => !hasHighTier(rec))
    }
    return list
}

/** Q-Net API 실패 시 OpenAI로 자격증 추천 (내담자 프로필·DB·상담 기반 RAG + LLM 지식) */
export async function getCertificationsFromOpenAIFallback(opts: {
    targetJob: string
    major: string
    analysisList: Array<{ strengths?: string; interest_keywords?: string; career_values?: string }>
    jobInfoFromTavily?: { jobTitle: string; requirements?: string; trends?: string; skills?: string; certifications?: string } | null
    education_level?: string
    /** 프로필에 기록된 보유 자격·기술스택. 있으면 추천에서 제외 */
    existingSkillsOrCerts?: string
}): Promise<Array<{
    type: string
    name: string
    status: string
    color: string
    details?: { written?: string; practical?: string; difficulty?: string; examSchedule?: string; examScheduleWritten?: string; examSchedulePractical?: string; description?: string }
}>> {
    const { targetJob, major, analysisList, jobInfoFromTavily, education_level, existingSkillsOrCerts } = opts
    const openaiApiKey = process.env.OPENAI_API_KEY
    if (!openaiApiKey) {
        console.warn('[자격증 OpenAI 폴백] OPENAI_API_KEY가 없어 빈 배열 반환')
        return []
    }

    const analysisText = analysisList
        .map((a) => [a.strengths, a.interest_keywords, a.career_values].filter(Boolean).join(' '))
        .join(' ')

    const existingLine =
        existingSkillsOrCerts && existingSkillsOrCerts.trim()
            ? `- [이미 보유한 자격·기술스택] 아래는 추천에서 제외할 것: ${existingSkillsOrCerts.trim().slice(0, 400)}\n`
            : ''

    const tavilySection = jobInfoFromTavily
        ? `[Tavily 직무 정보 - 시장 요구사항]
- 직무: ${jobInfoFromTavily.jobTitle}
- 채용 요구사항·역량: ${jobInfoFromTavily.requirements || '없음'}
- 최신 트렌드: ${jobInfoFromTavily.trends || '없음'}
- 필수 스킬: ${jobInfoFromTavily.skills || '없음'}
- 직무 관련 자격증 요구: ${jobInfoFromTavily.certifications || '없음'}

`
        : ''

    const educationNote = education_level
        ? /대학교|대졸|4년제|졸업\s*예정|대학원|석사|박사/i.test(education_level)
            ? `\n- **학력**: ${education_level} → **기사 등급만 추천할 것. 기능사·산업기사는 하위 등급이므로 제외. 전기응용기술사·산업계측제어기술사 등 기술사도 추천 금지(기사+경력 4년 이상 요건).**`
            : /전문대/i.test(education_level)
                ? `\n- **학력**: ${education_level} → 산업기사 위주 추천, 기사는 경력 2년 이상일 때만.`
                : `\n- **학력**: ${education_level}`
        : ''

    const userPrompt = `[내담자 정보 - DB·상담 기반]
- 목표 직무: ${targetJob || '없음'}
- 전공: ${major || '없음'}
- 상담 분석 (강점, 관심, 가치관): ${analysisText || '없음'}
${existingLine}${educationNote}
${tavilySection}위 정보(내담자 프로필·DB·상담 + Tavily 직무정보)를 종합하여 **우선 목표 직종 필수·우대 자격증**을 추천하고, **자격증은 3~5개** 출력할 것. **이미 보유한 자격은 제외**하고, 개수가 모자라면 취업에 도움이 되는 **연관 자격증**을 포함해 3~5개가 되게 추천해라. **연관 자격증을 넣을 때도 위 [학력] 조건을 반드시 지킬 것.** JSON만 출력.`

    try {
        const openai = new OpenAI({ apiKey: openaiApiKey })
        const model = getRoadmapModel()
        const res = await openai.chat.completions.create({
            model,
            messages: [
                { role: 'system', content: CERT_OPENAI_FALLBACK_SYSTEM_PROMPT },
                { role: 'user', content: userPrompt },
            ],
            temperature: 0.3,
            response_format: { type: 'json_object' },
        })

        const text = res.choices[0]?.message?.content?.trim() || ''
        const parsed = JSON.parse(text) as { recommended?: Array<{ qualName: string; relevanceScore: number; reason: string }> }
        if (!parsed.recommended || !Array.isArray(parsed.recommended)) return []

        let list = applyEducationCertFilter(parsed.recommended.slice(0, 5), education_level)

        const colors = [
            'text-blue-600 bg-blue-50',
            'text-green-600 bg-green-50',
            'text-orange-600 bg-orange-50',
            'text-purple-600 bg-purple-50',
            'text-red-600 bg-red-50',
        ]

        return list.map((rec, i) => {
            const displayName = normalizeCertDisplayName(rec.qualName, opts.targetJob)
            return {
                type: '자격증',
                name: displayName,
                status: '취득 권장',
                color: colors[i % colors.length],
                details: {
                    description: rec.reason || `${displayName}에 관한 국가기술자격증입니다.`,
                    examScheduleWritten: '',
                    examSchedulePractical: '',
                    difficulty: '난이도: 중',
                    written: '필기: 100점 만점에 60점 이상',
                    practical: '실기: 100점 만점에 60점 이상',
                },
            }
        })
    } catch (error) {
        console.error('[자격증 OpenAI 폴백] 에러:', error)
        return []
    }
}

/** 추천이 1~2개일 때 개발자/IT 직무면 연관 자격증을 추가해 최소 3개가 되게 함 (로드맵·rule-based 공통) */
export function ensureMinCertsForDeveloper(
    targetJob: string,
    certs: Array<{ type: string; name: string; status: string; color: string; details?: Record<string, unknown> }>,
    minCount: number = 3
): typeof certs {
    if (certs.length >= minCount) return certs
    const isDev = /백엔드|개발자|소프트웨어|프로그래머|웹\s*개발|풀스택|프론트엔드|IT\s*엔지니어|데이터\s*분석|AI\s*엔지니어/i.test(targetJob)
    if (!isDev) return certs
    const existing = new Set(certs.map((c) => (c.name || '').trim()))
    const fallbackList = [
        { name: '정보처리기사', desc: '소프트웨어 개발·IT 분야 기초 자격으로 취업 시 우대됩니다.' },
        { name: 'SQLD', desc: '데이터베이스 SQL 활용 능력 검정. 백엔드·데이터 직무에 유리합니다.' },
        { name: 'ADsP', desc: '데이터 분석 준전문가. 데이터 기반 의사결정 역량 증명에 도움이 됩니다.' },
        { name: '리눅스마스터', desc: '리눅스 시스템 운영·관리 역량. 서버·인프라 직무에 활용됩니다.' },
        { name: '빅데이터분석기사', desc: '빅데이터 수집·처리·분석 역량. 데이터·AI 직무 연관 자격입니다.' },
    ]
    const colors = ['text-blue-600 bg-blue-50', 'text-green-600 bg-green-50', 'text-orange-600 bg-orange-50', 'text-purple-600 bg-purple-50', 'text-red-600 bg-red-50']
    const added: typeof certs = []
    for (const item of fallbackList) {
        if (added.length + certs.length >= minCount) break
        if (existing.has(item.name)) continue
        added.push({
            type: '자격증',
            name: item.name,
            status: '취득 권장',
            color: colors[(certs.length + added.length) % colors.length],
            details: { description: item.desc, examScheduleWritten: '', examSchedulePractical: '', difficulty: '난이도: 중', written: '필기: 60점 이상', practical: '실기: 60점 이상' },
        })
        existing.add(item.name)
    }
    return certs.length ? [...certs, ...added] : added
}

/** 개발자/IT 직무일 때 한국 국가기술자격(정보처리기사, SQLD, ADsP 등)을 우선 정렬하고, 순위 문구를 1순위부터 재부여 */
export function reorderCertsForDeveloper(
    targetJob: string,
    certs: Array<{ type: string; name: string; status: string; color: string; details?: Record<string, unknown> }>
): typeof certs {
    if (!certs.length) return certs
    const isDev = /백엔드|개발자|소프트웨어|프로그래머|웹\s*개발|풀스택|프론트엔드|IT\s*엔지니어/i.test(targetJob)
    const sorted = isDev
        ? [...certs].sort((a, b) => {
              const koreanFirst = ['정보처리기사', 'SQLD', 'ADsP', '정보보안기사', '빅데이터분석기사', '리눅스마스터', '컴퓨터활용능력']
              const nameA = (a.name || '').trim()
              const nameB = (b.name || '').trim()
              const idxA = koreanFirst.findIndex((kw) => nameA.includes(kw))
              const idxB = koreanFirst.findIndex((kw) => nameB.includes(kw))
              if (idxA >= 0 && idxB >= 0) return idxA - idxB
              if (idxA >= 0) return -1
              if (idxB >= 0) return 1
              return 0
          })
        : certs
    return sorted.map((c) => ({ ...c, status: '취득 권장' }))
}

/** 로드맵 생성 시 사용 - Tavily 검색(Q-Net 대체) 또는 Q-Net API + DB·상담 기반 자격증 추천. */
export async function getCertificationsForRoadmap(opts: {
    targetJob: string
    major: string
    analysisList: Array<{ strengths?: string; interest_keywords?: string; career_values?: string }>
    jobInfoFromTavily?: { jobTitle: string; requirements?: string; trends?: string; skills?: string; certifications?: string } | null
    education_level?: string
    work_experience_years?: number
    examScheduleTavilyFallback?: { summary?: string; url?: string }
    /** 프로필에 기록된 보유 자격·기술스택(예: skill_vector) */
    existingSkillsOrCerts?: string
    getAllQualifications?: () => Promise<unknown[]>
    getExamSchedule?: () => Promise<unknown[]>
    /** Tavily 자격증 검색 결과 (Q-Net API 대체, 있으면 우선 사용) */
    tavilyCertContext?: { summary: string; results: Array<{ title: string; url: string; content: string }> }
}): Promise<Array<{
    type: string
    name: string
    status: string
    color: string
    details?: { written?: string; practical?: string; difficulty?: string; examSchedule?: string; examScheduleWritten?: string; examSchedulePractical?: string; description?: string }
}>> {
    const { targetJob, major, analysisList, jobInfoFromTavily, education_level = '', work_experience_years = 0, examScheduleTavilyFallback, existingSkillsOrCerts, getAllQualifications = () => Promise.resolve([]), getExamSchedule = () => Promise.resolve([]), tavilyCertContext } = opts
    const [qualifications, examSchedule] = await Promise.all([
        getAllQualifications(),
        getExamSchedule(),
    ])

    if (qualifications.length === 0) {
        if (tavilyCertContext && (tavilyCertContext.summary.length > 0 || tavilyCertContext.results.length > 0)) {
            const tavilyCerts = await getCertificationsFromTavilyContext({
                targetJob,
                major,
                analysisList,
                tavilyCertContext,
                jobInfoFromTavily: jobInfoFromTavily ?? null,
                education_level,
                existingSkillsOrCerts,
            })
            const filled = ensureMinCertsForDeveloper(targetJob, tavilyCerts, 3)
            return reorderCertsForDeveloper(targetJob, filled)
        }
        const fallbackCerts = await getCertificationsFromOpenAIFallback({
            targetJob,
            major,
            analysisList,
            jobInfoFromTavily: jobInfoFromTavily ?? undefined,
            education_level,
            existingSkillsOrCerts,
        })
        const filled = ensureMinCertsForDeveloper(targetJob, fallbackCerts, 3)
        return reorderCertsForDeveloper(targetJob, filled)
    }

    // 1차: Q-Net 기반 국가기술자격 추천 (학력·경력 필터 적용)
    const qnetBased = await recommendCertificationsWithRag({
        qualifications,
        examSchedule,
        targetJob,
        major,
        analysisList,
        jobInfoFromTavily: jobInfoFromTavily ?? undefined,
        education_level,
        work_experience_years,
        examScheduleTavilyFallback,
        existingSkillsOrCerts,
    })

    // 2차: Tavily 검색 기반 자격증(국가기술 + 민간) 추가 추천
    if (!tavilyCertContext || (tavilyCertContext.summary.length === 0 && tavilyCertContext.results.length === 0)) {
        const filled = ensureMinCertsForDeveloper(targetJob, qnetBased, 3)
        return reorderCertsForDeveloper(targetJob, filled)
    }

    const tavilyBased = await getCertificationsFromTavilyContext({
        targetJob,
        major,
        analysisList,
        tavilyCertContext,
        jobInfoFromTavily: jobInfoFromTavily ?? null,
        education_level,
        existingSkillsOrCerts,
    })

    if (!tavilyBased || tavilyBased.length === 0) {
        const filled = ensureMinCertsForDeveloper(targetJob, qnetBased, 3)
        return reorderCertsForDeveloper(targetJob, filled)
    }

    // 이름 기준으로 중복 제거 후 병합 (국가기술 + Tavily 자격증)
    const seen = new Set(qnetBased.map((c) => c.name.trim()))
    const extra = tavilyBased.filter((c) => {
        const name = (c.name || '').trim()
        if (!name) return false
        if (seen.has(name)) return false
        seen.add(name)
        return true
    })
    const merged = applyEducationCertFilter([...qnetBased, ...extra].slice(0, 7), education_level, opts.work_experience_years)
    const filled = ensureMinCertsForDeveloper(targetJob, merged, 3)
    return reorderCertsForDeveloper(targetJob, filled)
}

/** RAG 실패 시 키워드 기반 필터링으로 폴백 */
function fallbackToKeywordFiltering(opts: RecommendCertificationsOpts): Array<{
    type: string
    name: string
    status: string
    color: string
    details?: {
        written?: string
        practical?: string
        difficulty?: string
        examSchedule?: string
        examScheduleWritten?: string
        examSchedulePractical?: string
        description?: string
    }
}> {
    const { filterRelevantQualifications } = require('./roadmap-qnet')
    const { extractKeywordsFromAnalysis } = require('./roadmap-competencies')

    const extractedKw = extractKeywordsFromAnalysis(opts.analysisList)
    return filterRelevantQualifications(
        opts.qualifications,
        opts.examSchedule,
        opts.targetJob,
        opts.major,
        extractedKw,
        opts.education_level ?? '',
        opts.work_experience_years ?? 0
    )
}
