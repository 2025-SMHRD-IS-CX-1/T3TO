'use server'

import { createClient, getEffectiveUserId } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { createInitialRoadmap } from '../roadmap/actions'

/** RAG API 미사용 시 쓰는 기본 템플릿 3종 */
function getTemplateVersions(
    profile: { client_name: string; major?: string },
    targetJob: string,
    insights: string
): { type: string; title: string; content: string }[] {
    return [
        {
            type: 'Version 1',
            title: `${targetJob} - 역량 중심`,
            content: `안녕하세요, ${targetJob} 지원자 ${profile.client_name}입니다.\n\n[역량 중심 초안]\n저는 ${profile.major} 전공을 통해 다져온 기초 지식과 ${insights ? insights.split('\n')[0] : '실무 역량'}을 바탕으로 팀에 기여하고 싶습니다. 특히 복잡한 문제를 논리적으로 해결하는 것에 강점이 있으며...`
        },
        {
            type: 'Version 2',
            title: `${targetJob} - 경험 중심`,
            content: `안녕하세요, ${profile.client_name}입니다.\n\n[경험 중심 초안]\n저는 다양한 프로젝트와 실제 ${insights ? '분석된 강점' : '실무 경험'}을 통해 성취를 이뤄왔습니다. 사용자의 피드백을 반영하여 서비스를 개선했던 경험은 저에게 가장 큰 자산이며...`
        },
        {
            type: 'Version 3',
            title: `${targetJob} - 가치관 중심`,
            content: `함께 성장하는 즐거움을 아는 ${profile.client_name}입니다.\n\n[가치관 중심 초안]\n저의 핵심 가치관은 ${insights ? insights.split('\n')[1] : '책임감과 소통'}입니다. 기술적인 완성도뿐만 아니라 동료와의 원활한 협업을 통해 시너지를 내는 것을 중요하게 생각합니다...`
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

    // 2. Fetch Latest Consultation Analysis
    const { data: analysis } = await supabase
        .from('consultation_analysis')
        .select('*')
        .eq('user_id', user.id) // Assuming analysis is linked by user or shared via profile
    // Actually, consultation is linked to profile_id in our latest schema update.
    // Let's find latest consultation for this profile.

    const { data: latestConsultation } = await supabase
        .from('consultations')
        .select('consultation_id')
        .eq('profile_id', clientId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

    let insights = ""
    if (latestConsultation) {
        const { data: latestAnalysis } = await supabase
            .from('consultation_analysis')
            .select('*')
            .eq('consultation_id', latestConsultation.consultation_id)
            .single()

        if (latestAnalysis) {
            insights = `강점: ${latestAnalysis.strengths}\n가치관: ${latestAnalysis.career_values}`
        }
    }

    const targetJob = roadmap.target_job || '프론트엔드 개발자'

    // 3. RAG API가 설정되어 있으면 호출, 없으면 템플릿 사용
    const ragApiUrl = process.env.RAG_COVER_LETTER_API_URL
    let versions: { type: string; title: string; content: string }[]

    if (ragApiUrl) {
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
            if (!res.ok) throw new Error(`RAG API ${res.status}`)
            const data = await res.json()
            if (data?.drafts && Array.isArray(data.drafts) && data.drafts.length >= 3) {
                versions = data.drafts.slice(0, 3).map((d: { type?: string; title?: string; content?: string }) => ({
                    type: d.type ?? 'Version',
                    title: d.title ?? targetJob,
                    content: d.content ?? '',
                }))
            } else {
                versions = getTemplateVersions(profile, targetJob, insights)
            }
        } catch (e) {
            console.error('RAG API 호출 실패, 템플릿 사용:', e)
            versions = getTemplateVersions(profile, targetJob, insights)
        }
    } else {
        versions = getTemplateVersions(profile, targetJob, insights)
    }

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
