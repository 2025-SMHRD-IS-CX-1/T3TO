import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

/** 서버에서 Supabase 로그인 (브라우저→Supabase 차단 시 대안) */
export async function POST(req: NextRequest) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) {
        return NextResponse.json({ error: '서버 설정 없음' }, { status: 500 })
    }

    let body: { email?: string; password?: string }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
    }
    const email = (body.email as string)?.trim()
    const password = body.password as string
    if (!email || !password) {
        return NextResponse.json({ error: '이메일과 비밀번호를 입력해주세요.' }, { status: 400 })
    }

    const res = NextResponse.json({ success: true })
    const supabase = createServerClient(url, key, {
        cookies: {
            getAll() {
                return req.cookies.getAll()
            },
            setAll(cookiesToSet) {
                cookiesToSet.forEach(({ name, value, options }) =>
                    res.cookies.set(name, value, options)
                )
            },
        },
    })

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
        const msg = error.message || ''
        if (msg === 'fetch failed' || msg.includes('fetch failed') || msg.includes('Failed to fetch')) {
            return NextResponse.json(
                { error: 'Supabase 서버에 연결할 수 없습니다. (서버 측 연결도 실패)' },
                { status: 502 }
            )
        }
        return NextResponse.json({ error: msg }, { status: 401 })
    }

    if (!data.session) {
        return NextResponse.json({ error: '세션을 받지 못했습니다.' }, { status: 500 })
    }

    return res
}
