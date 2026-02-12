"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Mail, CheckCircle2 } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"

export default function VerifyEmailPage() {
    const searchParams = useSearchParams()
    const email = searchParams.get('email')

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50">
            <Card className="w-[450px]">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-purple-100 flex items-center justify-center">
                        <Mail className="h-8 w-8 text-purple-600" />
                    </div>
                    <CardTitle className="text-2xl">이메일 인증이 필요합니다</CardTitle>
                    <CardDescription className="pt-2">
                        {email ? (
                            <>
                                <span className="font-semibold text-purple-700">{email}</span>로 인증 메일을 발송했습니다.
                            </>
                        ) : (
                            "가입 시 입력하신 이메일로 인증 메일을 발송했습니다."
                        )}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                        <p className="text-sm font-semibold text-blue-900">다음 단계:</p>
                        <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                            <li>이메일 받은편지함을 확인해주세요</li>
                            <li>인증 메일의 "이메일 확인" 버튼을 클릭하세요</li>
                            <li>인증이 완료되면 로그인할 수 있습니다</li>
                        </ol>
                    </div>

                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <p className="text-xs text-amber-800">
                            <strong>이메일이 보이지 않나요?</strong>
                            <br />
                            스팸 폴더를 확인하거나, 몇 분 후 다시 시도해주세요. 이메일 인증이 완료되어야 로그인할 수 있습니다.
                        </p>
                    </div>

                    <div className="flex flex-col space-y-2 pt-4">
                        <Button asChild className="w-full">
                            <Link href="/login">로그인 페이지로 이동</Link>
                        </Button>
                        <Button variant="outline" asChild className="w-full">
                            <Link href="/signup">다시 회원가입</Link>
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
