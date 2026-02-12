import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
                    supabaseResponse = NextResponse.next({
                        request,
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    const {
        data: { user },
    } = await supabase.auth.getUser()

    // Protected routes: redirect to login if not authenticated
    const isAuthPage = request.nextUrl.pathname.startsWith('/login') ||
        request.nextUrl.pathname.startsWith('/signup') ||
        request.nextUrl.pathname.startsWith('/auth')

    if (!user && !isAuthPage) {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
    }

    // public.users 테이블에 사용자가 존재하는지 확인
    // DB를 지웠거나 동기화가 안 된 경우 로그인 페이지로 리다이렉트
    if (user && !isAuthPage) {
        const userIdStr = typeof user.id === 'string' ? user.id : String(user.id)
        
        console.log('[Middleware] public.users 조회 시도:', {
            userId: user.id,
            userIdStr,
            email: user.email,
            path: request.nextUrl.pathname
        })
        
        const { data: userInDb, error: dbError } = await supabase
            .from('users')
            .select('user_id, role')
            .eq('user_id', userIdStr)
            .single()

        // DB에 사용자가 없거나 RLS 정책으로 조회 실패한 경우
        if (!userInDb || dbError) {
            console.error('[Middleware] public.users 조회 실패:', {
                userId: user.id,
                userIdStr,
                email: user.email,
                path: request.nextUrl.pathname,
                error: dbError?.message,
                code: dbError?.code,
                details: dbError?.details,
                hint: dbError?.hint,
                hasUserInDb: !!userInDb
            })
            
            // RLS 정책 에러인 경우 (42501) - 정책 문제
            // 또는 PGRST116 (no rows returned) - 레코드가 없음
            if (dbError?.code === '42501' || dbError?.code === 'PGRST116' || 
                dbError?.message?.includes('policy') || dbError?.message?.includes('permission') ||
                dbError?.message?.includes('No rows found')) {
                console.error('[Middleware] RLS 정책 에러 또는 레코드 없음:', {
                    code: dbError.code,
                    message: dbError.message,
                    hint: 'users 테이블 SELECT 정책을 확인하거나, 회원가입 후 users 테이블에 레코드가 있는지 확인하세요.'
                })
                // RLS 에러인 경우에도 세션은 유지하고 계속 진행 (회원가입 직후일 수 있음)
                // 단, 실제로 DB에 없으면 나중에 다른 곳에서 에러 발생
            } else {
                // DB에 사용자가 없으면 세션 무효화하고 로그인 페이지로 리다이렉트
                console.warn('[Middleware] public.users에 사용자가 없음. 세션 무효화:', {
                    userId: user.id,
                    userIdStr,
                    email: user.email,
                    dbError: dbError?.message
                })
                
                // 세션 무효화 (쿠키 삭제)
                await supabase.auth.signOut()
                
                const url = request.nextUrl.clone()
                url.pathname = '/login'
                return NextResponse.redirect(url)
            }
        } else {
            console.log('[Middleware] public.users 조회 성공:', {
                userId: user.id,
                userIdStr,
                email: user.email,
                role: userInDb.role
            })
        }
    }

    // Authenticated users: redirect away from auth pages or root to dashboard
    // 이메일 인증 체크 제거 - 바로 접근 가능
    if (user && (isAuthPage || request.nextUrl.pathname === '/')) {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        return NextResponse.redirect(url)
    }

    // /admin/* 는 role = admin 만 접근 가능 (users 테이블 기준)
    if (user && request.nextUrl.pathname.startsWith('/admin')) {
        // auth.users.id를 문자열로 변환하여 users.user_id와 매칭
        const userIdStr = typeof user.id === 'string' ? user.id : String(user.id)
        
        const { data: profile, error: profileError } = await supabase
            .from('users')
            .select('role')
            .eq('user_id', userIdStr)
            .single()
        
        // 디버깅: 문제 진단을 위한 로그
        if (profileError) {
            console.error('[Middleware] users 테이블 조회 실패:', {
                userId: user.id,
                userIdStr,
                email: user.email,
                error: profileError.message,
                code: profileError.code,
                details: profileError.details,
                hint: profileError.hint
            })
        }
        
        if (!profile || profile.role !== 'admin') {
            console.warn('[Middleware] 관리자 페이지 접근 거부:', {
                userId: user.id,
                userIdStr,
                email: user.email,
                foundProfile: !!profile,
                role: profile?.role || '없음',
                path: request.nextUrl.pathname
            })
            const url = request.nextUrl.clone()
            url.pathname = '/dashboard'
            return NextResponse.redirect(url)
        }
        
        console.log('[Middleware] 관리자 페이지 접근 허용:', {
            userId: user.id,
            userIdStr,
            email: user.email,
            role: profile.role,
            path: request.nextUrl.pathname
        })
    }

    return supabaseResponse
}
