'use server'

import { createClient, getEffectiveUserId } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { createInitialRoadmap } from '../roadmap/actions'
import OpenAI from 'openai'
import { getCoverLetterModel } from '@/lib/ai-models'

/** 자기소개서 본문에서 시스템 플레이스홀더·부적절한 문구 제거 */
function sanitizeDraftContent(text: string): string {
    if (!text || typeof text !== 'string') return text
    return text
        .split('\n')
        .filter(line => {
            const t = line.trim()
            if (!t) return true
            if (/\[기지란\s*공백\s*보전\]/i.test(t)) return false
            if (/\[기존\s*공백\s*보전\]/i.test(t)) return false
            if (/^\[.*초안\]\s*$/i.test(t)) return false
            return true
        })
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

/** 단락마다 첫 줄 들여쓰기 추가 (실제 작성한 문서처럼) — 전각 공백 1칸 */
function addParagraphIndentation(text: string): string {
    if (!text || typeof text !== 'string') return text
    // 단순히 \n 하나만 있는 경우는 문단으로 취급하지 않고, 연속된 줄바꿈(\n\n 이상)이 있을 때만 문단으로 분리
    const paragraphs = text.split(/\n\s*\n+/)
    const indent = '\u3000' // 전각 공백
    return paragraphs
        .map(p => {
            const trimmed = p.trim()
            if (!trimmed) return ''
            // 이미 들여쓰기가 되어있지 않은 경우에만 추가
            return (trimmed.startsWith(indent) ? '' : indent) + trimmed
        })
        .filter(Boolean)
        .join('\n\n')
}

/** 상담 분석 문구가 placeholder일 때 제거 (실제 강점/가치관만 사용) */
function useInsightLine(insights: string, lineIndex: number, fallback: string): string {
    if (!insights) return fallback
    const line = insights.split('\n')[lineIndex]?.trim()
    if (!line || line.includes('추가로 파악할 예정')) return fallback
    return line.replace(/^(강점|가치관):\s*/i, '').trim() || fallback
}

/** RAG 컨텍스트 문자열 생성. (실제 RAG 백엔드 연동 시 검색 결과로 교체) */
function buildRagContext(params: {
    targetJob: string
    competencies: string[]
    insights: string
    consultationSummary?: string
    clientName?: string
    major?: string
}): string {
    const { targetJob, competencies, insights, consultationSummary, clientName, major } = params
    const lines: string[] = []
    lines.push(`[지원 직무] ${targetJob}`)
    if (competencies.length) lines.push(`[직무 역량] ${competencies.join(', ')}`)
    if (insights?.trim()) lines.push(`[상담 요약] ${insights.trim()}`)
    if (consultationSummary?.trim()) lines.push(`[상담 내용 요약] ${consultationSummary.slice(0, 300).trim()}${consultationSummary.length > 300 ? '...' : ''}`)
    if (clientName?.trim()) lines.push(`[지원자] ${clientName}`)
    if (major?.trim()) lines.push(`[전공/학력] ${major}`)
    lines.push('')
    lines.push('[STAR 템플릿] 상황(Situation)-과제(Task)-행동(Action)-결과(Result) 순으로 경험을 서술하면 설득력이 높습니다.')
    lines.push('[CAR 템플릿] 맥락(Context)-행동(Action)-결과(Result) 구조로 구체적 성과를 강조할 수 있습니다.')
    lines.push('[SOAR 템플릿] 상황(Situation)-목표(Objective)-행동(Action)-성과(Result)로 성과 중심 서술에 적합합니다.')
    return lines.join('\n')
}

/** 기본 템플릿 3종 (각 500자 이상) */
function getTemplateVersions(
    profile: { client_name: string; major?: string; education_level?: string },
    targetJob: string,
    insights: string
): { type: string; title: string; content: string }[] {
    const majorLabel = (profile.major && profile.major.trim() && !/^text$/i.test(profile.major))
        ? profile.major.trim()
        : (profile.education_level || '해당 분야')
    const strengthLine = useInsightLine(insights, 0, '실무 역량')
    const valueLine = useInsightLine(insights, 1, '책임감과 소통')
    return [
        {
            type: 'Version 1',
            title: `${targetJob} - 역량 중심`,
            content: `안녕하세요, ${targetJob} 지원자 ${profile.client_name}입니다.\n\n저는 ${majorLabel}을 통해 다져온 기초 지식과 ${strengthLine}을 바탕으로 팀에 기여하고 싶습니다. 특히 복잡한 문제를 논리적으로 해결하는 것에 강점이 있으며, 팀과 함께 성과를 내는 것을 중요하게 생각합니다. 지원 직무에 필요한 역량을 꾸준히 쌓아왔으며, 프로젝트와 실무 경험을 통해 데이터 기반의 사고와 실행력을 키워왔습니다. 당시 주어진 과제를 단순히 수행하는 데 그치지 않고, 문제의 구조를 파악하고 핵심 이슈를 정의하는 데 집중했으며, 그 과정에서 팀 내 소통과 협업의 중요성을 체득했습니다. 새로운 기술과 도메인을 배울 때에도 핵심 개념을 먼저 이해하고, 이를 실제 업무에 적용해 보며 검증하는 방식을 유지해 왔습니다. 앞으로도 직무 역량을 꾸준히 보완하며, 귀사에 도움이 되는 인재로 남고 싶습니다. 입사 후에는 주어진 업무를 성실히 수행하는 것을 넘어, 동료들과 협업하며 조직의 성장에 기여하고, 끊임없이 배우며 성장하는 구성원이 되겠습니다. 귀사의 ${targetJob} 직무에 제가 쌓아온 역량이 잘 맞을 것으로 확신하며, 기회를 주시면 보답하겠습니다.`
        },
        {
            type: 'Version 2',
            title: `${targetJob} - 경험 중심`,
            content: `안녕하세요, ${profile.client_name}입니다.\n\n저의 강점인 ${strengthLine}을 실무와 팀 활동에서 발휘해 온 경험을 바탕으로 말씀드립니다. ${strengthLine}을 살릴 수 있는 프로젝트와 과제에 적극 참여하며, 목표 설정과 일정 조율을 맡아 결과물을 완성해 온 경험이 있습니다. 사용자나 동료의 피드백을 반영해 개선했던 일, 일정 지연 시 원인을 함께 분석하고 대안을 모색했던 역할도 경험했습니다. 팀 내에서 주도적으로 아이디어를 제안하고 실행에 옮겼던 경험, 난관이 있을 때 자료 조사와 논의를 통해 해결 방안을 도출했던 경험도 있습니다. 이러한 경험이 귀사 ${targetJob} 직무에서 기여로 이어질 수 있다고 믿으며, 입사 후에는 제 강점을 바탕으로 빠르게 적응해 팀에 실질적인 가치를 더하는 인재가 되겠습니다. 귀사의 일원으로 성장할 수 있는 기회를 주시면 감사하겠습니다.`
        },
        {
            type: 'Version 3',
            title: `${targetJob} - 가치관 중심`,
            content: `함께 성장하는 즐거움을 아는 ${profile.client_name}입니다.\n\n저의 핵심 가치관은 ${valueLine}입니다. 기술적인 완성도뿐만 아니라 동료와의 원활한 협업을 통해 시너지를 내는 것을 중요하게 생각하며, 귀사의 문화와 방향성에 맞춰 기여하고 싶습니다. 실패와 한계를 성장의 기회로 바라보고, 피드백을 적극 수용하며 스스로를 개선해 나가는 편입니다. 주어진 역할에 최선을 다하는 동시에 주변과 소통해 함께 더 나은 결과를 만드는 것을 지향하고, 새로운 도구나 방법을 접할 때에도 효과와 한계를 비판적으로 바라보려 노력해 왔습니다. 일과 삶의 균형을 유지하면서도 맡은 일에 책임감을 갖는 것을 소중히 여기며, 팀의 목표를 위해 필요한 때에는 유연하게 협력하는 자세를 갖추고 있습니다. 귀사에서도 제 가치관을 바탕으로 팀에 신뢰와 동기를 더하는 구성원이 되겠습니다. 기회를 주시면 감사하겠습니다.`
        }
    ]
}

export async function getDrafts(profileId?: string, counselorId?: string | null) {
    const supabase = await createClient()
    const userIdStr = await getEffectiveUserId(counselorId)
    if (!userIdStr) return []

    // user_id 컬럼 유무와 관계없이 동작: 해당 상담사의 roadmap_id 목록으로 draft 조회
    const { data: roadmaps } = await supabase
        .from('career_roadmaps')
        .select('roadmap_id')
        .eq('user_id', userIdStr)
    const roadmapIds = (roadmaps || []).map((r: { roadmap_id: string }) => r.roadmap_id)
    if (roadmapIds.length === 0) return []

    let query = supabase
        .from('resume_drafts')
        .select('*, career_roadmaps(user_id, target_job)')
        .in('roadmap_id', roadmapIds)

    if (profileId) {
        query = query.eq('profile_id', profileId)
    }

    const { data, error } = await query.order('created_at', { ascending: false })

    if (error) {
        console.error('Error fetching drafts:', error?.message ?? 'Unknown error', error?.code, error?.details)
        return []
    }

    const list = data ?? []
    // 최신 3개만 유지, 그 외 예전 버전은 DB에서 삭제
    const latest = list.slice(0, 3)
    const toDelete = list.slice(3)
    if (toDelete.length > 0) {
        const idsToDelete = toDelete.map((d: { draft_id: string }) => d.draft_id)
        await supabase.from('resume_drafts').delete().in('draft_id', idsToDelete)
    }

    return latest.map((draft: any) => ({
        id: draft.draft_id,
        title: draft.target_position || (Array.isArray(draft.career_roadmaps) ? draft.career_roadmaps[0]?.target_job : draft.career_roadmaps?.target_job) || '제목 없음',
        date: new Date(draft.created_at).toLocaleDateString(),
        content: draft.draft_content,
        tags: [draft.version_type]
    }))
}

/** 자기소개서 적합도 점수용 컨텍스트 (내담자·직무·역량 정보) */
export type DraftScoringContext = {
    targetJob: string
    targetCompany?: string
    clientName: string
    major?: string
    competencies: string[]
    insights: string
}

/** 점수 산출용 컨텍스트 조회 (profileId + userIdStr 기준) */
async function getScoringContext(
    supabase: Awaited<ReturnType<typeof createClient>>,
    profileId: string,
    userIdStr: string
): Promise<DraftScoringContext | null> {
    const { data: profile } = await supabase
        .from('career_profiles')
        .select('client_name, major, education_level, work_experience')
        .eq('profile_id', profileId)
        .eq('user_id', userIdStr)
        .single()
    if (!profile) return null

    const { data: roadmap } = await supabase
        .from('career_roadmaps')
        .select('target_job, target_company, required_skills')
        .eq('profile_id', profileId)
        .eq('user_id', userIdStr)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    const targetJob = roadmap?.target_job || '직무'
    let competencies: string[] = []
    try {
        if (roadmap?.required_skills && typeof roadmap.required_skills === 'string') {
            const skills = JSON.parse(roadmap.required_skills) as { title?: string }[]
            competencies = (skills || []).map((s: { title?: string }) => s.title).filter((x): x is string => Boolean(x))
        }
    } catch {
        // ignore
    }
    if (competencies.length === 0) competencies = [targetJob + ' 역량', '문제해결', '커뮤니케이션']

    const { data: latestConsultation } = await supabase
        .from('consultations')
        .select('consultation_id')
        .eq('profile_id', profileId)
        .eq('user_id', userIdStr)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    let insights = ''
    if (latestConsultation?.consultation_id) {
        const { data: analysis } = await supabase
            .from('consultation_analysis')
            .select('strengths, career_values')
            .eq('consultation_id', latestConsultation.consultation_id)
            .maybeSingle()
        if (analysis) {
            insights = `강점: ${analysis.strengths}\n가치관: ${(analysis as { career_values?: string }).career_values ?? ''}`
        }
    }

    return {
        targetJob,
        targetCompany: roadmap?.target_company,
        clientName: profile.client_name ?? '지원자',
        major: profile.major ?? profile.education_level,
        competencies,
        insights: insights.trim(),
    }
}

/** 단일 초안에 대해 3가지 기준(각 100점)으로 LLM 평가 후 평균 백분율 반환 */
export async function scoreDraftContent(
    draftContent: string,
    context: DraftScoringContext
): Promise<{ score: number; typeSimilarity: number; competencyReflection: number; jobFit: number } | { error: string }> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return { error: 'OPENAI_API_KEY가 설정되지 않았습니다.' }
    const trimmed = typeof draftContent === 'string' ? draftContent.trim() : ''
    if (!trimmed) return { error: '평가할 초안 내용이 없습니다.' }

    const client = new OpenAI({ apiKey })
    const model = getCoverLetterModel()
    const systemPrompt = `당신은 채용 자기소개서 평가 전문가입니다. 주어진 자기소개서 초안을 아래 3가지 기준으로 각각 0~100점으로 평가한 뒤, 반드시 JSON만 한 줄로 출력하세요. 다른 설명이나 마크다운 없이 JSON만 출력합니다.

평가 기준:
1. typeSimilarity (자기소개서 유형 유사도): 일반적으로 채용에서 선호하는 자기소개서의 구조·스타일·톤(인사말, 역량/경험/가치관 서술, 마무리 등)과 얼마나 비슷한지 (100점 만점)
2. competencyReflection (적성·직무역량 반영도): 내담자의 적성, 강점, 직무 역량이 초안에 얼마나 구체적으로 반영되어 있는지 (100점 만점)
3. jobFit (추천 직무 적합도): 제시된 희망 직무/직업에 초안 내용이 얼마나 적합한지 (100점 만점)

출력 형식 (따옴표와 키 이름 정확히 유지): {"typeSimilarity":숫자,"competencyReflection":숫자,"jobFit":숫자}`

    const userContent = `[지원 직무] ${context.targetJob}${context.targetCompany ? ` / ${context.targetCompany}` : ''}
[지원자] ${context.clientName}${context.major ? ` (전공/학력: ${context.major})` : ''}
[직무 역량 키워드] ${context.competencies.join(', ')}
${context.insights ? `[상담 기반 강점·가치관]\n${context.insights}` : ''}

[평가할 자기소개서 초안]
${trimmed}`

    try {
        const res = await client.chat.completions.create({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userContent },
            ],
            temperature: 0.2,
            max_tokens: 256,
        })
        const raw = res.choices[0]?.message?.content?.trim() ?? ''
        const jsonMatch = raw.match(/\{[\s\S]*\}/)
        const jsonStr = jsonMatch ? jsonMatch[0] : raw
        const parsed = JSON.parse(jsonStr) as { typeSimilarity?: number; competencyReflection?: number; jobFit?: number }
        const a = Math.min(100, Math.max(0, Number(parsed.typeSimilarity) || 0))
        const b = Math.min(100, Math.max(0, Number(parsed.competencyReflection) || 0))
        const c = Math.min(100, Math.max(0, Number(parsed.jobFit) || 0))
        const score = Math.round((a + b + c) / 3)
        return { score, typeSimilarity: a, competencyReflection: b, jobFit: c }
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return { error: `점수 산출 실패: ${msg}` }
    }
}

/** 내담자별 초안 3개의 적합도 점수 조회 (클라이언트에서 호출, 점수 표시용) */
export async function getDraftScores(
    profileId: string | undefined,
    counselorId: string | null | undefined
): Promise<{ draftId: string; score: number; typeSimilarity: number; competencyReflection: number; jobFit: number }[]> {
    if (!profileId) return []
    const supabase = await createClient()
    const userIdStr = await getEffectiveUserId(counselorId)
    if (!userIdStr) return []

    const drafts = await getDrafts(profileId, counselorId)
    if (drafts.length === 0) return []

    const context = await getScoringContext(supabase, profileId, userIdStr)
    if (!context) return []

    const results = await Promise.all(
        drafts.map(async (draft) => {
            const out = await scoreDraftContent(draft.content, context)
            if ('error' in out) return { draftId: draft.id, score: 0, typeSimilarity: 0, competencyReflection: 0, jobFit: 0 }
            return { draftId: draft.id, score: out.score, typeSimilarity: out.typeSimilarity, competencyReflection: out.competencyReflection, jobFit: out.jobFit }
        })
    )
    return results
}

/** AI 다듬기: 본문을 자연스럽고 설득력 있게 수정 (실제 LLM 호출) */
export async function polishDraftContent(text: string): Promise<{ content?: string; error?: string }> {
    const trimmed = typeof text === 'string' ? text.trim() : ''
    if (!trimmed) return { error: '수정할 내용이 없습니다.' }
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return { error: 'OPENAI_API_KEY가 설정되지 않았습니다. .env.local에 OPENAI_API_KEY=sk-... 를 추가한 뒤 서버를 재시작해주세요.' }
    const client = new OpenAI({ apiKey })
    const model = getCoverLetterModel()
    try {
        const res = await client.chat.completions.create({
            model,
            messages: [
                {
                    role: 'system',
                    content:
                        '당신은 채용 자기소개서 문장을 다듬는 전문가입니다. 주어진 자기소개서 본문을 자연스럽게 수정해서 반환하세요. 핵심 내용은 유지하면서 다음을 반영합니다: 맞춤법·띄어쓰기 교정, 문맥이 매끄럽고 설득력 있게 다듬기, 어색한 표현 정리. 특히 사용자가 긴 분량(700~800자 이상)을 원하므로, 내용을 생략하지 말고 가능한 한 풍부하고 구체적인 문장으로 다듬어 주세요. 쉼표는 문장에서 꼭 필요한 곳에만 쓰고, 자연스러운 문장 흐름을 유지하세요. 다른 설명 없이 수정된 자기소개서 전문만 출력하세요.',
                },
                { role: 'user', content: trimmed },
            ],
            temperature: 0.5,
            max_tokens: 4096,
        })
        let content = res.choices[0]?.message?.content?.trim() ?? ''
        if (!content) return { error: 'AI가 수정된 내용을 반환하지 않았습니다.' }
        // 코드블록으로 감싼 경우 제거
        const codeBlock = content.match(/^```(?:text)?\s*\n?([\s\S]*?)\n?```$/m)
        if (codeBlock) content = codeBlock[1].trim()
        return { content }
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return { error: `AI 다듬기 실패: ${msg}` }
    }
}

export async function generateAIDrafts(clientId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: 'Unauthorized' }

    // 1. Fetch Client Profile
    const { data: profile, error: profileError } = await supabase
        .from('career_profiles')
        .select('*')
        .eq('profile_id', clientId)
        .eq('user_id', user.id)
        .single()

    if (profileError || !profile) {
        return { error: '내담자 프로필을 찾을 수 없습니다. 등록 정보를 확인해주세요.' }
    }

    // 2. Fetch or Create Active Roadmap
    let { data: roadmap } = await supabase
        .from('career_roadmaps')
        .select('*')
        .eq('profile_id', clientId)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (!roadmap) {
        // Create initial roadmap automatically if it doesn't exist
        const initResult = await createInitialRoadmap(clientId, profile)
        if (initResult.error) {
            return { error: '로드맵 초기화 중 오류가 발생했습니다: ' + initResult.error }
        }

        // Re-fetch the newly created roadmap
        const { data: newRoadmap } = await supabase
            .from('career_roadmaps')
            .select('*')
            .eq('profile_id', clientId)
            .eq('user_id', user.id)
            .eq('is_active', true)
            .single()
        roadmap = newRoadmap
    }

    if (!roadmap) {
        return { error: '로드맵을 생성할 수 없습니다.' }
    }

    // 2. 최신 상담 기록 + 상담 분석
    const { data: latestConsultation } = await supabase
        .from('consultations')
        .select('consultation_id, consultation_content')
        .eq('profile_id', clientId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    let insights = ""
    let consultationContent = ''
    let analysisStrengths: string[] = []
    let careerValues = ''
    if (latestConsultation?.consultation_id) {
        consultationContent = (latestConsultation as { consultation_content?: string }).consultation_content ?? ''
        const { data: latestAnalysis } = await supabase
            .from('consultation_analysis')
            .select('*')
            .eq('consultation_id', latestConsultation.consultation_id)
            .maybeSingle()
        if (latestAnalysis) {
            insights = `강점: ${latestAnalysis.strengths}\n가치관: ${latestAnalysis.career_values}`
            if (typeof latestAnalysis.strengths === 'string') {
                analysisStrengths = latestAnalysis.strengths.split(/[,，、\s]+/).filter(Boolean)
            }
            careerValues = typeof (latestAnalysis as { career_values?: string }).career_values === 'string'
                ? (latestAnalysis as { career_values: string }).career_values.trim()
                : ''
        }
    }

    const targetJob = roadmap.target_job || '프론트엔드 개발자'
    let competenciesFromRoadmap: string[] = []
    try {
        if (roadmap.required_skills && typeof roadmap.required_skills === 'string') {
            const skills = JSON.parse(roadmap.required_skills) as { title?: string }[]
            competenciesFromRoadmap = (skills || []).map((s: { title?: string }) => s.title).filter((x): x is string => Boolean(x))
        }
    } catch {
        // ignore
    }
    const competencies = competenciesFromRoadmap.length > 0
        ? competenciesFromRoadmap
        : analysisStrengths.length > 0
            ? analysisStrengths
            : [targetJob + ' 역량', '문제해결', '커뮤니케이션']

    // RAG 컨텍스트 생성 (파인튜닝/범용 LLM 생성 시 참고 자료로 전달)
    const ragContext = buildRagContext({
        targetJob,
        competencies,
        insights,
        consultationSummary: consultationContent,
        clientName: profile.client_name ?? undefined,
        major: profile.major ?? profile.education_level ?? undefined,
    })

    // 3. mk_resume_model API 우선 → RAG API → 템플릿
    const mkResumeApiUrl = process.env.MK_RESUME_MODEL_API_URL ?? ''
    const ragApiUrl = process.env.RAG_COVER_LETTER_API_URL ?? ''
    let versions: { type: string; title: string; content: string; scoring?: any }[] | null = null

    if (mkResumeApiUrl.trim()) {
        const baseUrl = mkResumeApiUrl.replace(/\/$/, '')
        const extractedBackground = {
            name: profile.client_name ?? null,
            education: profile.major ?? profile.education_level ?? null,
            experiences: (profile.work_experience && String(profile.work_experience).trim())
                ? [String(profile.work_experience).trim()]
                : [],
            strengths: analysisStrengths.length > 0 ? analysisStrengths : null,
            career_values: careerValues || undefined,
        }
        const payload = (focus: string) => ({
            counseling: {
                content: consultationContent || '상담 기록이 아직 없습니다. 프로필과 로드맵 정보를 바탕으로 작성합니다.',
                session_date: null,
                notes: null,
            },
            ai_analysis: {
                roles: [targetJob],
                competencies,
                extracted_background: extractedBackground,
            },
            language: 'ko',
            min_word_count: 1000,
            focus,
            rag_context: ragContext,
        })
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 120_000)
        try {
            const [res1, res2, res3] = await Promise.all([
                fetch(`${baseUrl}/api/self-intro/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload('strength')),
                    signal: controller.signal,
                }),
                fetch(`${baseUrl}/api/self-intro/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload('experience')),
                    signal: controller.signal,
                }),
                fetch(`${baseUrl}/api/self-intro/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload('values')),
                    signal: controller.signal,
                }),
            ])
            clearTimeout(timeoutId)
            if (res1.ok && res2.ok && res3.ok) {
                const [data1, data2, data3] = await Promise.all([
                    res1.json() as Promise<any>,
                    res2.json() as Promise<any>,
                    res3.json() as Promise<any>,
                ])
                const d1 = (data1?.draft ?? '').trim()
                const d2 = (data2?.draft ?? '').trim()
                const d3 = (data3?.draft ?? '').trim()
                if (d1 && d2 && d3) {
                    versions = [
                        { type: 'Version 1', title: `${targetJob} - 역량 중심`, content: d1, scoring: data1?.scoring },
                        { type: 'Version 2', title: `${targetJob} - 경험 중심`, content: d2, scoring: data2?.scoring },
                        { type: 'Version 3', title: `${targetJob} - 가치관 중심`, content: d3, scoring: data3?.scoring },
                    ]
                } else {
                    console.warn('mk_resume_model API response ok but draft is empty')
                }
            } else {
                console.error('mk_resume_model API call failed status:', res1.status, res2.status, res3.status)
                try {
                    const err1 = await res1.text(); console.error('Error1:', err1)
                    const err2 = await res2.text(); console.error('Error2:', err2)
                    const err3 = await res3.text(); console.error('Error3:', err3)
                } catch (e) { /* ignore */ }
            }
        } catch (e) {
            clearTimeout(timeoutId)
            console.error('mk_resume_model API network error or timeout:', e)
        }
    }

    // 3-2. RAG API (LangChain/Chroma 기반 로컬 서버) 시도
    if ((versions == null || versions.length === 0) && ragApiUrl.trim()) {
        try {
            const res = await fetch(ragApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client_name: profile.client_name,
                    major: profile.major ?? '',
                    target_job: targetJob,
                    insights,
                    age_group: profile.age_group,
                    education_level: profile.education_level,
                }),
            })
            if (res.ok) {
                const data = await res.json()
                if (data?.drafts && Array.isArray(data.drafts) && data.drafts.length >= 3) {
                    versions = data.drafts.slice(0, 3).map((d: any) => ({
                        type: d.type ?? 'Version',
                        title: d.title ?? targetJob,
                        content: d.content ?? '',
                        // RAG 경로에서는 아직 정량 스코어를 계산하지 않으므로 점수는 비워둔다.
                        scoring: d.scoring ?? null,
                    }))
                }
            }
        } catch (e) {
            console.error('RAG API 호출 실패:', e)
        }
    }

    if (versions == null || versions.length === 0) {
        // 템플릿 경로 역시 정량 점수는 아직 없으므로 scoring은 null로 둔다.
        versions = getTemplateVersions(profile, targetJob, insights).map(v => ({
            ...v,
            scoring: null,
        }))
    }

    // 생성된 3종 공통: 문맥 자연스럽게 다듬기 (OPENAI_API_KEY 있으면 적용, 실패 시 원문 유지)
    if (versions && versions.length >= 3 && process.env.OPENAI_API_KEY) {
        try {
            const polished = await Promise.all(
                versions.map(async (v) => {
                    const result = await polishDraftContent(v.content)
                    return { ...v, content: result.content?.trim() ?? v.content }
                })
            )
            versions = polished
        } catch {
            // 다듬기 실패 시 원문 유지
        }
    }
    // 최종 가공 및 스코어 주석 결합
    versions = versions.map(v => {
        let content = addParagraphIndentation(sanitizeDraftContent(v.content))
        if (v.scoring) {
            content += `\n\n<!-- scoring: ${JSON.stringify(v.scoring)} -->`
        }
        return { ...v, content }
    })

    // 4. 해당 내담자(profile_id) + 현재 로드맵의 기존 초안 전부 삭제 후, 새 3종만 삽입 (갱신)
    const { error: deleteError } = await supabase
        .from('resume_drafts')
        .delete()
        .eq('profile_id', clientId)
        .eq('roadmap_id', roadmap.roadmap_id)
    if (deleteError) return { error: '기존 초안 삭제 실패: ' + deleteError.message }

    const versionTypeMap: Record<string, string> = { 'Version 1': 'initial', 'Version 2': 'revised', 'Version 3': 'final' }
    const rows = versions.map(v => ({
        draft_id: crypto.randomUUID(),
        roadmap_id: roadmap.roadmap_id,
        profile_id: clientId,
        target_position: v.title,
        version_type: versionTypeMap[v.type] ?? 'custom',
        draft_content: v.content,
        is_selected: false
    }))
    const { error } = await supabase.from('resume_drafts').insert(rows)
    if (error) return { error: error.message }

    revalidatePath('/cover-letter')
    return { success: true }
}

export async function saveDraft(draftId: string | null, content: string, title: string, profileId?: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: 'Unauthorized' }

    const userIdStr = typeof user.id === 'string' ? user.id : String(user.id)

    if (draftId && draftId !== "") {
        const draftRow = await supabase.from('resume_drafts').select('roadmap_id').eq('draft_id', draftId).single()
        const ok = draftRow.data && (await supabase.from('career_roadmaps').select('roadmap_id').eq('roadmap_id', draftRow.data.roadmap_id).eq('user_id', userIdStr).single()).data
        if (!ok) return { error: '권한이 없거나 초안을 찾을 수 없습니다.' }
        const { error } = await supabase
            .from('resume_drafts')
            .update({
                draft_content: content,
                target_position: title,
                updated_at: new Date().toISOString()
            })
            .eq('draft_id', draftId)
        if (error) return { error: error.message }
    } else {
        const { data: roadmap } = await supabase
            .from('career_roadmaps')
            .select('roadmap_id, profile_id')
            .eq('profile_id', profileId)
            .eq('user_id', userIdStr)
            .single()
        if (!roadmap) return { error: '로드맵 정보가 필요합니다.' }
        const insertRow = {
            draft_id: crypto.randomUUID(),
            roadmap_id: roadmap.roadmap_id,
            profile_id: roadmap.profile_id,
            target_position: title,
            version_type: 'custom',
            draft_content: content
        }
        const { error } = await supabase.from('resume_drafts').insert([insertRow])
        if (error) return { error: error.message }
    }

    revalidatePath('/cover-letter')
    return { success: true }
}

export async function deleteDraft(draftId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }
    const userIdStr = typeof user.id === 'string' ? user.id : String(user.id)
    const draft = await supabase.from('resume_drafts').select('roadmap_id').eq('draft_id', draftId).single()
    if (!draft.data) return { error: '초안을 찾을 수 없습니다.' }
    const ok = (await supabase.from('career_roadmaps').select('roadmap_id').eq('roadmap_id', draft.data.roadmap_id).eq('user_id', userIdStr).single()).data
    if (!ok) return { error: '권한이 없습니다.' }
    const { error } = await supabase.from('resume_drafts').delete().eq('draft_id', draftId)
    if (error) return { error: error.message }

    revalidatePath('/cover-letter')
    return { success: true }
}
