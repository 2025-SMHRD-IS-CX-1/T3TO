import type { RagRoadmapResult } from './roadmap-types'

/** Context 활용도·Faithfulness 평가 (Citation 포함 여부, 환각 검증). 모델 테스트용 로그 출력 */
export function evaluateContextUtilization(
    parsed: RagRoadmapResult,
    context: { hasCompanyWeb: boolean; hasJobWeb: boolean; allowedCompanyNames: string[] }
): { citationCount: number; citationIncluded: boolean; faithfulnessScore: number; details: string[] } {
    const details: string[] = []
    const citations = Array.isArray(parsed?.citations_used) ? parsed.citations_used : []
    const citationCount = citations.length
    const citationIncluded = citationCount > 0
    details.push(`citation 개수: ${citationCount}`)
    if (citationCount > 0) details.push(`citations_used: ${citations.slice(0, 5).join(' | ')}${citations.length > 5 ? ' ...' : ''}`)

    const allowed = new Set(context.allowedCompanyNames.map((n) => n.trim().toLowerCase()).filter(Boolean))
    const fullText = [
        parsed?.summary ?? '',
        ...(parsed?.plan ?? []).flatMap((s) => [(s as { 단계?: string }).단계 ?? '', ...((s as { 추천활동?: string[] }).추천활동 ?? [])].join(' ')),
    ].join(' ')
    const mentionedCompanies: string[] = []
    const koreanCompanyPattern = /(네이버|카카오|카카오엔터프라이즈|삼성|삼성전자|현대|현대자동차|LG|SK|쿠팡|토스|라인|배달의민족|우아한형제들|당근|비트코인|엔씨소프트|크래프톤|펄어비스|하이브|SM|JYP|CJ|한화|롯데|POSCO|포스코|두산|GS|KT|SK텔레콤)(?!\w)/gi
    let m: RegExpExecArray | null
    const companyRegex = new RegExp(koreanCompanyPattern.source, 'gi')
    while ((m = companyRegex.exec(fullText)) !== null) {
        const name = m[1].toLowerCase()
        if (!mentionedCompanies.includes(name)) mentionedCompanies.push(name)
    }
    const allowedNormalized = context.allowedCompanyNames.map((n) => n.trim().toLowerCase())
    const hallucinated = mentionedCompanies.filter((name) => {
        if (allowed.size === 0) return false
        const inAllowed = allowedNormalized.some((a) => name.includes(a) || a.includes(name))
        return !inAllowed
    })
    const faithfulnessScore = allowed.size === 0 ? 1 : hallucinated.length === 0 ? 1 : Math.max(0, 1 - hallucinated.length * 0.35)
    if (hallucinated.length > 0) details.push(`환각 가능 기업명(컨텍스트에 없음): ${hallucinated.join(', ')}`)
    details.push(`Faithfulness score: ${(faithfulnessScore * 100).toFixed(0)}%`)

    return { citationCount, citationIncluded, faithfulnessScore, details }
}

/** 로드맵 LLM 출력 정확성·품질 간이 평가 (로그용). 반환: 0~100 점수 + 실패 항목 */
export function evaluateRoadmapOutput(parsed: RagRoadmapResult): { score: number; checks: { ok: boolean; label: string }[] } {
    const checks: { ok: boolean; label: string }[] = []
    const hasPlan = Array.isArray(parsed?.plan) && parsed.plan.length >= 3
    checks.push({ ok: hasPlan, label: 'plan 3단계 이상' })
    const hasSummary = typeof parsed?.summary === 'string' && parsed.summary.trim().length > 0
    checks.push({ ok: hasSummary, label: 'summary 존재' })
    let stepsValid = true
    if (hasPlan && parsed.plan) {
        for (let i = 0; i < parsed.plan.length; i++) {
            const step = parsed.plan[i] as Record<string, unknown>
            const hasTitle = typeof step?.단계 === 'string' && (step.단계 as string).trim().length > 0
            const hasActivities = Array.isArray(step?.추천활동) && (step.추천활동 as unknown[]).length > 0
            if (!hasTitle || !hasActivities) stepsValid = false
        }
    } else {
        stepsValid = false
    }
    checks.push({ ok: stepsValid, label: '단계별 제목·추천활동 존재' })
    const passed = checks.filter((c) => c.ok).length
    const score = checks.length ? Math.round((passed / checks.length) * 100) : 0
    return { score, checks }
}
