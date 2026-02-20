import type { createClient } from '@/lib/supabase/server'

/** 로드맵 RAG용 DB 컨텍스트 수집 (상담·분석·프로필·로드맵). existingProfile 있으면 career_profiles 조회 생략 */
export async function getRoadmapRagContext(
    supabase: Awaited<ReturnType<typeof createClient>>,
    profileId: string,
    userIdStr: string,
    existingProfile?: unknown[] | null
): Promise<{
    counseling: unknown[]
    analysis: unknown[]
    profile: unknown[]
    roadmap: unknown[]
} | null> {
    const { data: profileFromDb } = existingProfile?.length
        ? { data: existingProfile }
        : await supabase.from('career_profiles').select('*').eq('profile_id', profileId).eq('user_id', userIdStr)
    const profileRows = profileFromDb ?? []

    if (!profileRows.length) return null

    const { data: counseling } = await supabase
        .from('consultations')
        .select('*')
        .eq('profile_id', profileId)
        .eq('user_id', userIdStr)

    const consultationIds = (counseling || []).map((c: { consultation_id: string }) => c.consultation_id)
    let analysis: unknown[] = []
    for (const cid of consultationIds.slice(0, 5)) {
        const { data: a } = await supabase
            .from('consultation_analysis')
            .select('*')
            .eq('consultation_id', cid)
        if (a?.length) analysis = analysis.concat(a)
    }

    const { data: roadmap } = await supabase
        .from('career_roadmaps')
        .select('*')
        .eq('profile_id', profileId)
        .eq('user_id', userIdStr)

    return {
        counseling: counseling || [],
        analysis,
        profile: profileRows,
        roadmap: roadmap || [],
    }
}
