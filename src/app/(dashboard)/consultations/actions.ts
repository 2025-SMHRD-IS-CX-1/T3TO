'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { createInitialRoadmap, getClientProfile } from '../roadmap/actions'

export async function getConsultations(profileId?: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return []

    let query = supabase
        .from('consultations')
        .select(`
            *,
            career_profiles:profile_id (client_name)
        `)
        .eq('user_id', user.id)

    if (profileId) {
        query = query.eq('profile_id', profileId)
    }

    const { data, error } = await query.order('created_at', { ascending: false })

    if (error) {
        console.error('Error fetching consultations:', error)
        return []
    }

    // Adapt the mapping for the plural relation name
    return data.map(item => ({
        ...item,
        career_profile: item.career_profiles // Map back to singular for UI compatibility
    }))
}

export async function createConsultation(formData: FormData) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: 'Unauthorized' }

    const content = formData.get('content') as string
    const round = formData.get('round') as string
    const sessionDate = formData.get('sessionDate') as string
    const clientId = formData.get('clientId') as string

    const { data, error } = await supabase
        .from('consultations')
        .insert([
            {
                user_id: user.id,
                profile_id: clientId || null,
                consultation_content: content,
                consultation_round: parseInt(round) || 1,
                session_date: sessionDate || null,
                status: 'completed'
            }
        ])
        .select()
        .single()

    if (error) {
        console.error('Error creating consultation:', error)
        return { error: error.message }
    }

    // Trigger AI Analysis
    await analyzeConsultation(data.consultation_id, clientId, content)

    revalidatePath('/consultations')
    return { success: true }
}

async function analyzeConsultation(consultationId: string, profileId: string, content: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !profileId) return

    // [AI 분석 시뮬레이션] 상담 내용을 기반으로 내담자의 프로필을 업데이트합니다.
    await supabase
        .from('career_profiles')
        .update({
            // 기존 데이터에 상담 내용을 더해 '최신 상태'로 갱신
            career_orientation: "최신 상담 반영: " + (content.length > 50 ? content.substring(0, 50) + "..." : content),
            skill_vector: "분석된 보유 기술: React, Supabase, AI API 연동",
        })
        .eq('profile_id', profileId)
        .eq('user_id', user.id)

    // [로드맵 자동 갱신] 최신화된 프로필을 바탕으로 로드맵을 즉시 다시 생성합니다.
    const latestProfile = await getClientProfile(profileId)
    if (latestProfile) {
        await createInitialRoadmap(profileId, latestProfile)
    }
}

export async function updateConsultation(
    consultationId: string,
    payload: { content: string; round: number; sessionDate: string; clientId: string | null }
) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: 'Unauthorized' }

    const { error } = await supabase
        .from('consultations')
        .update({
            consultation_content: payload.content,
            consultation_round: payload.round,
            session_date: payload.sessionDate || null,
            profile_id: payload.clientId || null,
            updated_at: new Date().toISOString(),
        })
        .eq('consultation_id', consultationId)
        .eq('user_id', user.id)

    if (error) {
        console.error('Error updating consultation:', error)
        return { error: error.message }
    }

    revalidatePath('/consultations')
    return { success: true }
}

export async function deleteConsultation(id: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: 'Unauthorized' }

    const { error } = await supabase
        .from('consultations')
        .delete()
        .eq('consultation_id', id)
        .eq('user_id', user.id)

    if (error) {
        console.error('Error deleting consultation:', error)
        return { error: error.message }
    }

    revalidatePath('/consultations')
    return { success: true }
}
