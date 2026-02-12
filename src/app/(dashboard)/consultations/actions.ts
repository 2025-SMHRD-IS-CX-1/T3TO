'use server'

import { createClient, getEffectiveUserId } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { createInitialRoadmap, getClientProfile } from '../roadmap/actions'

export async function getConsultations(profileId?: string, counselorId?: string | null) {
    const supabase = await createClient()
    const userIdStr = await getEffectiveUserId(counselorId)
    if (!userIdStr) return []

    let query = supabase
        .from('consultations')
        .select(`
            *,
            career_profiles:profile_id (client_name)
        `)
        .eq('user_id', userIdStr)

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

/** 상담 내용을 간단히 분석해 키워드·강점·가치관 등 텍스트 추출 (규칙 기반) */
function analyzeContent(content: string) {
    const trimmed = content.trim().replace(/\s+/g, ' ')
    const sentences = trimmed.split(/[.!?\n]+/).filter(Boolean).map(s => s.trim())
    const first = sentences[0] ?? ''
    const rest = sentences.slice(1, 4).join(' ')
    const keywords = trimmed.slice(0, 150).replace(/\n/g, ', ')
    return {
        interest_keywords: keywords || '상담 내용 기반 추출',
        concern_factors: sentences[1] || '추가 상담에서 구체화 예정',
        career_values: first || '상담에서 파악된 희망·가치관',
        preference_conditions: rest || '조건 정리 예정',
        avoidance_conditions: '추가 상담 시 보완',
        personality_traits: first.slice(0, 80) || '성향 추후 정리',
        strengths: (sentences[0] || sentences[1] || '').slice(0, 200) || '상담에서 드러난 강점',
        weaknesses: '지속적인 상담으로 보완 예정',
    }
}

async function analyzeConsultation(consultationId: string, profileId: string, content: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !profileId) return

    const analysis = analyzeContent(content)
    const userIdStr = typeof user.id === 'string' ? user.id : String(user.id)

    // consultation_analysis에 분석 결과 저장
    await supabase.from('consultation_analysis').insert({
        consultation_id: consultationId,
        user_id: userIdStr,
        interest_keywords: analysis.interest_keywords,
        concern_factors: analysis.concern_factors,
        career_values: analysis.career_values,
        preference_conditions: analysis.preference_conditions,
        avoidance_conditions: analysis.avoidance_conditions,
        personality_traits: analysis.personality_traits,
        strengths: analysis.strengths,
        weaknesses: analysis.weaknesses,
    })

    // [AI 분석 시뮬레이션] 상담 내용을 기반으로 내담자의 프로필을 업데이트합니다.
    await supabase
        .from('career_profiles')
        .update({
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
