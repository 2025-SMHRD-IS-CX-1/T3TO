import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const type = searchParams.get('type') // 'signup' for email verification
    const next = searchParams.get('next') ?? '/dashboard'

    if (code) {
        const supabase = await createClient()
        const { data, error } = await supabase.auth.exchangeCodeForSession(code)
        
        if (!error && data.user) {
            // 이메일 인증 완료 후 users 테이블 동기화
            const userIdStr = typeof data.user.id === 'string' ? data.user.id : String(data.user.id)
            const role = (data.user.user_metadata?.role as string) || 'counselor'
            
            await supabase
                .from('users')
                .upsert(
                    [
                        {
                            user_id: userIdStr,
                            email: data.user.email ?? '',
                            login_id: data.user.email ?? userIdStr,
                            password_hash: 'SUPABASE_AUTH',
                            role,
                        },
                    ],
                    { onConflict: 'user_id' }
                )

            // 회원가입 이메일 인증인 경우
            if (type === 'signup' && data.user.email_confirmed_at) {
                console.log('Email verification successful for signup:', data.user.email)
                const forwardedHost = request.headers.get('x-forwarded-host')
                const isLocalEnv = process.env.NODE_ENV === 'development'
                
                if (isLocalEnv) {
                    return NextResponse.redirect(`${origin}/auth/verification-success`)
                } else if (forwardedHost) {
                    return NextResponse.redirect(`https://${forwardedHost}/auth/verification-success`)
                } else {
                    return NextResponse.redirect(`${origin}/auth/verification-success`)
                }
            }

            // 일반 로그인 또는 OAuth
            const forwardedHost = request.headers.get('x-forwarded-host')
            const isLocalEnv = process.env.NODE_ENV === 'development'
            
            if (isLocalEnv) {
                return NextResponse.redirect(`${origin}${next}`)
            } else if (forwardedHost) {
                return NextResponse.redirect(`https://${forwardedHost}${next}`)
            } else {
                return NextResponse.redirect(`${origin}${next}`)
            }
        } else if (error) {
            console.error('Email verification error:', error)
            return NextResponse.redirect(`${origin}/auth/verification-error?error=${encodeURIComponent(error.message)}`)
        }
    }

    // return the user to an error page with instructions
    return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
