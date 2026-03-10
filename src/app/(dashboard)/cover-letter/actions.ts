'use server'

import { createClient, getEffectiveUserId } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { createInitialRoadmap } from '../roadmap/actions'
import OpenAI from 'openai'
import { getCoverLetterModel } from '@/lib/ai-models'
import { searchSelfIntroExamples } from '@/lib/web-search'

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

/** scoring을 화면에서 파싱할 수 있도록 HTML 주석으로 본문 끝에 첨부 */
function appendScoringComment(content: string, scoring: any): string {
    const text = typeof content === 'string' ? content.trim() : ''
    if (!text) return text
    if (!scoring || typeof scoring !== 'object') return text
    // 이미 포함되어 있으면 중복 삽입 방지
    if (/<!--\s*scoring:\s*\{[\s\S]*?\}\s*-->/.test(text)) return text
    try {
        const json = JSON.stringify(scoring)
        return `${text}\n\n<!-- scoring: ${json} -->`
    } catch {
        return text
    }
}

/** 상담 분석 문구가 placeholder일 때 제거 (실제 강점/가치관만 사용) */
function useInsightLine(insights: string, lineIndex: number, fallback: string): string {
    if (!insights) return fallback
    const line = insights.split('\n')[lineIndex]?.trim()
    if (!line || line.includes('추가로 파악할 예정')) return fallback
    return line.replace(/^(강점|가치관):\s*/i, '').trim() || fallback
}

/** RAG 컨텍스트 문자열 생성. Supabase 프로필·상담·로드맵 데이터를 종합해 mk_resume_model에 전달 */
function buildRagContext(params: {
    targetJob: string
    competencies: string[]
    insights: string
    consultationSummary?: string
    clientName?: string
    major?: string
    educationLevel?: string
    ageGroup?: string | null
    workExperience?: string | null
    careerOrientation?: string | null
    targetCompany?: string | null
    roadmapSkillsText?: string
}): string {
    const {
        targetJob,
        competencies,
        insights,
        consultationSummary,
        clientName,
        major,
        educationLevel,
        ageGroup,
        workExperience,
        careerOrientation,
        targetCompany,
        roadmapSkillsText,
    } = params
    const lines: string[] = []
    lines.push('※ 아래 상담·로드맵·DB 내용을 자기소개서 본문에 구체적으로 반영할 것.')
    lines.push('')
    lines.push('[지원 직무] ' + targetJob)
    if (competencies.length) lines.push('[직무 역량] ' + competencies.join(', '))
    if (clientName?.trim()) lines.push('[지원자] ' + clientName.trim())
    if (major?.trim()) lines.push('[전공/학력] ' + major.trim())
    if (educationLevel?.trim()) lines.push('[학력 수준] ' + educationLevel.trim())
    if (ageGroup?.trim()) lines.push('[연령대] ' + ageGroup.trim())
    if (workExperience != null && String(workExperience).trim()) lines.push('[경력/경험] ' + String(workExperience).trim())
    if (careerOrientation?.trim()) lines.push('[진로/성향] ' + careerOrientation.trim())
    if (targetCompany?.trim()) lines.push('[희망 기업/분야] ' + targetCompany.trim())
    if (roadmapSkillsText?.trim()) lines.push('[로드맵 역량 요약] ' + roadmapSkillsText.trim())
    if (insights?.trim()) lines.push('[상담 분석 요약] ' + insights.trim())
    if (consultationSummary?.trim()) {
        const summary = consultationSummary.slice(0, 2000).trim()
        lines.push('[상담 원문 참고 - 에피소드·경험·성과 추출용] ' + summary + (consultationSummary.length > 2000 ? '...' : ''))
    }
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

/** OpenAI 직접 호출로 자기소개서 3종 생성 (mk_resume_model 미사용 시 성능·품질 확보용) */
async function generateSelfIntroWithOpenAI(params: {
    targetJob: string
    competencies: string[]
    ragContext: string
    consultationContent: string
    background: { name: string | null; education: string | null; experiences: string[]; strengths: string[] | null; career_values?: string }
}): Promise<{ type: string; title: string; content: string; scoring?: any }[] | null> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey?.trim()) return null
    const client = new OpenAI({ apiKey })
    const model = getCoverLetterModel()
    const { targetJob, competencies, ragContext, consultationContent, background } = params
    const experiencesStr = background.experiences?.length ? background.experiences.join(', ') : '(데이터 없음 - 상담 원문 참고)'
    const strengthsStr = background.strengths?.length ? background.strengths.join(', ') : '(데이터 없음 - 상담 원문 참고)'
    const systemPrompt = `당신은 합격자 자기소개서 스타일의 채용 자기소개서 전문가입니다. 제공된 RAG 컨텍스트(상담 원문, 로드맵·DB)만 사용해 환각 없이 종합적으로 작성하세요. 컨텍스트에 없는 내용은 만들지 마세요.
분량: 각 버전당 공백 포함 700자 이상 800자 이하. 사실성 준수, 3~4문단, 비즈니스 한국어.
버전별: 역량 중심(직무 역량·구체 사례), 경험 중심(STAR), 가치관 중심(가치관·에피소드).
각 버전에 scoring: { type_similarity, aptitude_fit, competency_reflection, average } 0~100 산출. 본문 품질에 따라 버전마다 다르게.
출력은 반드시 아래 JSON만 출력하세요. 다른 설명 없이.
{"reasoning":"요약","versions":[{"title":"역량 중심","draft":"본문...","scoring":{"type_similarity":90,"aptitude_fit":88,"competency_reflection":85,"average":88}},{"title":"경험 중심","draft":"본문...","scoring":{...}},{"title":"가치관 중심","draft":"본문...","scoring":{...}}]}`

    const userContent = `[추천 직무] ${targetJob}
[직무 역량] ${competencies.join(', ')}

[지원자 배경] 학력/전공: ${background.education ?? '제공되지 않음'}, 주요 경험: ${experiencesStr}, 보유 강점: ${strengthsStr}, 가치관: ${background.career_values ?? '제공되지 않음'}

[상담 원문]
\`\`\`
${consultationContent || '상담 내용 없음'}
\`\`\`

[로드맵·DB 종합 컨텍스트]
\`\`\`
${ragContext}
\`\`\`

위 내용만 참고해 역량 중심·경험 중심·가치관 중심 3종을 JSON versions 배열로 작성하세요. 각 draft 700~800자, scoring 포함.`

    try {
        const res = await client.chat.completions.create({
            model,
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userContent }],
            temperature: 0.3,
            max_tokens: 4096,
            response_format: { type: 'json_object' },
        })
        const raw = res.choices[0]?.message?.content?.trim() ?? ''
        if (!raw) return null
        const parsed = JSON.parse(raw) as { versions?: Array<{ title?: string; draft?: string; scoring?: any }> }
        const vers = parsed?.versions
        if (!Array.isArray(vers) || vers.length < 3) return null
        const titles = [`${targetJob} - 역량 중심`, `${targetJob} - 경험 중심`, `${targetJob} - 가치관 중심`]
        return vers.slice(0, 3).map((v, i) => ({
            type: `Version ${i + 1}`,
            title: v.title ?? titles[i],
            content: (v.draft ?? '').trim(),
            scoring: v.scoring,
        })).filter(v => v.content.length >= 200) as { type: string; title: string; content: string; scoring?: any }[]
    } catch {
        return null
    }
}

/** 실시간 적합도 분석: 본문만으로 스코어 산출 (DB 저장 없음, 화면 표시용) */
export async function analyzeDraftScoring(
    draftContent: string,
    targetJobFromTitle?: string
): Promise<{ type_similarity: number; aptitude_fit: number; competency_reflection: number; average: number } | null> {
    const trimmed = typeof draftContent === 'string' ? draftContent.trim() : ''
    if (!trimmed || trimmed.length < 100) return null
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return null
    const client = new OpenAI({ apiKey })
    const model = getCoverLetterModel()
    const jobHint = targetJobFromTitle?.replace(/\s*-\s*역량\s*중심$|\s*-\s*경험\s*중심$|\s*-\s*가치관\s*중심$/i, '').trim() || '지원 직무'
    try {
        const res = await client.chat.completions.create({
            model,
            messages: [
                {
                    role: 'system',
                    content: `당신은 채용 자기소개서 평가 전문가입니다. 주어진 자기소개서 본문만 읽고, 아래 3가지 항목을 각 0~100점으로 평가한 뒤 JSON만 출력하세요. 점수는 본문의 구체성·직무 연관성·역량 반영도에 따라 내담자마다·초안마다 다르게 부여하세요. 모든 초안에 같은 점수를 주지 마세요.
- type_similarity: 이 초안의 테마(역량/경험/가치관 중 하나)가 본문에 얼마나 충실히 반영되었는지
- aptitude_fit: 본문 내용이 추천 직무와 얼마나 맞는지(적성·경험 연관성)
- competency_reflection: 핵심 역량이 구체적 사례·에피소드로 증명되었는지
- average: 위 세 항목의 산술 평균(소수 가능)
출력 형식(다른 설명 없이 JSON만): {"type_similarity":85,"aptitude_fit":88,"competency_reflection":82,"average":85}`
                },
                {
                    role: 'user',
                    content: `[참고: 추천 직무는 "${jobHint}"일 수 있음]\n\n[평가할 자기소개서 본문]\n${trimmed.slice(0, 4000)}`
                },
            ],
            temperature: 0.3,
            max_tokens: 256,
            response_format: { type: 'json_object' },
        })
        const raw = res.choices[0]?.message?.content?.trim() ?? ''
        if (!raw) return null
        const parsed = JSON.parse(raw) as { type_similarity?: number; aptitude_fit?: number; competency_reflection?: number; average?: number }
        const a = typeof parsed.average === 'number' ? parsed.average : (parsed.type_similarity! + parsed.aptitude_fit! + parsed.competency_reflection!) / 3
        return {
            type_similarity: Math.min(100, Math.max(0, Number(parsed.type_similarity) || 0)),
            aptitude_fit: Math.min(100, Math.max(0, Number(parsed.aptitude_fit) || 0)),
            competency_reflection: Math.min(100, Math.max(0, Number(parsed.competency_reflection) || 0)),
            average: Math.round(Math.min(100, Math.max(0, a))),
        }
    } catch {
        return null
    }
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

    // RAG 컨텍스트 생성 (Supabase 프로필·상담·로드맵 종합 → mk_resume_model에 전달해 점검·맞춤 출력)
    const roadmapSkillsText = (() => {
        try {
            if (roadmap.required_skills && typeof roadmap.required_skills === 'string') {
                const arr = JSON.parse(roadmap.required_skills) as { title?: string }[]
                return (arr || []).map((s: { title?: string }) => s.title).filter(Boolean).join(', ')
            }
        } catch { /* ignore */ }
        return ''
    })()
    let ragContext = buildRagContext({
        targetJob,
        competencies,
        insights,
        consultationSummary: consultationContent,
        clientName: profile.client_name ?? undefined,
        major: profile.major ?? profile.education_level ?? undefined,
        educationLevel: (profile as { education_level?: string }).education_level ?? undefined,
        ageGroup: (profile as { age_group?: string | null }).age_group ?? undefined,
        workExperience: (profile as { work_experience?: string | null }).work_experience ?? (profile as { work_experience_years?: number }).work_experience_years != null ? String((profile as { work_experience_years?: number }).work_experience_years) + '년' : undefined,
        careerOrientation: (profile as { career_orientation?: string | null }).career_orientation ?? undefined,
        targetCompany: (profile as { target_company?: string | null }).target_company ?? (roadmap as { target_company?: string | null }).target_company ?? undefined,
        roadmapSkillsText: roadmapSkillsText || undefined,
    })

    // 실제 합격자 자기소개서 검색 결과를 RAG에 추가 (각 강점 제시 후 예시 참고용)
    try {
        const selfIntroSearch = await Promise.race([
            searchSelfIntroExamples(targetJob),
            new Promise<{ summary: string; results: unknown[] }>((resolve) => setTimeout(() => resolve({ summary: '', results: [] }), 8000)),
        ])
        if (selfIntroSearch.summary?.trim()) {
            ragContext += '\n\n[실제 합격자 자기소개서 검색 결과 - 각 강점 제시 이후 예시 참고용]\n'
            ragContext += selfIntroSearch.summary.trim().slice(0, 2200)
        }
    } catch {
        // 검색 실패 시 RAG는 기존대로
    }

    // 3. mk_resume_model API (RAG 컨텍스트 포함) 우선 → 실패 시 템플릿
    const mkResumeApiUrl = process.env.MK_RESUME_MODEL_API_URL ?? ''
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

    // mk_resume_model 미사용/실패 시 OpenAI 직접 호출로 자기소개서 생성 (성능·품질 활용)
    if ((versions == null || versions.length === 0) && process.env.OPENAI_API_KEY) {
        const openaiVersions = await generateSelfIntroWithOpenAI({
            targetJob,
            competencies,
            ragContext,
            consultationContent,
            background: {
                name: profile.client_name ?? null,
                education: profile.major ?? profile.education_level ?? null,
                experiences: (profile.work_experience && String(profile.work_experience).trim()) ? [String(profile.work_experience).trim()] : [],
                strengths: analysisStrengths.length > 0 ? analysisStrengths : null,
                career_values: careerValues || undefined,
            },
        })
        if (openaiVersions && openaiVersions.length >= 3) versions = openaiVersions
    }

    // OpenAI도 없거나 실패 시 로컬 템플릿 사용 (스코어는 미산출로 표시)
    if (versions == null || versions.length === 0) {
        versions = getTemplateVersions(profile, targetJob, insights).map(v => ({ ...v, scoring: undefined }))
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
    // 다듬기 이후 최종 원고에 scoring 메타 주석 첨부 (화면 parseScoring에서 즉시 표시)
    if (versions && versions.length > 0) {
        versions = versions.map(v => ({
            ...v,
            content: appendScoringComment(v.content, v.scoring),
        }))
    }
    // 최종 가공 (스코어는 DB/화면에 노출하지 않음)
    versions = versions.map(v => ({
        ...v,
        content: addParagraphIndentation(sanitizeDraftContent(v.content)),
    }))

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
