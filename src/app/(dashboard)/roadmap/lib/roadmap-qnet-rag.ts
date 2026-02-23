/**
 * RAG 기반 자격증 추천 - Hallucination 방지 및 맞춤형 추천
 * 실제 Q-Net API 결과만 사용하고, RAG로 필터링 및 우선순위 결정
 */
import OpenAI from 'openai'
import { getRoadmapModel } from '@/lib/ai-models'
import { filterQualificationsByEligibility, getExamScheduleWrittenAndPractical } from './roadmap-qnet'
import {
    CERT_RECOMMENDATION_SYSTEM_PROMPT,
    CERT_OPENAI_FALLBACK_SYSTEM_PROMPT,
    buildCertificationRecommendationContext,
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
    const { qualifications, examSchedule, targetJob, major, analysisList, jobInfoFromTavily, education_level = '', work_experience_years = 0, examScheduleTavilyFallback } = opts

    if (qualifications.length === 0) {
        console.log('[자격증 RAG] Q-Net API 결과가 없어 추천을 건너뜁니다')
        return []
    }

    // 학력·경력(직종 경력 포함)에 따른 자격조건 필터: 고졸→기능사 위주, 대학재학→기능사·산업기사, 대학졸업→기능사·산업기사·기사
    const eligibleQuals = filterQualificationsByEligibility(qualifications, education_level, work_experience_years)
    if (eligibleQuals.length === 0) {
        console.log('[자격증 RAG] 학력·경력 조건에 맞는 자격증이 없어 추천을 건너뜁니다')
        return []
    }
    console.log('[자격증 RAG] 자격조건 필터 후 추천 후보:', eligibleQuals.length, '개 (학력:', education_level || '미입력', ', 경력:', work_experience_years + '년)')

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
    })

    try {
        const openaiApiKey = process.env.OPENAI_API_KEY
        if (!openaiApiKey) {
            console.warn('[자격증 RAG] OPENAI_API_KEY가 없어 키워드 기반 필터링으로 대체합니다')
            return fallbackToKeywordFiltering(opts)
        }

        const openai = new OpenAI({ apiKey: openaiApiKey })
        const model = getRoadmapModel()

        console.log('[자격증 RAG] LLM 호출 시작 - 자격증 수:', eligibleQuals.length)
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
        console.log('[자격증 RAG] LLM 응답 받음 - 길이:', text.length)

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

        for (const rec of parsed.recommended.slice(0, 5)) {
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
            const statuses = ['취득 권장', '취득 추천', '관심 분야']

            recommendedCerts.push({
                type: '자격증',
                name: qualName,
                status: rec.relevanceScore >= 8 ? statuses[0] : rec.relevanceScore >= 6 ? statuses[1] : statuses[2],
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

        console.log('[자격증 RAG] 추천 완료 - 최종 자격증 수:', recommendedCerts.length)
        return recommendedCerts
    } catch (error) {
        console.error('[자격증 RAG] 에러 발생:', error)
        console.log('[자격증 RAG] 키워드 필터링으로 대체')
        return fallbackToKeywordFiltering(opts)
    }
}

/** Q-Net API 실패 시 OpenAI로 자격증 추천 (LLM 지식 기반) */
export async function getCertificationsFromOpenAIFallback(opts: {
    targetJob: string
    major: string
    analysisList: Array<{ strengths?: string; interest_keywords?: string; career_values?: string }>
    jobInfoFromTavily?: { jobTitle: string; requirements?: string; trends?: string; skills?: string; certifications?: string } | null
}): Promise<Array<{
    type: string
    name: string
    status: string
    color: string
    details?: { written?: string; practical?: string; difficulty?: string; examSchedule?: string; examScheduleWritten?: string; examSchedulePractical?: string; description?: string }
}>> {
    const { targetJob, major, analysisList, jobInfoFromTavily } = opts
    const openaiApiKey = process.env.OPENAI_API_KEY
    if (!openaiApiKey) {
        console.warn('[자격증 OpenAI 폴백] OPENAI_API_KEY가 없어 빈 배열 반환')
        return []
    }

    const analysisText = analysisList
        .map((a) => [a.strengths, a.interest_keywords, a.career_values].filter(Boolean).join(' '))
        .join(' ')

    const tavilySection = jobInfoFromTavily
        ? `[Tavily 직무 정보 - 시장 요구사항]
- 직무: ${jobInfoFromTavily.jobTitle}
- 채용 요구사항·역량: ${jobInfoFromTavily.requirements || '없음'}
- 최신 트렌드: ${jobInfoFromTavily.trends || '없음'}
- 필수 스킬: ${jobInfoFromTavily.skills || '없음'}
- 직무 관련 자격증 요구: ${jobInfoFromTavily.certifications || '없음'}

`
        : ''

    const userPrompt = `[내담자 정보 - DB·상담 기반]
- 목표 직무: ${targetJob || '없음'}
- 전공: ${major || '없음'}
- 상담 분석 (강점, 관심, 가치관): ${analysisText || '없음'}
${tavilySection}위 정보(Tavily 직무정보 + DB·상담)를 종합하여 목표 직무에 도움이 되는 한국 국가기술자격·민간자격 3~5개를 맞춤형으로 추천해라. JSON만 출력.`

    try {
        const openai = new OpenAI({ apiKey: openaiApiKey })
        const model = getRoadmapModel()
        console.log('[자격증 OpenAI 폴백] Q-Net 실패 → OpenAI로 자격증 추천')
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

        const colors = [
            'text-blue-600 bg-blue-50',
            'text-green-600 bg-green-50',
            'text-orange-600 bg-orange-50',
            'text-purple-600 bg-purple-50',
            'text-red-600 bg-red-50',
        ]
        const statuses = ['취득 권장', '취득 추천', '관심 분야']

        return parsed.recommended.slice(0, 5).map((rec, i) => ({
            type: '자격증',
            name: rec.qualName,
            status: rec.relevanceScore >= 8 ? statuses[0] : rec.relevanceScore >= 6 ? statuses[1] : statuses[2],
            color: colors[i % colors.length],
            details: {
                description: rec.reason || `${rec.qualName}에 관한 국가기술자격증입니다.`,
                examScheduleWritten: '',
                examSchedulePractical: '',
                difficulty: '난이도: 중',
                written: '필기: 100점 만점에 60점 이상',
                practical: '실기: 100점 만점에 60점 이상',
            },
        }))
    } catch (error) {
        console.error('[자격증 OpenAI 폴백] 에러:', error)
        return []
    }
}

/** 로드맵 생성 시 사용 - Tavily + DB·상담 + OpenAI 기반 자격증 추천 (단일 진입점). 학력·경력 반영. */
export async function getCertificationsForRoadmap(opts: {
    targetJob: string
    major: string
    analysisList: Array<{ strengths?: string; interest_keywords?: string; career_values?: string }>
    jobInfoFromTavily?: { jobTitle: string; requirements?: string; trends?: string; skills?: string; certifications?: string } | null
    education_level?: string
    work_experience_years?: number
    examScheduleTavilyFallback?: { summary?: string; url?: string }
    getAllQualifications?: () => Promise<unknown[]>
    getExamSchedule?: () => Promise<unknown[]>
}): Promise<Array<{
    type: string
    name: string
    status: string
    color: string
    details?: { written?: string; practical?: string; difficulty?: string; examSchedule?: string; examScheduleWritten?: string; examSchedulePractical?: string; description?: string }
}>> {
    const { targetJob, major, analysisList, jobInfoFromTavily, education_level = '', work_experience_years = 0, examScheduleTavilyFallback, getAllQualifications = () => Promise.resolve([]), getExamSchedule = () => Promise.resolve([]) } = opts
    const [qualifications, examSchedule] = await Promise.all([
        getAllQualifications(),
        getExamSchedule(),
    ])

    if (qualifications.length === 0) {
        return getCertificationsFromOpenAIFallback({
            targetJob,
            major,
            analysisList,
            jobInfoFromTavily: jobInfoFromTavily ?? undefined,
        })
    }

    return recommendCertificationsWithRag({
        qualifications,
        examSchedule,
        targetJob,
        major,
        analysisList,
        jobInfoFromTavily: jobInfoFromTavily ?? undefined,
        education_level,
        work_experience_years,
        examScheduleTavilyFallback,
    })
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
