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
const QNET_TIMEOUT_MS = 5000

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
            const [qualifications, examSchedule] = await Promise.race([
                Promise.all([
                    adapters.getQualifications?.() ?? Promise.resolve([]),
                    adapters.getExamSchedule?.() ?? Promise.resolve([]),
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
