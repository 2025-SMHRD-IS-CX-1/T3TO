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

/** 한국어 조사 제거 (키워드만 남기기) */
function stripJosa(word: string): string {
    return word.replace(/(에서|으로|부터|까지|처럼|은|는|이|가|을|를|에|의|와|과|로|만|도)$/, '').trim() || word
}

/** 한국어 문장에서 키워드만 추출 (조사·접속사 등 제외, 2글자 이상) */
function extractKeywords(text: string, maxCount = 12): string {
    const stop = new Set([
        '그리고', '그러나', '그래서', '그런데', '또는', '및', '등', '이런', '저런', '어떤', '무슨',
        '있다', '없다', '하다', '되다', '이다', '있다고', '없다고', '같다', '위해', '통해',
        '있는', '없는', '하는', '되는', '있는지', '없는지', '그것', '이것', '저것', '무엇',
        '같이', '처럼', '위한', '대한', '때문', '경우', '것으로', '그리고', '정도', '위해서',
    ])
    const trimmed = text.replace(/\s+/g, ' ').trim()
    const tokens = trimmed.split(/[\s,.\n!?]+/).filter(Boolean)
    const seen = new Set<string>()
    const out: string[] = []
    for (const t of tokens) {
        const normalized = stripJosa(t)
        if (normalized.length >= 2 && normalized.length <= 20 && !stop.has(normalized) && !/^\d+$/.test(normalized)) {
            if (!seen.has(normalized)) {
                seen.add(normalized)
                out.push(normalized)
                if (out.length >= maxCount) break
            }
        }
    }
    return out.length ? out.join(', ') : '상담 내용 기반 키워드 추출 예정'
}

/** 문장 목록에서 패턴이 포함된 문장을 찾아 요약 (최대 길이 제한) */
function findAndSummarize(sentences: string[], patterns: RegExp[], maxLen: number, fallback: string): string {
    for (const s of sentences) {
        const trimmed = s.trim()
        if (trimmed.length < 5) continue
        for (const p of patterns) {
            if (p.test(trimmed)) return trimmed.slice(0, maxLen) + (trimmed.length > maxLen ? '…' : '')
        }
    }
    return fallback
}

/** 상담 내용을 분석해 키워드·가치관·강점·약점을 각각 적절한 형식으로 추출 (규칙 기반) */
function analyzeContent(content: string) {
    const trimmed = content.trim().replace(/\s+/g, ' ')
    const sentences = trimmed.split(/[.!?\n]+/).filter(Boolean).map(s => s.trim()).filter(s => s.length >= 3)

    const interest_keywords = extractKeywords(content)

    const career_values = findAndSummarize(
        sentences,
        [/가치|중요|원하는|희망|선호|생각해|바람|중시|추구|믿음|원칙/],
        120,
        '상담에서 핵심 가치관을 추가로 파악할 예정입니다.'
    )

    const strengths = findAndSummarize(
        sentences,
        [/강점|강하다|잘\s*함|능력|좋아|경험|성장|장점|자신감|열정|적극|성실|소통|리더십|문제\s*해결/],
        120,
        '상담에서 강점을 추가로 파악할 예정입니다.'
    )

    const weaknesses = findAndSummarize(
        sentences,
        [/부족|약점|어려움|보완|아쉬운|미흡|걱정|고민|불안|힘들|개선|발전\s*필요/],
        120,
        '상담에서 약점·보완점을 추가로 파악할 예정입니다.'
    )

    const first = sentences[0] ?? ''
    const rest = sentences.slice(1, 4).join(' ')

    return {
        interest_keywords,
        concern_factors: sentences[1] || '추가 상담에서 구체화 예정',
        career_values,
        preference_conditions: rest.slice(0, 150) || '조건 정리 예정',
        avoidance_conditions: '추가 상담 시 보완',
        personality_traits: first.slice(0, 80) || '성향 추후 정리',
        strengths,
        weaknesses,
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
