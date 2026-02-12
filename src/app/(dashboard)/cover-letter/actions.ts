'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { createInitialRoadmap } from '../roadmap/actions'

export async function getDrafts(profileId?: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return []

    let query = supabase
        .from('resume_drafts')
        .select(`
            *,
            career_roadmaps (
                user_id,
                target_job
            )
        `)
        .eq('user_id', user.id)

    if (profileId) {
        query = query.eq('profile_id', profileId)
    }

    const { data, error } = await query.order('created_at', { ascending: false })

    if (error) {
        console.error('Error fetching drafts:', error?.message ?? 'Unknown error', error?.code, error?.details)
        return []
    }

    const list = data ?? []
    return list.map((draft: any) => ({
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
            insights = `강점: ${latestAnalysis.strengths}\n가치관: ${latestAnalysis.values}`
        }
    }

    const targetJob = roadmap.target_job || '프론트엔드 개발자'

    // 3. Define 3 Versions
    const versions = [
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

    // 4. Batch Insert
    const { error } = await supabase
        .from('resume_drafts')
        .insert(versions.map(v => ({
            user_id: user.id,
            roadmap_id: roadmap.roadmap_id,
            profile_id: clientId,
            target_position: v.title,
            version_type: v.type,
            draft_content: v.content,
            is_selected: false
        })))

    if (error) return { error: error.message }

    revalidatePath('/cover-letter')
    return { success: true }
}

export async function saveDraft(draftId: string | null, content: string, title: string, profileId?: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: 'Unauthorized' }

    if (draftId && draftId !== "") {
        // Update existing
        const { error } = await supabase
            .from('resume_drafts')
            .update({
                draft_content: content,
                target_position: title,
                updated_at: new Date().toISOString()
            })
            .eq('draft_id', draftId)
            .eq('user_id', user.id)

        if (error) return { error: error.message }
    } else {
        // Create new
        const { data: roadmap } = await supabase
            .from('career_roadmaps')
            .select('roadmap_id, profile_id')
            .eq('profile_id', profileId)
            .eq('user_id', user.id)
            .single()

        if (!roadmap) return { error: '로드맵 정보가 필요합니다.' }

        const { error } = await supabase
            .from('resume_drafts')
            .insert([{
                user_id: user.id,
                roadmap_id: roadmap.roadmap_id,
                profile_id: roadmap.profile_id,
                target_position: title,
                version_type: 'Manual',
                draft_content: content
            }])

        if (error) return { error: error.message }
    }

    revalidatePath('/cover-letter')
    return { success: true }
}

export async function deleteDraft(draftId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: 'Unauthorized' }

    const { error } = await supabase
        .from('resume_drafts')
        .delete()
        .eq('draft_id', draftId)
        .eq('user_id', user.id)

    if (error) {
        return { error: error.message }
    }

    revalidatePath('/cover-letter')
    return { success: true }
}
