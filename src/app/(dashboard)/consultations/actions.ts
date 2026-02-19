'use server'

import { getConsultationAnalysisModel } from '@/lib/ai-models'
import { createClient, getEffectiveUserId } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import OpenAI from 'openai'
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

/** 상담 내용을 분석해 키워드·가치관·강점·약점을 각각 적절한 형식으로 추출 (규칙 기반, AI 미사용 시 폴백) */
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

/** LLM으로 상담 내용 분석 (의미 있는 키워드·가치관·강점·약점 추출). 실패 시 null 반환. */
async function analyzeContentWithAI(content: string): Promise<{
    interest_keywords: string
    career_values: string
    strengths: string
    weaknesses: string
} | null> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey || !content?.trim()) return null

    const client = new OpenAI({ apiKey })
    const model = getConsultationAnalysisModel()

    const systemPrompt = `당신은 진로·커리어 상담 전문가입니다. 내담자의 상담 원문을 읽고 다음 네 가지를 분석해 JSON으로만 답하세요. 다른 설명이나 마크다운 없이 반드시 아래 형식의 JSON 한 덩어리만 출력하세요.

{
  "interest_keywords": "상담에서 드러난 관심·핵심 주제를 의미 단위로 정리한 키워드 5~10개. 쉼표로 구분. 단순 단어 쪼개기가 아니라 '재직 경험', '직무 적합성', '이직 고민'처럼 의미 있는 구나 단어로만 나열.",
  "career_values": "내담자가 중시하는 가치관·원하는 방향을 1~2문장으로 요약. 파악 어렵으면 '상담에서 핵심 가치관을 추가로 파악할 예정입니다.' 한 문장.",
  "strengths": "내담자의 강점·자원을 1~2문장으로 요약. 구체적 표현 사용.",
  "weaknesses": "내담자의 약점·고민·보완점을 1~2문장으로 요약. 비난이 아닌 성장 관점."
}`

    try {
        const res = await client.chat.completions.create({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: content.trim().slice(0, 6000) },
            ],
            temperature: 0.4,
            max_tokens: 1024,
        })
        const raw = res.choices[0]?.message?.content?.trim() ?? ''
        const jsonMatch = raw.match(/\{[\s\S]*\}/)
        if (!jsonMatch) return null
        const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
        const interest_keywords = typeof parsed.interest_keywords === 'string' ? parsed.interest_keywords : ''
        const career_values = typeof parsed.career_values === 'string' ? parsed.career_values : ''
        const strengths = typeof parsed.strengths === 'string' ? parsed.strengths : ''
        const weaknesses = typeof parsed.weaknesses === 'string' ? parsed.weaknesses : ''
        if (!interest_keywords && !career_values && !strengths && !weaknesses) return null
        return { interest_keywords, career_values, strengths, weaknesses }
    } catch {
        return null
    }
}

async function analyzeConsultation(consultationId: string, profileId: string, content: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !profileId) return

    const ruleBased = analyzeContent(content)
    const aiResult = await analyzeContentWithAI(content)

    const analysis = aiResult
        ? {
            ...ruleBased,
            interest_keywords: aiResult.interest_keywords || ruleBased.interest_keywords,
            career_values: aiResult.career_values || ruleBased.career_values,
            strengths: aiResult.strengths || ruleBased.strengths,
            weaknesses: aiResult.weaknesses || ruleBased.weaknesses,
        }
        : ruleBased
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

/** 기존 상담을 AI로 다시 분석해 consultation_analysis를 갱신 (OPENAI_API_KEY 있으면 LLM 사용) */
export async function reanalyzeConsultation(consultationId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Unauthorized' }

    const { data: consultation, error: fetchError } = await supabase
        .from('consultations')
        .select('consultation_content, profile_id')
        .eq('consultation_id', consultationId)
        .eq('user_id', user.id)
        .single()

    if (fetchError || !consultation?.consultation_content) {
        return { success: false, error: '상담 내용을 찾을 수 없습니다.' }
    }

    const content = consultation.consultation_content as string
    const profileId = consultation.profile_id as string | null
    const ruleBased = analyzeContent(content)
    const aiResult = await analyzeContentWithAI(content)

    const analysis = aiResult
        ? {
            ...ruleBased,
            interest_keywords: aiResult.interest_keywords || ruleBased.interest_keywords,
            career_values: aiResult.career_values || ruleBased.career_values,
            strengths: aiResult.strengths || ruleBased.strengths,
            weaknesses: aiResult.weaknesses || ruleBased.weaknesses,
        }
        : ruleBased

    const userIdStr = typeof user.id === 'string' ? user.id : String(user.id)
    const payload = {
        interest_keywords: analysis.interest_keywords,
        concern_factors: analysis.concern_factors,
        career_values: analysis.career_values,
        preference_conditions: analysis.preference_conditions,
        avoidance_conditions: analysis.avoidance_conditions,
        personality_traits: analysis.personality_traits,
        strengths: analysis.strengths,
        weaknesses: analysis.weaknesses,
    }

    const { data: updated } = await supabase
        .from('consultation_analysis')
        .update(payload)
        .eq('consultation_id', consultationId)
        .eq('user_id', userIdStr)
        .select()
        .maybeSingle()

    if (!updated) {
        const { error: insertError } = await supabase.from('consultation_analysis').insert({
            consultation_id: consultationId,
            user_id: userIdStr,
            ...payload,
        })
        if (insertError) return { success: false, error: insertError.message }
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
