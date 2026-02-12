'use server'

import { revalidatePath } from 'next/cache'
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

        // 이메일 인증 관련 에러 체크 제거

        return { error: error.message }
    }

    // 이메일 인증 체크 제거 - 바로 로그인 가능

    // public.users에 없으면 동기화 (role 포함)
    if (data.user) {
        const userIdStr = typeof data.user.id === 'string' ? data.user.id : String(data.user.id)
        const role = (data.user.user_metadata?.role as string) || (data.user.app_metadata?.role as string) || 'counselor'
        
        console.log('Login: public.users 동기화 시도:', {
            userId: data.user.id,
            userIdStr,
            email: data.user.email,
            role
        })
        
        const { data: userInDb, error: selectError } = await supabase
            .from('users')
            .select('user_id')
            .eq('user_id', userIdStr)
            .single()
        
        if (selectError) {
            console.warn('Login: public.users 조회 실패 (RLS 또는 존재하지 않음):', {
                error: selectError.message,
                code: selectError.code
            })
        }
        
        const { error: syncError } = await supabase
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
        if (syncError) {
            console.error('Login: public.users sync failed:', {
                error: syncError.message,
                code: syncError.code,
                details: syncError.details,
                hint: syncError.hint
            })
        } else {
            console.log('Login: public.users 동기화 성공')
        }
    }

    console.log('Login successful for user:', data.user?.email)

    revalidatePath('/', 'layout')
    
    // 성공 상태 반환 (리다이렉트는 클라이언트에서 처리)
    return { success: true }
}

export async function signup(formData: FormData) {
    try {
        const supabase = await createClient()
        const origin = (await headers()).get('origin')

        const email = formData.get('email') as string
        const password = formData.get('password') as string
        const name = formData.get('name') as string
        const privacyAgreed = formData.get('privacyAgreed') === 'true'
        const termsAgreed = formData.get('termsAgreed') === 'true'

        // 입력값 검증
        if (!email || !password || !name) {
            return { error: '모든 필드를 입력해주세요.' }
        }

        // 정보보안 동의 확인
        if (!privacyAgreed || !termsAgreed) {
            return { error: '정보보안 동의 및 이용약관 동의가 필요합니다.' }
        }

        // 이메일 인증 없이 바로 계정 생성
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: name,
                    role: 'counselor',
                    privacy_agreed: privacyAgreed,
                    terms_agreed: termsAgreed,
                    privacy_agreed_at: new Date().toISOString(),
                    terms_agreed_at: new Date().toISOString(),
                }
                // emailRedirectTo 제거 - 이메일 인증 없이 바로 사용 가능
            }
        })

        if (error) {
            console.error('=== Signup: auth.signUp 에러 ===')
            console.error('Signup error:', {
                message: error.message,
                status: error.status,
                fullError: error
            })
            
            // 사용자 친화적인 에러 메시지로 변환
            let errorMessage = error.message
            if (error.message.includes('already registered') || error.message.includes('already exists')) {
                // 이미 등록된 이메일인 경우, public.users에 있는지 확인
                console.log('이미 등록된 이메일 감지. public.users 확인 중...')
                
                const { data: existingUser } = await supabase
                    .from('users')
                    .select('user_id, email')
                    .eq('email', email)
                    .single()
                
                if (!existingUser) {
                    // auth.users에는 있지만 public.users에는 없는 경우
                    console.warn('auth.users에는 있지만 public.users에는 없습니다. sync_missing_users.sql 실행 필요')
                    errorMessage = '이미 등록된 이메일입니다. 로그인을 시도해주세요. 문제가 계속되면 관리자에게 문의하세요.'
                } else {
                    errorMessage = '이미 등록된 이메일입니다.'
                }
            } else if (error.message.includes('password')) {
                errorMessage = '비밀번호는 최소 6자 이상이어야 합니다.'
            } else if (error.message.includes('email')) {
                errorMessage = '유효한 이메일 주소를 입력해주세요.'
            }
            return { error: errorMessage }
        }

        if (!data.user) {
            return { error: '계정 생성에 실패했습니다. 다시 시도해주세요.' }
        }

        // public.users에 동기화는 트리거가 자동으로 처리함
        // 트리거: on_auth_user_created → sync_auth_user_to_public()
        // 트리거가 작동하지 않는 경우를 대비해 확인만 수행
        const user = data.user
        
        console.log('=== Signup: 트리거 확인 ===')
        console.log('Signup: auth.users 생성 완료', {
            userId: user.id,
            email: user.email,
            name: name
        })
        
        // 트리거가 자동으로 public.users에 INSERT하므로 잠시 대기 후 확인
        // 트리거는 SECURITY DEFINER이므로 RLS 정책을 우회함
        await new Promise(resolve => setTimeout(resolve, 1000))  // 1초 대기 (트리거 실행 시간 확보)
        
        // 트리거가 제대로 작동했는지 확인
        const userIdForCheck = typeof user.id === 'string' ? user.id : String(user.id)
        const { data: userInDb, error: checkError } = await supabase
            .from('users')
            .select('user_id, email, role')
            .eq('user_id', userIdForCheck)
            .single()
        
        console.log('Signup: 트리거 실행 확인', {
            userId: user.id,
            userIdForCheck,
            userInDb: userInDb ? '데이터 있음' : '데이터 없음',
            checkError: checkError ? {
                message: checkError.message,
                code: checkError.code,
                details: checkError.details
            } : null
        })
        
        // 트리거가 작동하지 않은 경우에만 수동으로 INSERT 시도
        if (!userInDb) {
            console.warn('Signup: 트리거가 작동하지 않거나 아직 실행 중. 수동 INSERT 시도')
            
            const role = (user.user_metadata?.role as string) || 'counselor'
            const insertData: any = {
                user_id: user.id,
                email: user.email ?? '',
                login_id: user.email ?? (typeof user.id === 'string' ? user.id : String(user.id)),
                password_hash: 'SUPABASE_AUTH',
            }
            
            // role 컬럼이 있으면 추가
            insertData.role = role
            
            // name 컬럼은 선택적 (테이블에 없을 수 있음)
            // name 컬럼이 있으면 추가, 없으면 에러 발생하므로 일단 제외
            // 필요시 name 컬럼을 테이블에 추가하거나, 트리거에서만 처리
            
            const { error: insertError, data: insertResult } = await supabase
                .from('users')
                .insert(insertData)
                .select()
            
            if (insertError) {
                console.error('Signup: 수동 INSERT 실패:', {
                    message: insertError.message,
                    code: insertError.code,
                    details: insertError.details,
                    hint: insertError.hint,
                    fullError: insertError
                })
                
                // RLS 정책 문제인 경우
                if (insertError.code === '42501' || 
                    insertError.message?.includes('permission') || 
                    insertError.message?.includes('policy') ||
                    insertError.message?.includes('row-level security')) {
                    return { 
                        error: `트리거가 작동하지 않고 수동 INSERT도 실패했습니다 (RLS 정책 문제). check_and_fix_trigger.sql 파일을 실행하세요. 에러: ${insertError.message}` 
                    }
                }
                
                // 중복 키 에러는 트리거가 이미 처리했을 수 있음
                if (insertError.code === '23505' || insertError.message?.includes('duplicate key')) {
                    console.log('Signup: 중복 키 에러 - 트리거가 이미 처리했을 수 있음')
                    // 다시 한 번 확인
                    const { data: retryCheck } = await supabase
                        .from('users')
                        .select('user_id')
                        .eq('user_id', userIdForCheck)
                        .single()
                    
                    if (retryCheck) {
                        console.log('Signup: 확인 결과 트리거가 정상 작동했습니다.')
                        // 성공으로 처리
                    } else {
                        return { 
                            error: `데이터베이스 저장 실패: ${insertError.message}` 
                        }
                    }
                } else {
                    return { 
                        error: `데이터베이스 저장 실패 (코드: ${insertError.code}): ${insertError.message}` 
                    }
                }
            } else {
                console.log('Signup: 수동 INSERT 성공:', insertResult)
            }
        } else {
            console.log('Signup: 트리거가 정상 작동하여 users 테이블에 데이터가 생성되었습니다.')
        }

        console.log('Signup successful for user:', data.user?.email)

        revalidatePath('/', 'layout')

        // 성공 상태 반환 - 이메일 인증 없이 바로 로그인 가능
        return { 
            success: true, 
            needsEmailVerification: false 
        }
    } catch (err: any) {
        console.error('=== Signup: 예상치 못한 에러 ===')
        console.error('Signup unexpected error:', {
            message: err.message,
            stack: err.stack,
            fullError: err
        })
        return { error: err.message || '회원가입 중 오류가 발생했습니다. 다시 시도해주세요.' }
    }
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

/** 회원탈퇴: auth.users와 public.users 모두 삭제 */
export async function deleteAccount() {
    try {
        const supabase = await createClient()
        
        // 현재 사용자 확인
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        
        if (userError || !user) {
            console.error('DeleteAccount: 사용자 확인 실패:', userError)
            return { error: '사용자 인증에 실패했습니다.' }
        }
        
        const userId = user.id
        
        console.log('DeleteAccount: 회원탈퇴 시작', {
            userId,
            email: user.email
        })
        
        // 1. RPC 함수를 통해 auth.users 삭제 (트리거가 public.users도 자동 삭제)
        // setup_account_deletion.sql에서 생성한 delete_auth_user 함수 사용
        const { error: rpcError } = await supabase.rpc('delete_auth_user', {
            user_id_param: userId
        })
        
        if (rpcError) {
            console.error('DeleteAccount: RPC 함수 실행 실패:', rpcError)
            
            // RPC 함수가 없는 경우 수동으로 public.users만 삭제
            const userIdStr = typeof userId === 'string' ? userId : String(userId)
            const { error: deletePublicError } = await supabase
                .from('users')
                .delete()
                .eq('user_id', userIdStr)
            
            if (deletePublicError) {
                console.error('DeleteAccount: public.users 삭제 실패:', deletePublicError)
                return { 
                    error: `회원탈퇴 실패: ${rpcError.message}. public.users 삭제도 실패했습니다. setup_account_deletion.sql을 실행해주세요.` 
                }
            }
            
            // public.users만 삭제된 경우, auth.users는 수동으로 삭제 필요
            console.warn('DeleteAccount: public.users만 삭제됨. auth.users는 Supabase 대시보드에서 수동 삭제 필요')
            return { 
                error: 'public.users는 삭제되었지만, auth.users 삭제를 위해 setup_account_deletion.sql을 실행해주세요.' 
            }
        }
        
        console.log('DeleteAccount: RPC 함수 실행 성공 (auth.users 및 public.users 삭제 완료)')
        
        // 2. 세션 종료 및 로그아웃
        const { error: signOutError } = await supabase.auth.signOut()
        
        if (signOutError) {
            console.error('DeleteAccount: 로그아웃 실패:', signOutError)
        }
        
        console.log('DeleteAccount: 회원탈퇴 완료')
        
        return { success: true }
    } catch (err: any) {
        console.error('DeleteAccount: 예상치 못한 에러:', err)
        return { error: err.message || '회원탈퇴 중 오류가 발생했습니다.' }
    }
}
