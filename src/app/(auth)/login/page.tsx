"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { login } from "../actions"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { MoreHorizontal, User } from "lucide-react"

interface SavedAccount {
    email: string;
    lastLogin: number;
}

export default function LoginPage() {
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [rememberMe, setRememberMe] = useState(false)
    const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([])
    const router = useRouter()

    useEffect(() => {
        // Load saved accounts and remember me preference
        const saved = localStorage.getItem('saved_accounts')
        if (saved) {
            setSavedAccounts(JSON.parse(saved))
        }
        const savedEmail = localStorage.getItem('remembered_email')
        if (savedEmail) {
            // Pre-fill email if needed, or just set rememberMe
            setRememberMe(true)
        }
    }, [])

    async function handleSubmit(formData: FormData) {
        setLoading(true)
        setError(null)

        const email = formData.get('email') as string
        
        try {
            const result = await login(formData)

            if (result?.error) {
                setError(result.error)
                setLoading(false)
                return
            }

            // 성공 시 계정 저장 및 리다이렉트
            if (result?.success) {
                if (rememberMe) {
                    const updated = [...savedAccounts.filter(a => a.email !== email), { email, lastLogin: Date.now() }]
                        .sort((a, b) => b.lastLogin - a.lastLogin)
                        .slice(0, 3) // Keep last 3
                    localStorage.setItem('saved_accounts', JSON.stringify(updated))
                    localStorage.setItem('remembered_email', email)
                } else {
                    localStorage.removeItem('remembered_email')
                }
                
                window.location.href = '/dashboard'
            }
        } catch (err: any) {
            // NEXT_REDIRECT 에러는 무시 (이미 리다이렉트됨)
            if (err?.message?.includes('NEXT_REDIRECT')) {
                return
            }
            setError(err?.message || '로그인 중 오류가 발생했습니다.')
            setLoading(false)
        }
    }

    const handleQuickLogin = (email: string) => {
        // For quick login, we'd ideally have a token, but for now just pre-fill email
        const emailInput = document.getElementById('email') as HTMLInputElement
        if (emailInput) {
            emailInput.value = email
            document.getElementById('password')?.focus()
        }
    }

    return (
        <div className="flex items-center justify-center min-h-screen bg-slate-50 p-4">
            <Card className="w-full max-w-[400px] shadow-2xl border-none ring-1 ring-slate-200">
                <CardHeader className="space-y-1 pb-6 text-center">
                    <div className="mx-auto bg-purple-100 h-12 w-12 rounded-xl flex items-center justify-center mb-4">
                        <User className="h-6 w-6 text-purple-700" />
                    </div>
                    <CardTitle className="text-2xl font-bold tracking-tight">Career Bridge</CardTitle>
                    <CardDescription>계정에 로그인하여 상담 업무를 시작하세요</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Saved Accounts section */}
                    {savedAccounts.length > 0 && (
                        <div className="space-y-3">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">최근 로그인 계정</p>
                            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none">
                                {savedAccounts.map((account) => (
                                    <button
                                        key={account.email}
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

                    <form action={handleSubmit} className="space-y-4">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="email">이메일</Label>
                                <Input
                                    id="email"
                                    name="email"
                                    placeholder="name@example.com"
                                    type="email"
                                    defaultValue={typeof window !== 'undefined' ? localStorage.getItem('remembered_email') || '' : ''}
                                    required
                                    className="h-11"
                                />
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="password">비밀번호</Label>
                                    <button type="button" className="text-xs text-purple-700 hover:underline">비밀번호 찾기</button>
                                </div>
                                <Input id="password" name="password" type="password" placeholder="••••••••" required className="h-11" />
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

