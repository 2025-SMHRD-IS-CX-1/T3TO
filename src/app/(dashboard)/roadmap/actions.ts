'use server'

import { createClient, getEffectiveUserId } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getRoadmapModel } from '@/lib/ai-models'
import { searchCompanyInfo, searchJobInfo, searchCertificationInfo } from '@/lib/web-search'
import { runRoadmap, getRoadmapRagContext } from './lib'

/** 단기/중기/장기 단계별 사용자 완료 체크 (목표 달성율 표시용) */
export type StageCompletion = { short: boolean; mid: boolean; long: boolean }

/** milestones JSON 파싱: 배열이면 steps만, 객체면 steps + stage_completion (Server Action이므로 async) */
export async function parseMilestones(raw: string | null): Promise<{ steps: unknown[]; stage_completion: StageCompletion }> {
    const defaultCompletion: StageCompletion = { short: false, mid: false, long: false }
    if (!raw || !raw.trim()) return { steps: [], stage_completion: defaultCompletion }
    try {
        const parsed = JSON.parse(raw) as unknown
        if (Array.isArray(parsed)) return { steps: parsed, stage_completion: defaultCompletion }
        if (parsed && typeof parsed === 'object' && 'steps' in parsed && Array.isArray((parsed as any).steps)) {
            const p = parsed as { steps: unknown[]; stage_completion?: Partial<StageCompletion> }
            return {
                steps: p.steps,
                stage_completion: {
                    short: !!p.stage_completion?.short,
                    mid: !!p.stage_completion?.mid,
                    long: !!p.stage_completion?.long,
                }
            }
        }
    } catch (_) { /* ignore */ }
    return { steps: [], stage_completion: defaultCompletion }
}

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
    // Q-Net API 미사용: 자격증·시험일정은 Tavily 검색 + OpenAI 폴백만 사용
    const adapters = {
        openaiApiKey: process.env.OPENAI_API_KEY ?? '',
        model: getRoadmapModel(),
        searchCompany: searchCompanyInfo,
        searchJob: searchJobInfo,
        getQualifications: () => Promise.resolve([]),
        getExamSchedule: () => Promise.resolve([]),
        searchCertification: searchCertificationInfo,
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

    // 기존 활성 로드맵 확인 (갱신 시 기존 stage_completion 유지 위해 milestones 포함 조회)
    const { data: existingRoadmap } = await supabase
        .from('career_roadmaps')
        .select('roadmap_id, milestones')
        .eq('user_id', userIdStr)
        .eq('profile_id', profileId || null)
        .eq('is_active', true)
        .maybeSingle()

    // 갱신 모드인데 기존 로드맵이 없으면 에러 반환
    if (updateOnly && !existingRoadmap) {
        return { error: '갱신할 로드맵이 없습니다. 먼저 로드맵을 생성해주세요.' }
    }

    const parsedExisting = existingRoadmap?.milestones
        ? await parseMilestones(existingRoadmap.milestones)
        : null
    const preservedCompletion = parsedExisting?.stage_completion ?? { short: false, mid: false, long: false }
    const milestonesPayload = existingRoadmap
        ? JSON.stringify({ steps: info, stage_completion: preservedCompletion })
        : JSON.stringify(info)

    const roadmapData = {
        user_id: userIdStr,
        profile_id: profileId || null,
        target_job: targetJob,
        target_company: targetCompany,
        roadmap_stage: 'planning',
        milestones: milestonesPayload,
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

/** 단기/중기/장기 체크박스 완료 상태만 업데이트 (목표 달성율 연동) */
export async function updateStageCompletion(
    profileId: string,
    completion: StageCompletion,
    counselorId?: string | null
) {
    const supabase = await createClient()
    const userIdStr = await getEffectiveUserId(counselorId)
    if (!userIdStr || !profileId) return { error: '권한이 없습니다.' }

    const { data: row, error: fetchError } = await supabase
        .from('career_roadmaps')
        .select('roadmap_id, milestones')
        .eq('user_id', userIdStr)
        .eq('profile_id', profileId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (fetchError || !row) return { error: '로드맵을 찾을 수 없습니다.' }

    const { steps } = await parseMilestones(row.milestones)
    const updatedMilestones = JSON.stringify({ steps, stage_completion: completion })

    const { error: updateError } = await supabase
        .from('career_roadmaps')
        .update({ milestones: updatedMilestones, updated_at: new Date().toISOString() })
        .eq('roadmap_id', row.roadmap_id)

    if (updateError) return { error: updateError.message }
    revalidatePath('/roadmap')
    return { success: true }
}
