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

/** profiles_role 테이블에서 현재 로그인 사용자의 role 조회 (admin | user) */
export async function getCurrentUserRole(): Promise<'admin' | 'user' | null> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        console.warn('[getCurrentUserRole] 로그인된 사용자가 없습니다.')
        return null
    }
    
    const { data, error } = await supabase
        .from('profiles_role')
        .select('role')
        .eq('id', user.id)
        .single()
    
    // 디버깅: 문제 진단을 위한 로그
    if (error) {
        console.error('[getCurrentUserRole] profiles_role 조회 실패:', {
            userId: user.id,
            email: user.email,
            error: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint
        })
        return null
    }
    
    if (!data) {
        console.warn('[getCurrentUserRole] profiles_role에 레코드가 없습니다:', {
            userId: user.id,
            email: user.email
        })
        return null
    }
    
    console.log('[getCurrentUserRole] 역할 조회 성공:', {
        userId: user.id,
        email: user.email,
        role: data.role
    })
    
    return (data.role as 'admin' | 'user') ?? null
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
        // counselorId가 유효한지 확인 (profiles_role에 존재하고 role='user'인지)
        const { data: counselor } = await supabase
            .from('profiles_role')
            .select('id, role')
            .eq('id', counselorId)
            .eq('role', 'user')
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

/** 관리자용: 상담사(role=user) 목록. RLS로 admin만 전체 조회 가능 */
export async function getCounselorsForAdmin(): Promise<{ id: string; email: string | null }[]> {
    const supabase = await createClient()
    const role = await getCurrentUserRole()
    if (role !== 'admin') {
        console.warn('getCounselorsForAdmin: 현재 사용자는 admin이 아닙니다.')
        return []
    }
    const { data, error } = await supabase
        .from('profiles_role')
        .select('id, email')
        .eq('role', 'user')
        .order('email')
    
    if (error) {
        console.error('Error fetching counselors for admin:', error)
        return []
    }
    
    return (data ?? []).map((r: { id: string; email: string | null }) => ({ id: r.id, email: r.email }))
}

/** 레이아웃/사이드바용: 현재 사용자 역할과 (관리자일 때) 상담사 목록 */
export async function getAdminContext(): Promise<{ role: 'admin' | 'user' | null; counselors: { id: string; email: string | null }[] }> {
    const role = await getCurrentUserRole()
    const counselors = role === 'admin' ? await getCounselorsForAdmin() : []
    return { role, counselors }
}
