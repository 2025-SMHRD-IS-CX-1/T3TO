'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'

export async function login(formData: FormData) {
    const supabase = await createClient()

    const email = formData.get('email') as string
    const password = formData.get('password') as string

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    })

    if (error) {
        console.error('Login error:', error)

        // Check if it's an email confirmation error
        if (error.message.includes('Email not confirmed') || error.message.includes('email')) {
            return {
                error: '이메일 인증이 필요합니다. 가입 시 발송된 이메일의 확인 링크를 클릭해주세요.',
                needsEmailConfirmation: true
            }
        }

        return { error: error.message }
    }

    console.log('Login successful for user:', data.user?.email)

    revalidatePath('/', 'layout')
    redirect('/dashboard')
}

export async function signup(formData: FormData) {
    const supabase = await createClient()
    const origin = (await headers()).get('origin')

    const email = formData.get('email') as string
    const password = formData.get('password') as string
    const name = formData.get('name') as string

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                full_name: name,
            },
            emailRedirectTo: `${origin}/auth/callback`
        }
    })

    if (error) {
        console.error('Signup error:', error)
        return { error: error.message }
    }

    console.log('Signup successful for user:', data.user?.email)

    // Always redirect to dashboard after signup
    revalidatePath('/', 'layout')
    redirect('/dashboard')
}

export async function signInWithSocial(provider: 'google' | 'kakao' | 'naver') {
    const supabase = await createClient()
    const origin = (await headers()).get('origin')

    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: provider as any,
        options: {
            redirectTo: `${origin}/auth/callback`,
        },
    })

    if (error) {
        console.error(`${provider} login error:`, error)
        return { error: error.message }
    }

    if (data.url) {
        redirect(data.url)
    }
}
