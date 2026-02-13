'use server'

import { createClient as createSupabaseClient, getEffectiveUserId } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function getClients(counselorId?: string | null) {
    const supabase = await createSupabaseClient()
    const userIdStr = await getEffectiveUserId(counselorId)
    
    if (!userIdStr) {
        console.warn('getClients: userIdStr이 null입니다. counselorId:', counselorId)
        return []
    }

    // UUID를 문자열로 변환 (career_profiles.user_id는 VARCHAR(50))
    const userIdForQuery = typeof userIdStr === 'string' ? userIdStr : String(userIdStr)

    // 먼저 모든 내담자 조회
    const { data: profiles, error: profilesError } = await supabase
        .from('career_profiles')
        .select('*')
        .eq('user_id', userIdForQuery)
        .order('created_at', { ascending: false })

    if (profilesError) {
        console.error('Error fetching clients (career_profiles):', profilesError, { userIdStr, counselorId })
        return []
    }

    if (!profiles || profiles.length === 0) {
        console.log('⚠️ getClients: 내담자 데이터가 없습니다.', { 
            userIdForQuery, 
            counselorId, 
            userIdStr,
        })
        return []
    }

    // 각 내담자별로 활성화된 로드맵 조회
    const profileIds = profiles.map((p: any) => p.profile_id)
    const { data: roadmaps, error: roadmapsError } = await supabase
        .from('career_roadmaps')
        .select('roadmap_id, profile_id, is_active, target_job, target_company, updated_at')
        .in('profile_id', profileIds)
        .eq('is_active', true)
        .eq('user_id', userIdForQuery)

    if (roadmapsError) {
        console.warn('Error fetching roadmaps (non-critical):', roadmapsError)
    }

    // 로드맵을 profile_id로 그룹화
    const roadmapMap = new Map()
    if (roadmaps) {
        roadmaps.forEach((r: any) => {
            if (r.profile_id) {
                roadmapMap.set(r.profile_id, r)
            }
        })
    }

    const data = profiles

    // [검증 로그] DB에서 가져온 첫 번째 데이터의 구조를 출력합니다.
    if (data && data.length > 0) {
        console.log('✅ getClients: 내담자 데이터 조회 성공', {
            count: data.length,
            first_id: data[0].profile_id,
            first_user_id: data[0].user_id,
            query_user_id: userIdForQuery,
            roadmap_count: roadmapMap.size,
        })
    }

    // Map DB fields to UI with roadmap information
    return data.map((profile: any) => {
        // 로드맵 정보 추출 (활성화된 로드맵만)
        const activeRoadmap = roadmapMap.get(profile.profile_id) || null
        
        return {
            ...profile,
            id: profile.profile_id,
            name: profile.client_name || '이름 없음',
            email: profile.client_email || '-',
            status: 'active',
            progress: '0%',
            lastActive: new Date(profile.created_at).toLocaleDateString(),
            plan: 'Basic',
            hasRoadmap: !!activeRoadmap,
            roadmap: activeRoadmap
        }
    })
}

export async function createClientProfile(formData: FormData, counselorId?: string | null) {
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

    const userIdStr = await getEffectiveUserId(counselorId)
    if (!userIdStr) {
        return { error: 'Unauthorized' }
    }

    // UUID를 문자열로 변환 (public.users.user_id는 VARCHAR(50))
    const userIdForPublicUsers = typeof userIdStr === 'string' ? userIdStr : String(userIdStr)

    // public.users에 해당 사용자가 있는지 확인하고 없으면 생성
    const { data: existingUser } = await supabase
        .from('users')
        .select('user_id')
        .eq('user_id', userIdForPublicUsers)
        .single()

    if (!existingUser) {
        // public.users에 사용자 추가 (role 컬럼이 없을 수 있으므로 먼저 role 없이 시도)
        const { data: authUser } = await supabase.auth.getUser()
        const userDataWithoutRole = {
            user_id: userIdForPublicUsers,
            email: authUser?.user?.email || email || '',
            login_id: authUser?.user?.email || email || userIdForPublicUsers,
            password_hash: 'SUPABASE_AUTH',
        }

        // 먼저 role 없이 시도
        let { error: userError } = await supabase
            .from('users')
            .upsert([userDataWithoutRole], {
                onConflict: 'user_id'
            })

        // role 컬럼 관련 에러가 아니면 그대로 사용
        // role 컬럼 에러면 role을 포함해서 다시 시도 (role 컬럼이 있는 경우)
        if (userError && (userError.message?.includes('role') || userError.message?.includes('column') || userError.code === '42703')) {
            const userDataWithRole = {
                ...userDataWithoutRole,
                role: 'counselor',
            }
            const retryResult = await supabase
                .from('users')
                .upsert([userDataWithRole], {
                    onConflict: 'user_id'
                })
            // role 포함해서도 실패하면 원래 에러 반환
            if (retryResult.error) {
                console.error('Error syncing user to public.users (with role):', retryResult.error)
                return { error: `사용자 동기화 실패: ${retryResult.error.message}` }
            }
        } else if (userError) {
            console.error('Error syncing user to public.users:', userError)
            return { error: `사용자 동기화 실패: ${userError.message}` }
        }
    }

    console.log('createClientProfile: 내담자 추가 시도', { userIdForPublicUsers, name, email })
    
    const { data: newProfile, error } = await supabase
        .from('career_profiles')
        .insert([
            {
                user_id: userIdForPublicUsers,
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

    console.log('createClientProfile: 내담자 추가 성공', { profile_id: newProfile?.profile_id, user_id: newProfile?.user_id })

    // Automatically create initial roadmap for the new client
    if (newProfile) {
        const { createInitialRoadmap } = await import('../../roadmap/actions')
        await createInitialRoadmap(newProfile.profile_id, newProfile, counselorId)
    }

    // 관련 페이지들 캐시 무효화
    revalidatePath('/admin/clients')
    revalidatePath('/dashboard')
    return { success: true }
}

export async function deleteClient(id: string, counselorId?: string | null) {
    const supabase = await createSupabaseClient()
    const userIdStr = await getEffectiveUserId(counselorId)
    
    if (!userIdStr) {
        return { error: 'Unauthorized' }
    }

    // 먼저 해당 내담자가 존재하고 권한이 있는지 확인
    const { data: profile } = await supabase
        .from('career_profiles')
        .select('profile_id, user_id')
        .eq('profile_id', id)
        .eq('user_id', userIdStr)
        .single()

    if (!profile) {
        return { error: '내담자를 찾을 수 없거나 권한이 없습니다.' }
    }

    const { error } = await supabase
        .from('career_profiles')
        .delete()
        .eq('profile_id', id)
        .eq('user_id', userIdStr)

    if (error) {
        console.error('Error deleting client:', error)
        return { error: error.message }
    }

    revalidatePath('/admin/clients')
    return { success: true }
}

export async function updateClientProfile(id: string, formData: FormData, counselorId?: string | null) {
    const supabase = await createSupabaseClient()
    const userIdStr = await getEffectiveUserId(counselorId)
    
    if (!userIdStr) {
        return { error: 'Unauthorized' }
    }

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

    // 먼저 해당 내담자가 존재하고 권한이 있는지 확인
    const { data: profile } = await supabase
        .from('career_profiles')
        .select('profile_id, user_id')
        .eq('profile_id', id)
        .eq('user_id', userIdStr)
        .single()

    if (!profile) {
        return { error: '내담자를 찾을 수 없거나 권한이 없습니다.' }
    }

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
        .eq('user_id', userIdStr)

    if (error) {
        console.error('Error updating client:', error)
        return { error: error.message }
    }

    revalidatePath('/admin/clients')
    return { success: true }
}
