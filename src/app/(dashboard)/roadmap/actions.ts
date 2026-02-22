'use server'

import { createClient, getEffectiveUserId } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getRoadmapModel } from '@/lib/ai-models'
import { searchCompanyInfo, searchJobInfo } from '@/lib/web-search'
import { runRoadmap, getRoadmapRagContext } from './lib'

export async function getRoadmap(profileId?: string, counselorId?: string | null) {
    const supabase = await createClient()
    const userIdStr = await getEffectiveUserId(counselorId)
    if (!userIdStr) return null

    // profile_id(내담자 ID)가 없으면 조회하지 않음 - 다른 내담자 로드맵 노출 방지
    if (!profileId || profileId === '') return null

    const { data, error } = await supabase
        .from('career_roadmaps')
        .select('*')
        .eq('user_id', userIdStr)
        .eq('profile_id', profileId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (error) {
        console.error('[getRoadmap] 조회 에러:', error.code, error.message)
        return null
    }
    return data
}

export async function getClientProfile(profileId: string, counselorId?: string | null) {
    const supabase = await createClient()
    const userIdStr = await getEffectiveUserId(counselorId)
    if (!userIdStr) return null

    const { data, error } = await supabase
        .from('career_profiles')
        .select('*')
        .eq('profile_id', profileId)
        .eq('user_id', userIdStr)
        .single()

    if (error) {
        console.error('Error fetching client profile:', error)
        return null
    }

    return data
}

export async function createInitialRoadmap(profileId?: string, clientData?: any, counselorId?: string | null, updateOnly: boolean = false) {
    const totalStart = Date.now()
    const supabase = await createClient()
    const userIdStr = await getEffectiveUserId(counselorId)
    if (!userIdStr) return { error: 'Unauthorized' }

    let t = Date.now()
    const ragContext = profileId
        ? await getRoadmapRagContext(supabase, profileId, userIdStr, clientData ? [clientData] : null)
        : null
    console.log(`[createInitialRoadmap] getRoadmapRagContext: ${Date.now() - t}ms`)

    const userData = ragContext ?? {
        counseling: [],
        analysis: [],
        profile: [clientData ?? {}],
        roadmap: [],
    }
    const adapters = {
        openaiApiKey: process.env.OPENAI_API_KEY ?? '',
        model: getRoadmapModel(),
        searchCompany: searchCompanyInfo,
        searchJob: searchJobInfo,
    }
    t = Date.now()
    const result = await runRoadmap(userData, adapters)
    console.log(`[createInitialRoadmap] runRoadmap 전체: ${Date.now() - t}ms`)
    const info = result.info
    const dynamicSkills = result.dynamicSkills
    const dynamicCerts = result.dynamicCerts ?? []
    const targetJob = result.targetJob
    const targetCompany = result.targetCompany

    console.log('[Roadmap] 최종 로드맵 데이터 준비 완료')
    console.log('[Roadmap] 목표 직무:', targetJob, '목표 기업:', targetCompany)
    console.log('[Roadmap] 마일스톤 수:', info.length)
    console.log(`[createInitialRoadmap] 총 소요: ${Date.now() - totalStart}ms`)

    // 기존 활성 로드맵 확인
    const { data: existingRoadmap } = await supabase
        .from('career_roadmaps')
        .select('roadmap_id')
        .eq('user_id', userIdStr)
        .eq('profile_id', profileId || null)
        .eq('is_active', true)
        .maybeSingle()

    // 갱신 모드인데 기존 로드맵이 없으면 에러 반환
    if (updateOnly && !existingRoadmap) {
        return { error: '갱신할 로드맵이 없습니다. 먼저 로드맵을 생성해주세요.' }
    }

    const roadmapData = {
        user_id: userIdStr,
        profile_id: profileId || null,
        target_job: targetJob,
        target_company: targetCompany,
        roadmap_stage: 'planning',
        milestones: JSON.stringify(info),
        required_skills: JSON.stringify(dynamicSkills),
        certifications: JSON.stringify(dynamicCerts),
        timeline_months: 6,
        is_active: true,
        updated_at: new Date().toISOString()
    }

    // UPSERT: 기존 활성 로드맵이 있으면 UPDATE, 없으면 INSERT
    const { error, data } = existingRoadmap
        ? await supabase
            .from('career_roadmaps')
            .update(roadmapData)
            .eq('roadmap_id', existingRoadmap.roadmap_id)
        : await supabase
            .from('career_roadmaps')
            .insert([roadmapData])

    if (error) {
        console.error('[Roadmap] DB 저장 에러:', error.code, error.message, error.details)
        return { error: error.message }
    }

    // 캐시 무효화로 UI 동기화. revalidatePath 호출 시 해당 경로의 서버 컴포넌트(레이아웃 포함)가 재실행되며,
    // (dashboard) layout에서 getAdminContext()가 다시 호출되어 역할(role)·상담사 목록이 갱신됩니다.
    // 그래서 로드맵 생성/갱신 직후에도 사이드바·네비의 권한/메뉴가 최신 상태로 유지됩니다.
    revalidatePath('/roadmap')
    revalidatePath('/admin/clients')
    revalidatePath('/dashboard')

    return { success: true }
}
