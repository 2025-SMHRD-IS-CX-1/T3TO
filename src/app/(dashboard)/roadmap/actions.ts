'use server'

import { createClient, getEffectiveUserId } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getRoadmapModel } from '@/lib/ai-models'
import {
    getQualificationList,
    getExamSchedule,
} from '@/lib/qnet-api'
import { searchCompanyInfo, searchJobInfo } from '@/lib/web-search'
import { runRoadmap, getRoadmapRagContext } from './lib'

export async function getRoadmap(profileId?: string, counselorId?: string | null) {
    const supabase = await createClient()
    const userIdStr = await getEffectiveUserId(counselorId)
    if (!userIdStr) return null

    let query = supabase
        .from('career_roadmaps')
        .select('*')
        .eq('user_id', userIdStr)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

    if (profileId) {
        query = query.eq('profile_id', profileId)
    }

    const { data, error } = await query.limit(1).single()

    if (error) {
        if (error.code !== 'PGRST116') {
            console.error('Error fetching roadmap:', error)
        }
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
    const supabase = await createClient()
    const userIdStr = await getEffectiveUserId(counselorId)
    if (!userIdStr) return { error: 'Unauthorized' }

    const ragContext = profileId ? await getRoadmapRagContext(supabase, profileId, userIdStr) : null
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
        getQualifications: getQualificationList,
        getExamSchedule: getExamSchedule,
    }
    const result = await runRoadmap(userData, adapters)
    const info = result.info
    const dynamicSkills = result.dynamicSkills
    const dynamicCerts = result.dynamicCerts
    const targetJob = result.targetJob
    const targetCompany = result.targetCompany


    console.log('[Roadmap] 최종 로드맵 데이터 준비 완료')
    console.log('[Roadmap] 목표 직무:', targetJob, '목표 기업:', targetCompany)
    console.log('[Roadmap] 마일스톤 수:', info.length)

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

    // 캐시 무효화로 UI 동기화
    revalidatePath('/roadmap')
    revalidatePath('/admin/clients')
    revalidatePath('/dashboard')

    return { success: true }
}
