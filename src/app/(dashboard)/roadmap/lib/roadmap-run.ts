/**
 * 로드맵 단일 진입점. RAG 시도 후 실패 시 규칙 기반 fallback.
 */
import OpenAI from 'openai'
import type { RoadmapAdapters, RoadmapRagContext, RunRoadmapResult } from './roadmap-adapters'
import { generateRoadmapWithRag } from './roadmap-rag-generate'
import { ragPlanToMilestones } from './roadmap-milestones'
import { buildRuleBasedRoadmap } from './roadmap-rule-based'
import { computeCompetenciesFromProfile } from './roadmap-competencies'

const SEARCH_TIMEOUT_MS = 10000
const QNET_TIMEOUT_MS = 15000

export async function runRoadmap(
    userData: RoadmapRagContext,
    adapters: RoadmapAdapters
): Promise<RunRoadmapResult> {
    const profileRow = (userData.profile?.[0] || {}) as Record<string, unknown>
    const clientData = {
        recommended_careers: String(profileRow.recommended_careers ?? profileRow.target_job ?? ''),
        target_company: String(profileRow.target_company ?? ''),
        major: String(profileRow.major ?? ''),
        education_level: String(profileRow.education_level ?? ''),
        work_experience_years: typeof profileRow.work_experience_years === 'number' ? profileRow.work_experience_years : 0,
        work_experience: profileRow.work_experience != null ? String(profileRow.work_experience) : undefined,
    }

    if (adapters.openaiApiKey) {
        let companyInfoText = ''
        let jobInfoText = ''
        let companyInfosResult: Awaited<ReturnType<NonNullable<RoadmapAdapters['searchCompany']>>> = []
        let jobInfoResult: Awaited<ReturnType<NonNullable<RoadmapAdapters['searchJob']>>> = null

        const companyNames = (clientData.target_company || '')
            .split(/[,，、]/)
            .map((c) => c.trim())
            .filter(Boolean)
        const jobTitle = clientData.recommended_careers || ''

        const [companyInfos, jobInfo] = await Promise.race([
            Promise.all([
                companyNames.length && adapters.searchCompany ? adapters.searchCompany(companyNames) : Promise.resolve([]),
                jobTitle && adapters.searchJob ? adapters.searchJob(jobTitle) : Promise.resolve(null),
            ]),
            new Promise<[typeof companyInfosResult, typeof jobInfoResult]>((resolve) =>
                setTimeout(() => resolve([[], null]), SEARCH_TIMEOUT_MS)
            ),
        ])
        companyInfosResult = companyInfos
        jobInfoResult = jobInfo

        if (companyInfosResult.length > 0) {
            companyInfoText = companyInfosResult
                .map(
                    (c) =>
                        `[${c.companyName}]\n인재상: ${c.talentProfile || ''}\n채용: ${c.recruitmentInfo || ''}\n기술스택: ${c.techStack || ''}`
                )
                .join('\n\n')
        }
        if (jobInfoResult) {
            jobInfoText = [jobInfoResult.requirements, jobInfoResult.skills, (jobInfoResult as { description?: string }).description]
                .filter(Boolean)
                .join('\n')
        }

        const openai = new OpenAI({ apiKey: adapters.openaiApiKey })
        const model = adapters.model ?? 'gpt-4o-mini'
        const ragResult = await generateRoadmapWithRag(userData, {
            openai,
            model,
            companyInfoText,
            jobInfoText,
            companyInfosResult,
            jobInfoResult,
        })

        if (ragResult?.plan?.length) {
            // RAG 결과에서 자격증 이름 추출 (마일스톤이나 추천 자격증 섹션이 있다면 활용)
            // 현재 구조상 plan 내부에 명시적인 자격증 필드가 없을 수 있으므로, 전체 텍스트에서 유추하거나
            // ragResult의 다른 필드를 활용해야 함.
            // 우선 plan의 각 항목에서 '자격증' 관련 키워드가 있는 경우 추출 시도.
            const potentialCertNames: string[] = []

            // 1. Plan 내 마일스톤 제목/내용에서 추출
            ragResult.plan.forEach((item: any) => {
                if (item.milestone_title) potentialCertNames.push(item.milestone_title)
                // 필요 시 detailed_content 등에서도 추출 가능하나, 정확도를 위해 제목 위주로.
            })

            // 2. Client Data의 추천 직무 기반 키워드 추가 (보완)
            if (clientData.recommended_careers) {
                potentialCertNames.push(clientData.recommended_careers)
            }

            // 3. 직무별 기본 추천 자격증 추가 (roadmap-milestones.ts 로직과 일치)
            const targetJob = clientData.recommended_careers || ''
            const isDevCareer = /개발|엔지니어|소프트웨어|프로그래머/i.test(targetJob)
            const isDataCareer = /데이터|분석|AI|인공지능/i.test(targetJob)
            const isCivilCareer = /토목|건설|측량|건축|구조/i.test(targetJob)
            const isSafetyCareer = /안전|산업안전|건설안전/i.test(targetJob)
            const isMechCareer = /기계|자동차|메카트로닉스/i.test(targetJob)
            const isElecCareer = /전기|전자|전기기사|전자기사/i.test(targetJob)

            if (isDataCareer) {
                potentialCertNames.push('ADsP', '데이터분석', 'SQLD', 'SQL', '빅데이터분석기사')
            } else if (isCivilCareer) {
                potentialCertNames.push('토목기사', '건설기사', '측량기사', '건설안전기사')
            } else if (isSafetyCareer) {
                potentialCertNames.push('산업안전기사', '건설안전기사', '소방설비기사', '위험물기능사')
            } else if (isMechCareer) {
                potentialCertNames.push('기계기사', '자동차정비기사', '용접기사', '건설기계기사')
            } else if (isElecCareer) {
                potentialCertNames.push('전기기사', '전자기사', '전기공사기사', '산업계측기사')
            } else {
                // 개발 직무 또는 기본
                potentialCertNames.push('정보처리기사', 'ADsP', 'SQLD', '컴퓨터활용능력')
            }

            const [qualifications, examSchedule] = await Promise.race([
                Promise.all([
                    adapters.getQualifications?.() ?? Promise.resolve([]),
                    adapters.getExamSchedule?.(potentialCertNames) ?? Promise.resolve([]),
                ]),
                new Promise<[unknown[], unknown[]]>((resolve) =>
                    setTimeout(() => resolve([[], []]), QNET_TIMEOUT_MS)
                ),
            ])
            const first = ragResult.plan[0] as Record<string, unknown>
            first.자격정보 = (qualifications as unknown[]).slice(0, 3)
            first.시험일정 = (examSchedule as unknown[]).slice(0, 3)
            first['산업분야/대표기업'] = (first['산업분야/대표기업'] as string[]) || ['삼성전자', '현대자동차', '네이버']

            const analysisRows = (userData.analysis || []) as Array<{ strengths?: string; interest_keywords?: string; career_values?: string }>
            const mapped = ragPlanToMilestones(
                ragResult,
                clientData,
                qualifications as unknown[],
                examSchedule as unknown[],
                ragResult.companyInfos,
                analysisRows
            )
            const profileForCompetencies = {
                major: clientData.major,
                education_level: clientData.education_level,
                work_experience_years: clientData.work_experience_years,
            }
            const dynamicSkills = computeCompetenciesFromProfile(
                profileForCompetencies,
                analysisRows,
                mapped.targetJob,
                mapped.targetCompany,
                ragResult.jobRequirementsText
            )
            return {
                info: mapped.info,
                dynamicSkills,
                dynamicCerts: mapped.dynamicCerts,
                targetJob: mapped.targetJob,
                targetCompany: mapped.targetCompany,
            }
        }
    }

    return buildRuleBasedRoadmap(clientData, userData, adapters)
}
