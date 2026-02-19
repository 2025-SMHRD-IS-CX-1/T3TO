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
                        '당신은 채용 자기소개서 문장을 다듬는 전문가입니다. 주어진 자기소개서 본문만 수정해서 반환하세요. 의미와 핵심 내용은 유지하면서 다음을 반영합니다: 맞춤법·띄어쓰기 교정, 문맥이 매끄럽고 설득력 있게 다듬기, 어색한 표현·문법 정리. 쉼표는 문장에서 꼭 필요한 곳에만 쓰고, 조사(을/를, 에서 등) 앞이나 단어 사이에 불필요하게 넣지 마세요. 자연스러운 문장 흐름을 유지하세요. 다른 설명 없이 수정된 자기소개서 전문만 출력하세요.',
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
            competenciesFromRoadmap = (skills || []).map((s: { title?: string }) => s.title).filter(Boolean)
        }
    } catch {
        // ignore
    }
    const competencies = competenciesFromRoadmap.length > 0
        ? competenciesFromRoadmap
        : analysisStrengths.length > 0
            ? analysisStrengths
            : [targetJob + ' 역량', '문제해결', '커뮤니케이션']

    const mkResumeApiUrl = (process.env.MK_RESUME_MODEL_API_URL ?? '').trim()
    if (!mkResumeApiUrl) {
        return { error: '자기소개서 생성 API가 설정되지 않았습니다. .env에 MK_RESUME_MODEL_API_URL을 설정해 주세요.' }
    }

    const baseUrl = mkResumeApiUrl.replace(/\/$/, '')
    const payload = {
        counseling: {
            content: consultationContent || '상담 기록이 아직 없습니다. 프로필과 로드맵 정보를 바탕으로 작성합니다.',
            session_date: null,
            notes: null,
        },
        ai_analysis: {
            roles: [targetJob],
            competencies,
            extracted_background: {
                name: profile.client_name ?? null,
                education: profile.major ?? profile.education_level ?? null,
                experiences: (profile.work_experience && String(profile.work_experience).trim())
                    ? [String(profile.work_experience).trim()]
                    : [],
                strengths: analysisStrengths.length > 0 ? analysisStrengths : null,
                career_values: careerValues || undefined,
            },
        },
        language: 'ko',
    }

    let draft = ''
    try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 120_000)
        const res = await fetch(`${baseUrl}/api/self-intro/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal,
        })
        clearTimeout(timeoutId)
        if (!res.ok) {
            const errText = await res.text()
            return { error: `자기소개서 생성 실패: ${res.status} ${errText || res.statusText}` }
        }
        const data = (await res.json()) as { draft?: string }
        draft = (data?.draft ?? '').trim()
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return { error: `자기소개서 생성 요청 실패: ${msg}` }
    }

    if (!draft) {
        return { error: '자기소개서 초안이 생성되지 않았습니다. API와 모델 상태를 확인해 주세요.' }
    }

    // UI 호환: 동일 초안으로 3종 버전 생성 (역량/경험/가치관 라벨만 구분)
    let versions: { type: string; title: string; content: string }[] = [
        { type: 'Version 1', title: `${targetJob} - 역량 중심`, content: draft },
        { type: 'Version 2', title: `${targetJob} - 경험 중심`, content: draft },
        { type: 'Version 3', title: `${targetJob} - 가치관 중심`, content: draft },
    ]

    if (process.env.OPENAI_API_KEY) {
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
    versions = versions.map(v => ({ ...v, content: sanitizeDraftContent(v.content) }))

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
