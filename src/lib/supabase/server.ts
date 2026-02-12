import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
    const cookieStore = await cookies()

    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        )
                    } catch {
                        // The `setAll` method was called from a Server Component.
                        // This can be ignored if you have middleware refreshing
                        // user sessions.
                    }
                },
            },
        }
    )
}

/** users 테이블에서 현재 로그인 사용자의 role 조회 (admin | counselor) */
export async function getCurrentUserRole(): Promise<'admin' | 'user' | null> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        console.warn('[getCurrentUserRole] 로그인된 사용자가 없습니다.')
        return null
    }
    
    // auth.users.id를 문자열로 변환하여 users.user_id와 매칭
    const userIdStr = typeof user.id === 'string' ? user.id : String(user.id)
    
    const { data, error } = await supabase
        .from('users')
        .select('role')
        .eq('user_id', userIdStr)
        .single()
    
    // 디버깅: 문제 진단을 위한 로그
    if (error) {
        console.error('[getCurrentUserRole] users 테이블 조회 실패:', {
            userId: user.id,
            userIdStr,
            email: user.email,
            error: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint
        })
        return null
    }
    
    if (!data) {
        console.warn('[getCurrentUserRole] users 테이블에 레코드가 없습니다:', {
            userId: user.id,
            userIdStr,
            email: user.email
        })
        return null
    }
    
    // 'counselor'를 'user'로 매핑 (기존 코드 호환성)
    const role = data.role === 'counselor' ? 'user' : (data.role === 'admin' ? 'admin' : null)
    
    console.log('[getCurrentUserRole] 역할 조회 성공:', {
        userId: user.id,
        userIdStr,
        email: user.email,
        role: data.role,
        mappedRole: role
    })
    
    return role
}

/** 관리자일 때 선택한 상담사 ID, 아니면 현재 로그인 사용자 ID 반환 (데이터 조회용) */
export async function getEffectiveUserId(counselorId?: string | null): Promise<string | null> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        console.warn('getEffectiveUserId: 로그인된 사용자가 없습니다.')
        return null
    }
    const role = await getCurrentUserRole()
    
    // 관리자가 상담사를 선택했을 때만 counselorId 사용
    if (role === 'admin' && counselorId) {
        // counselorId가 유효한지 확인 (users 테이블에 존재하고 role='counselor'인지)
        const { data: counselor } = await supabase
            .from('users')
            .select('user_id, role')
            .eq('user_id', counselorId)
            .eq('role', 'counselor')
            .single()
        
        if (counselor) {
            return counselorId
        } else {
            console.warn(`getEffectiveUserId: 선택한 상담사 ID(${counselorId})가 유효하지 않습니다.`)
            // 관리자가 상담사를 선택하지 않았거나 유효하지 않은 경우 null 반환
            return null
        }
    }
    
    return typeof user.id === 'string' ? user.id : String(user.id)
}

/** 관리자용: 상담사(role=counselor) 목록 */
export async function getCounselorsForAdmin(): Promise<{ id: string; email: string | null }[]> {
    const supabase = await createClient()
    const role = await getCurrentUserRole()
    if (role !== 'admin') {
        console.warn('getCounselorsForAdmin: 현재 사용자는 admin이 아닙니다.')
        return []
    }
    const { data, error } = await supabase
        .from('users')
        .select('user_id, email')
        .eq('role', 'counselor')
        .order('email')
    
    if (error) {
        console.error('Error fetching counselors for admin:', error)
        return []
    }
    
    return (data ?? []).map((r: { user_id: string; email: string | null }) => ({ id: r.user_id, email: r.email }))
}

/** 레이아웃/사이드바용: 현재 사용자 역할과 (관리자일 때) 상담사 목록 */
export async function getAdminContext(): Promise<{ role: 'admin' | 'user' | null; counselors: { id: string; email: string | null }[] }> {
    try {
        const role = await getCurrentUserRole()
        
        // role이 null이면 에러이지만, 빈 배열로 반환하여 페이지가 로드되도록 함
        if (!role) {
            console.warn('[getAdminContext] role을 조회할 수 없습니다. 빈 컨텍스트로 반환합니다.')
            return { role: null, counselors: [] }
        }
        
        const counselors = role === 'admin' ? await getCounselorsForAdmin() : []
        return { role, counselors }
    } catch (error: any) {
        console.error('[getAdminContext] 에러 발생:', {
            error: error.message,
            code: error.code,
            details: error.details
        })
        // 에러가 발생해도 페이지가 로드되도록 빈 컨텍스트 반환
        return { role: null, counselors: [] }
    }
}
