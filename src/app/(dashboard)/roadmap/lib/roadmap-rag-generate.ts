/**
 * RAG 기반 로드맵 LLM 생성. 어댑터로 주입된 openai·컨텍스트만 사용 (독립 모듈용).
 */
import type OpenAI from 'openai'
import type { RagRoadmapResult, CompanyInfo, JobInfo } from './roadmap-types'
import { evaluateContextUtilization, evaluateRoadmapOutput } from './roadmap-evaluation'
import { ROADMAP_SYSTEM_PROMPT, buildRoadmapUserContext } from './roadmap-prompts'

export interface GenerateRoadmapWithRagOpts {
    openai: OpenAI
    model: string
    companyInfoText: string
    jobInfoText: string
    companyInfosResult: CompanyInfo[]
    jobInfoResult: JobInfo | null
}

export async function generateRoadmapWithRag(
    userData: { counseling: unknown[]; analysis: unknown[]; profile: unknown[]; roadmap: unknown[] },
    opts: GenerateRoadmapWithRagOpts
): Promise<RagRoadmapResult | null> {
    const { openai, model, companyInfoText, jobInfoText, companyInfosResult, jobInfoResult } = opts
    const profile = (userData.profile?.[0] || {}) as Record<string, unknown>
    const targetJobFromProfile = (profile.recommended_careers ?? profile.target_job ?? '') as string
    const targetCompanyFromProfile = (profile.target_company ?? '') as string

    const context = buildRoadmapUserContext({
        targetJobFromProfile,
        targetCompanyFromProfile,
        jobInfoText,
        companyInfoText,
        userData,
    })

    try {
        console.log('[Roadmap RAG] LLM 호출 시작 - 컨텍스트 길이:', context.length)
        const res = await openai.chat.completions.create({
            model,
            messages: [
                { role: 'system', content: ROADMAP_SYSTEM_PROMPT },
                { role: 'user', content: context },
            ],
            temperature: 0,
        })
        const text = res.choices[0]?.message?.content?.trim() || ''
        console.log('[Roadmap RAG] LLM 응답 받음 - 길이:', text.length, '처음 200자:', text.slice(0, 200))
        let jsonStr = text
        if (text.startsWith('```')) {
            const lines = text.split('\n')
            jsonStr = lines[0].includes('json') ? lines.slice(1, -1).join('\n') : text
        }
        const parsed = JSON.parse(jsonStr) as RagRoadmapResult
        console.log('[Roadmap RAG] JSON 파싱 성공 - plan 수:', parsed?.plan?.length || 0)
        const evalResult = evaluateRoadmapOutput(parsed)
        console.log(
            '[Roadmap RAG] 정확성 평가:',
            evalResult.score + '점',
            evalResult.checks.map((c) => (c.ok ? '✓' : '✗') + c.label).join(', ')
        )
        const allowedCompanies = (targetCompanyFromProfile || '')
            .split(/[,，、]/)
            .map((c) => c.trim())
            .filter(Boolean)
        const contextEval = evaluateContextUtilization(parsed, {
            hasCompanyWeb: companyInfoText.length > 0,
            hasJobWeb: jobInfoText.length > 0,
            allowedCompanyNames: allowedCompanies,
        })
        console.log(
            '[Roadmap RAG] Context 활용도 평가:',
            'citation 수=' + contextEval.citationCount,
            'citation 포함=' + contextEval.citationIncluded,
            'Faithfulness=' + (contextEval.faithfulnessScore * 100).toFixed(0) + '%',
            contextEval.details.join(' | ')
        )
        const jobRequirementsText =
            jobInfoResult != null && (jobInfoResult.requirements ?? jobInfoResult.skills)
                ? [jobInfoResult.requirements, jobInfoResult.skills]
                      .filter(Boolean)
                      .join(' · ')
                      .trim()
                      .replace(/\s+/g, ' ')
                      .slice(0, 400)
                : undefined
        return {
            ...parsed,
            companyInfos: companyInfosResult.length > 0 ? companyInfosResult : undefined,
            jobRequirementsText: jobRequirementsText || undefined,
        }
    } catch (e) {
        console.error('[Roadmap RAG] LLM 에러 발생:', e)
        if (e instanceof Error) {
            console.error('[Roadmap RAG] 에러 메시지:', e.message)
            console.error('[Roadmap RAG] 에러 스택:', e.stack)
        }
        return null
    }
}
