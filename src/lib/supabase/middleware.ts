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

    // Authenticated users: redirect away from auth pages or root to dashboard
    if (user && (isAuthPage || request.nextUrl.pathname === '/')) {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        return NextResponse.redirect(url)
    }

    // /admin/* 는 role = admin 만 접근 가능 (profiles_role 테이블 기준)
    if (user && request.nextUrl.pathname.startsWith('/admin')) {
        const { data: profile, error: profileError } = await supabase
            .from('profiles_role')
            .select('role')
            .eq('id', user.id)
            .single()
        
        // 디버깅: 문제 진단을 위한 로그
        if (profileError) {
            console.error('[Middleware] profiles_role 조회 실패:', {
                userId: user.id,
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
            email: user.email,
            role: profile.role,
            path: request.nextUrl.pathname
        })
    }

    return supabaseResponse
}
