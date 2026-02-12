'use server'

import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function getClients() {
    const supabase = await createSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return []

    // Fetch from career_profiles filtered by counselor's user_id
    const { data, error } = await supabase
        .from('career_profiles')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error fetching clients (career_profiles):', error)
        return []
    }

    // [검증 로그] DB에서 가져온 첫 번째 데이터의 구조를 출력합니다.
    if (data && data.length > 0) {
        console.log('✅ DB 연결 확인 - 첫 번째 레코드 구조:', {
            id: data[0].profile_id,
            work_experience_years: data[0].work_experience_years,
        })
    }

    // Map DB fields to UI
    return data.map((profile: any) => ({
        ...profile,
        id: profile.profile_id,
        name: profile.client_name || '이름 없음',
        email: profile.client_email || '-',
        status: 'active',
        progress: '0%',
        lastActive: new Date(profile.created_at).toLocaleDateString(),
        plan: 'Basic'
    }))
}

export async function createClientProfile(formData: FormData) {
    const supabase = await createSupabaseClient()

    const name = formData.get('name') as string
    const email = formData.get('email') as string
    const gender = formData.get('gender') as string
    const ageGroup = formData.get('age_group') as string
    const educationLevel = formData.get('education_level') as string
    const major = formData.get('major') as string
    const workExperience = formData.get('work_experience') as string
    const careerOrientation = formData.get('career_orientation') as string
    const skillVector = formData.get('skill_vector') as string
    const recommendedCareers = formData.get('recommended_careers') as string
    const targetCompany = formData.get('target_company') as string

    // Get current user (Counselor)
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { error: 'Unauthorized' }
    }

    const { data: newProfile, error } = await supabase
        .from('career_profiles')
        .insert([
            {
                user_id: user.id,
                client_name: name,
                client_email: email,
                gender: gender || null,
                age_group: ageGroup || null,
                education_level: educationLevel || null,
                major: major || null,
                work_experience_years: parseInt(workExperience) || 0,
                career_orientation: careerOrientation || null,
                skill_vector: skillVector || null,
                recommended_careers: recommendedCareers || null,
                target_company: targetCompany || null,
            }
        ])
        .select()
        .single()

    if (error) {
        console.error('Error creating client:', error)
        return { error: error.message }
    }

    // Automatically create initial roadmap for the new client
    if (newProfile) {
        const { createInitialRoadmap } = await import('../../roadmap/actions')
        await createInitialRoadmap(newProfile.profile_id, newProfile)
    }

    revalidatePath('/admin/clients')
    return { success: true }
}

export async function deleteClient(id: string) {
    const supabase = await createSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: 'Unauthorized' }

    const { error } = await supabase
        .from('career_profiles')
        .delete()
        .eq('profile_id', id)
        .eq('user_id', user.id)

    if (error) {
        console.error('Error deleting client:', error)
        return { error: error.message }
    }

    revalidatePath('/admin/clients')
    return { success: true }
}

export async function updateClientProfile(id: string, formData: FormData) {
    const supabase = await createSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: 'Unauthorized' }

    const name = formData.get('name') as string
    const email = formData.get('email') as string
    const gender = formData.get('gender') as string
    const ageGroup = formData.get('age_group') as string
    const educationLevel = formData.get('education_level') as string
    const major = formData.get('major') as string
    const workExperience = formData.get('work_experience') as string
    const careerOrientation = formData.get('career_orientation') as string
    const skillVector = formData.get('skill_vector') as string
    const recommendedCareers = formData.get('recommended_careers') as string
    const targetCompany = formData.get('target_company') as string

    const { error } = await supabase
        .from('career_profiles')
        .update({
            client_name: name,
            client_email: email,
            gender: gender || null,
            age_group: ageGroup || null,
            education_level: educationLevel || null,
            major: major || null,
            work_experience_years: parseInt(workExperience) || 0,
            career_orientation: careerOrientation || null,
            skill_vector: skillVector || null,
            recommended_careers: recommendedCareers || null,
            target_company: targetCompany || null,
        })
        .eq('profile_id', id)
        .eq('user_id', user.id)

    if (error) {
        console.error('Error updating client:', error)
        return { error: error.message }
    }

    revalidatePath('/admin/clients')
    return { success: true }
}
