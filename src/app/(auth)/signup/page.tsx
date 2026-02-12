"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { signup } from "../actions"
import { useState } from "react"

export default function SignupPage() {
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [privacyAgreed, setPrivacyAgreed] = useState(false)
    const [termsAgreed, setTermsAgreed] = useState(false)

    async function handleSubmit(formData: FormData) {
        setLoading(true)
        setError(null)

        // 동의 여부를 FormData에 추가
        formData.set('privacyAgreed', privacyAgreed.toString())
        formData.set('termsAgreed', termsAgreed.toString())

        try {
            const result = await signup(formData)
            
            console.log('Signup result (전체):', result)
            console.log('Signup result.error:', result?.error)
            console.log('Signup result.success:', result?.success)

            if (result?.error) {
                console.error('Signup error (상세):', {
                    error: result.error,
                    fullResult: result
                })
                setError(result.error)
                setLoading(false)
                return
            }

            // 성공 시 대시보드로 리다이렉트
            if (result?.success) {
                console.log('Signup successful, redirecting to dashboard...')
                setTimeout(() => {
                    window.location.href = '/dashboard'
                }, 300)
            } else {
                // 성공하지 않았는데 에러도 없는 경우
                console.warn('Signup returned without success or error:', result)
                setError('회원가입 처리 중 문제가 발생했습니다. 다시 시도해주세요.')
                setLoading(false)
            }
        } catch (err: any) {
            console.error('Signup exception:', err)
            // NEXT_REDIRECT 에러는 무시 (이미 리다이렉트됨)
            if (err?.message?.includes('NEXT_REDIRECT')) {
                return
            }
            setError(err?.message || '회원가입 중 오류가 발생했습니다.')
            setLoading(false)
        }
    }

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50">
            <Card className="w-[400px]">
                <CardHeader>
                    <CardTitle>회원가입</CardTitle>
                    <CardDescription>새로운 계정을 생성하고 시작하세요</CardDescription>
                </CardHeader>
                <CardContent>
                    <form action={handleSubmit} className="grid w-full items-center gap-4">
                        <div className="flex flex-col space-y-1.5">
                            <Input id="name" name="name" placeholder="이름" required />
                        </div>
                        <div className="flex flex-col space-y-1.5">
                            <Input id="email" name="email" placeholder="이메일" type="email" required />
                        </div>
                        <div className="flex flex-col space-y-1.5">
                            <Input id="password" name="password" type="password" placeholder="비밀번호" required />
                        </div>

                        {/* 정보보안 동의 */}
                        <div className="flex flex-col space-y-3 mt-2">
                            <div className="flex items-start space-x-2">
                                <Checkbox 
                                    id="privacyAgreed" 
                                    checked={privacyAgreed}
                                    onCheckedChange={(checked) => setPrivacyAgreed(checked === true)}
                                    className="mt-1"
                                />
                                <Label htmlFor="privacyAgreed" className="text-sm leading-relaxed cursor-pointer">
                                    <span className="font-semibold">[필수]</span> 개인정보 수집 및 이용에 동의합니다.
                                    <Link href="/privacy-policy" className="text-purple-700 hover:underline ml-1">
                                        자세히 보기
                                    </Link>
                                </Label>
                            </div>
                            <div className="flex items-start space-x-2">
                                <Checkbox 
                                    id="termsAgreed" 
                                    checked={termsAgreed}
                                    onCheckedChange={(checked) => setTermsAgreed(checked === true)}
                                    className="mt-1"
                                />
                                <Label htmlFor="termsAgreed" className="text-sm leading-relaxed cursor-pointer">
                                    <span className="font-semibold">[필수]</span> 이용약관에 동의합니다.
                                    <Link href="/terms" className="text-purple-700 hover:underline ml-1">
                                        자세히 보기
                                    </Link>
                                </Label>
                            </div>
                        </div>

                        {error && (
                            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
                                <p className="font-semibold mb-1">회원가입 실패</p>
                                <p>{error}</p>
                            </div>
                        )}

                        <div className="flex flex-col space-y-2 mt-4">
                            <Button 
                                className="w-full" 
                                disabled={loading || !privacyAgreed || !termsAgreed}
                                type="submit"
                            >
                                {loading ? "계정 생성 중..." : "계정 생성"}
                            </Button>
                        </div>
                    </form>
                </CardContent>
                <CardFooter className="flex flex-col space-y-2">
                    <div className="text-sm text-center text-gray-500">
                        이미 계정이 있으신가요? <Link href="/login" className="text-purple-700 hover:underline">로그인</Link>
                    </div>
                </CardFooter>
            </Card>
        </div>
    )
}
