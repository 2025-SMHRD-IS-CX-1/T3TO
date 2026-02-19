/**
 * RAG 기반 자격증 추천 - Hallucination 방지 및 맞춤형 추천
 * 실제 Q-Net API 결과만 사용하고, RAG로 필터링 및 우선순위 결정
 */
import OpenAI from 'openai'
import { getRoadmapModel } from '@/lib/ai-models'
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
        description?: string
    }
}>> {
    const { qualifications, examSchedule, targetJob, major, analysisList, jobInfoFromTavily } = opts

    if (qualifications.length === 0) {
        console.log('[자격증 RAG] Q-Net API 결과가 없어 추천을 건너뜁니다')
        return []
    }

    // roadmap-prompts.ts의 메인 프롬프트 구조 활용 (Tavily 직무정보 포함)
    const userPrompt = buildCertificationRecommendationContext({
        targetJob,
        major,
        analysisList,
        qualifications,
        jobInfoFromTavily,
    })

    try {
        const openaiApiKey = process.env.OPENAI_API_KEY
        if (!openaiApiKey) {
            console.warn('[자격증 RAG] OPENAI_API_KEY가 없어 키워드 기반 필터링으로 대체합니다')
            return fallbackToKeywordFiltering(opts)
        }

        const openai = new OpenAI({ apiKey: openaiApiKey })
        const model = getRoadmapModel()

        console.log('[자격증 RAG] LLM 호출 시작 - 자격증 수:', qualifications.length)
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
                description?: string
            }
        }> = []

        const seenNames = new Set<string>()

        for (const rec of parsed.recommended.slice(0, 5)) {
            // 실제 자격증 목록에서 매칭
            const matchedQual = qualifications.find((qual) => {
                if (!qual || typeof qual !== 'object') return false
                const qualObj = qual as Record<string, unknown>
                const qualName = String(qualObj.qualName || qualObj.qualNm || qualObj.name || qualObj.jmfldnm || '').trim()
                return qualName === rec.qualName || qualName.includes(rec.qualName) || rec.qualName.includes(qualName)
            })

            if (!matchedQual || seenNames.has(rec.qualName)) continue

            const qualObj = matchedQual as Record<string, unknown>
            const qualName = String(qualObj.qualName || qualObj.qualNm || qualObj.name || qualObj.jmfldnm || '').trim()
            const qualDesc = String(qualObj.description || qualObj.desc || qualObj.qualDesc || qualObj.obligfldnm || qualObj.mdobligfldnm || '').trim()

            // 시험 일정 찾기
            let examScheduleInfo = ''
            for (const exam of examSchedule) {
                if (!exam || typeof exam !== 'object') continue
                const examObj = exam as Record<string, unknown>
                const examQualName = String(examObj.qualName || examObj.qualNm || examObj.jmfldnm || examObj.description || '').trim()
                const examDate = String(examObj.docExamDt || examObj.pracExamStartDt || examObj.examDate || examObj.implYmd || '').trim()
                const qualLower = qualName.toLowerCase()
                const matches = examQualName && (qualLower.includes(examQualName.toLowerCase()) || examQualName.toLowerCase().includes(qualLower) || (/기사|산업기사/.test(examQualName) && qualLower.includes('기사')))
                if (matches && examDate) {
                    examScheduleInfo = `시험일정: ${examDate}`
                    break
                }
            }

            const colors = [
                'text-blue-600 bg-blue-50',
                'text-green-600 bg-green-50',
                'text-orange-600 bg-orange-50',
                'text-purple-600 bg-purple-50',
                'text-red-600 bg-red-50',
            ]
            const statuses = ['취득 권장', '준비 중', '관심 분야']

            recommendedCerts.push({
                type: '자격증',
                name: qualName,
                status: rec.relevanceScore >= 8 ? statuses[0] : rec.relevanceScore >= 6 ? statuses[1] : statuses[2],
                color: colors[recommendedCerts.length % colors.length],
                details: {
                    description: rec.reason || qualDesc || `${qualName}에 관한 국가기술자격증입니다.`,
                    examSchedule: examScheduleInfo || '시험일정: Q-Net 공식 사이트 확인',
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
    details?: { written?: string; practical?: string; difficulty?: string; examSchedule?: string; description?: string }
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
        const statuses = ['취득 권장', '준비 중', '관심 분야']

        return parsed.recommended.slice(0, 5).map((rec, i) => ({
            type: '자격증',
            name: rec.qualName,
            status: rec.relevanceScore >= 8 ? statuses[0] : rec.relevanceScore >= 6 ? statuses[1] : statuses[2],
            color: colors[i % colors.length],
            details: {
                description: rec.reason || `${rec.qualName}에 관한 국가기술자격증입니다.`,
                examSchedule: '시험일정: Q-Net(www.q-net.or.kr) 공식 사이트 확인',
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

/** 로드맵 생성 시 사용 - Tavily + DB·상담 + Q-Net/OpenAI 기반 자격증 추천 (단일 진입점) */
export async function getCertificationsForRoadmap(opts: {
    targetJob: string
    major: string
    analysisList: Array<{ strengths?: string; interest_keywords?: string; career_values?: string }>
    jobInfoFromTavily?: { jobTitle: string; requirements?: string; trends?: string; skills?: string; certifications?: string } | null
    getAllQualifications: () => Promise<unknown[]>
    getExamSchedule: () => Promise<unknown[]>
}): Promise<Array<{
    type: string
    name: string
    status: string
    color: string
    details?: { written?: string; practical?: string; difficulty?: string; examSchedule?: string; description?: string }
}>> {
    const { targetJob, major, analysisList, jobInfoFromTavily, getAllQualifications, getExamSchedule } = opts
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
        extractedKw
    )
}
