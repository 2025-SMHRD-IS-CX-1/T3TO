'use server'

import { createClient, getEffectiveUserId } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function getEvents(counselorId?: string | null) {
    const supabase = await createClient()
    const userIdStr = await getEffectiveUserId(counselorId)
    if (!userIdStr) return []

    const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('user_id', userIdStr)
        .order('event_date', { ascending: true })

    if (error) {
        console.error('Error fetching events:', error)
        return []
    }

    return data.map((event: any) => {
        // Handle DATE and TIME separation
        const dateTimeStr = event.event_date ? `${event.event_date}${event.start_time ? 'T' + event.start_time : ''}` : event.created_at;
        const dateObj = new Date(dateTimeStr);

        return {
            id: event.event_id,
            title: event.event_title,
            mentor: "담당 멘토",
            date: dateObj,
            time: event.start_time ? event.start_time.substring(0, 5) : dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: event.event_type || 'online',
            content: event.event_description || '',
            status: 'confirmed'
        }
    })
}

export async function createEvent(formData: FormData) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: 'Unauthorized' }

    // Ensure public.users exists to prevent FK error
    const { error: userError } = await supabase
        .from('users')
        .upsert([
            {
                user_id: user.id,
                email: user.email,
                login_id: user.email,
                password_hash: 'SOCIAL_AUTH' // Placeholder for social auth users
            }
        ], { onConflict: 'user_id' })

    if (userError) {
        console.error('Error syncing user info:', userError)
    }

    const title = formData.get('title') as string
    const content = formData.get('content') as string
    const dateStr = formData.get('date') as string
    const timeStr = formData.get('time') as string
    const profileId = formData.get('clientId') as string

    if (!title || !dateStr || !timeStr) {
        return { error: '모든 필드를 입력해주세요.' }
    }

    const { error } = await supabase
        .from('calendar_events')
        .insert([
            {
                user_id: user.id,
                event_title: title,
                event_description: content || '',
                event_date: dateStr, // YYYY-MM-DD
                start_time: timeStr,  // HH:mm
                event_type: 'online',
                profile_id: profileId || null
            }
        ])

    if (error) {
        console.error('Error creating event:', error)
        if (error.code === '23503') {
            return { error: '사용자 정보 연동 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' }
        }
        return { error: error.message }
    }

    revalidatePath('/schedule')
    return { success: true }
}

export async function deleteEvent(eventId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: 'Unauthorized' }

    const { error } = await supabase
        .from('calendar_events')
        .delete()
        .eq('event_id', eventId)
        .eq('user_id', user.id)

    if (error) {
        console.error('Error deleting event:', error)
        return { error: error.message }
    }

    revalidatePath('/schedule')
    return { success: true }
}

export async function getLatestEvent(profileId: string) {
    const supabase = await createClient()
    const now = new Date().toISOString().split('T')[0]

    const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('profile_id', profileId)
        .gte('event_date', now)
        .order('event_date', { ascending: true })
        .order('start_time', { ascending: true })
        .limit(1)
        .single()

    if (error) {
        if (error.code !== 'PGRST116') { // No rows found is not necessarily an error we want to log
            console.error('Error fetching latest event:', error)
        }
        return null
    }

    return {
        title: data.event_title,
        date: data.event_date,
        time: data.start_time ? data.start_time.substring(0, 5) : null
    }
}
