"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { syncLoginUser } from "../actions"
import { createClient } from "@/lib/supabase/client"
import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"

interface SavedAccount {
    email: string
    lastLogin: number
}

export default function LoginPage() {
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [rememberMe, setRememberMe] = useState(false)
    const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([])
    const [signupSuccess, setSignupSuccess] = useState(false)
    const [prefillEmail, setPrefillEmail] = useState('')
    const [hasLoadedStorage, setHasLoadedStorage] = useState(false)
    const router = useRouter()
    const searchParams = useSearchParams()

    useEffect(() => {
        if (typeof window === 'undefined') return
        const saved = localStorage.getItem('saved_accounts')
        if (saved) {
            try {
                setSavedAccounts(JSON.parse(saved))
            } catch {
                setSavedAccounts([])
            }
        }
        const remembered = localStorage.getItem('remembered_email')
        if (remembered) {
            setRememberMe(true)
            setPrefillEmail(remembered)
        }
        setHasLoadedStorage(true)
        if (searchParams.get('signup') === 'success') {
            setSignupSuccess(true)
            router.replace('/login')
        }
    }, [searchParams, router])

    const handleQuickLogin = (email: string) => {
        const emailInput = document.getElementById('email') as HTMLInputElement
        if (emailInput) {
            emailInput.value = email
            document.getElementById('password')?.focus()
        }
    }

    async function handleSubmit(formData: FormData) {
        setLoading(true)
        setError(null)

        const email = (formData.get('email') as string)?.trim() ?? ''
        const password = formData.get('password') as string

        if (!email || !password) {
            setError('이메일과 비밀번호를 입력해주세요.')
            setLoading(false)
            return
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        if (!supabaseUrl || supabaseUrl === 'undefined') {
            setError('Supabase URL이 설정되지 않았습니다. .env.local에 NEXT_PUBLIC_SUPABASE_URL을 넣고 터미널에서 npm run dev 를 다시 실행해주세요.')
            setLoading(false)
            return
        }

        const supabase = createClient()

        const tryServerSignin = async (): Promise<boolean> => {
            const r = await fetch('/api/auth/signin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            })
            const j = await r.json().catch(() => ({}))
            if (r.ok && j.success) return true
            setError((j as { error?: string }).error || '서버 로그인 실패')
            return false
        }

        const saveAccountIfRemembered = () => {
            if (rememberMe) {
                const updated = [...savedAccounts.filter(a => a.email !== email), { email, lastLogin: Date.now() }]
                    .sort((a, b) => b.lastLogin - a.lastLogin).slice(0, 3)
                localStorage.setItem('saved_accounts', JSON.stringify(updated))
                localStorage.setItem('remembered_email', email)
            } else {
                localStorage.removeItem('remembered_email')
            }
        }

        try {
            const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })

            if (authError) {
                const msg = authError.message || ''
                if (msg === 'fetch failed' || msg.includes('fetch failed') || msg.includes('Failed to fetch')) {
                    const serverOk = await tryServerSignin()
                    if (serverOk) {
                        syncLoginUser().catch(() => {})
                        saveAccountIfRemembered()
                        window.location.href = '/dashboard'
                        return
                    }
                    setLoading(false)
                    return
                }
                if (msg.includes('Invalid login')) {
                    setError('이메일 또는 비밀번호가 올바르지 않습니다.')
                } else {
                    setError(msg)
                }
                setLoading(false)
                return
            }

            if (!data.session) {
                setError('로그인 세션을 받지 못했습니다. 다시 시도해주세요.')
                setLoading(false)
                return
            }

            syncLoginUser().catch(() => {})
            saveAccountIfRemembered()
            window.location.href = '/dashboard'
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err)
            if (typeof msg === 'string' && msg.includes('NEXT_REDIRECT')) return
            if (typeof msg === 'string' && (msg === 'Failed to fetch' || msg.includes('fetch failed') || msg.includes('Failed to fetch'))) {
                const serverOk = await tryServerSignin()
                if (serverOk) {
                    syncLoginUser().catch(() => {})
                    saveAccountIfRemembered()
                    window.location.href = '/dashboard'
                    return
                }
                setError('Supabase 서버에 연결할 수 없습니다. ① 인터넷 연결 확인 ② 새 탭에서 주소 열어 보기: ' + supabaseUrl + ' ③ .env.local 확인 후 npm run dev 재시작.')
            } else {
                setError(msg || '로그인 중 오류가 발생했습니다.')
            }
            setLoading(false)
        }
    }

    return (
        <div className="flex items-center justify-center min-h-screen bg-slate-50 p-4">
            <Card className="w-full max-w-[400px] shadow-2xl border-none ring-1 ring-slate-200">
                <CardHeader className="space-y-1 pb-6 text-center">
                    <div className="mx-auto mb-4 flex items-center justify-center">
                        <img src="/logo.png" alt="Career Bridge" className="h-24 w-auto object-contain mix-blend-multiply" />
                    </div>
                    <CardDescription>계정에 로그인하여 상담 업무를 시작하세요</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {savedAccounts.length > 0 && (
                        <div className="space-y-3">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">저장된 계정</p>
                            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none">
                                {savedAccounts.map((account) => (
                                    <button
                                        key={account.email}
                                        type="button"
                                        onClick={() => handleQuickLogin(account.email)}
                                        className="flex flex-col items-center gap-1.5 min-w-[70px] group transition-all"
                                    >
                                        <div className="h-12 w-12 rounded-full bg-purple-50 flex items-center justify-center border-2 border-transparent group-hover:border-purple-300 group-hover:bg-white transition-all shadow-sm">
                                            <span className="text-sm font-bold text-purple-700">{account.email.substring(0, 2).toUpperCase()}</span>
                                        </div>
                                        <span className="text-[10px] text-slate-500 truncate w-16 text-center">{account.email.split('@')[0]}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <form action={handleSubmit} className="space-y-4" autoComplete="off">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="email">이메일</Label>
                                <Input
                                    key={hasLoadedStorage ? 'email-prefilled' : 'email-initial'}
                                    id="email"
                                    name="email"
                                    placeholder="name@example.com"
                                    type="email"
                                    autoComplete="off"
                                    defaultValue={prefillEmail}
                                    required
                                    className="h-11"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="password">비밀번호</Label>
                                <Input
                                    id="password"
                                    name="password"
                                    type="password"
                                    placeholder="••••••••"
                                    autoComplete="current-password"
                                    required
                                    className="h-11"
                                />
                            </div>
                        </div>

                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="remember"
                                checked={rememberMe}
                                onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                            />
                            <Label htmlFor="remember" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer">
                                계정 저장하기
                            </Label>
                        </div>

                        {signupSuccess && (
                            <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-xs font-medium">
                                <p className="font-semibold mb-1">회원가입이 완료되었습니다!</p>
                                <p>이메일과 비밀번호를 입력하여 로그인해주세요.</p>
                            </div>
                        )}

                        {error && (
                            <div className={`p-3 rounded-lg border text-xs font-medium ${
                                error.includes('이메일 인증')
                                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                                    : 'bg-red-50 border-red-100 text-red-600'
                            }`}>
                                {error}
                                {error.includes('이메일 인증') && (
                                    <div className="mt-2 pt-2 border-t border-amber-300">
                                        <p className="text-[10px] text-amber-700">
                                            이메일 받은편지함을 확인하시거나, 스팸 폴더를 확인해주세요.
                                        </p>
                                    </div>
                                )}
                                {(error.includes('연결할 수 없습니다') || error.includes('fetch failed') || error.includes('Failed to fetch')) && (
                                    <div className="mt-2 pt-2 border-t border-red-200 space-y-1">
                                        <p className="text-[10px] text-red-700">
                                            시크릿(인프라이빗) 창에서 시도하거나, 광고 차단·확장 프로그램을 끄고 다시 시도해 보세요.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        <Button className="w-full h-11 bg-purple-700 hover:bg-purple-800 text-white font-bold" disabled={loading}>
                            {loading ? "보안 로그인 중..." : "로그인"}
                        </Button>
                    </form>
                </CardContent>
                <CardFooter className="pb-8">
                    <div className="text-sm text-center w-full text-slate-500">
                        계정이 없으신가요? <Link href="/signup" className="text-purple-700 font-bold hover:underline">회원가입</Link>
                    </div>
                </CardFooter>
            </Card>
        </div>
    )
}
