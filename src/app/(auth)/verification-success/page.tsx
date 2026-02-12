"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle2 } from "lucide-react"
import Link from "next/link"

export default function VerificationSuccessPage() {
    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50">
            <Card className="w-[450px]">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                        <CheckCircle2 className="h-8 w-8 text-green-600" />
                    </div>
                    <CardTitle className="text-2xl">이메일 인증 완료!</CardTitle>
                    <CardDescription className="pt-2">
                        회원가입이 완료되었습니다. 이제 로그인하여 서비스를 이용하실 수 있습니다.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                        <p className="text-sm text-green-800 text-center">
                            이메일 인증이 성공적으로 완료되었습니다.
                            <br />
                            계정 정보가 데이터베이스에 저장되었습니다.
                        </p>
                    </div>

                    <div className="flex flex-col space-y-2 pt-4">
                        <Button asChild className="w-full">
                            <Link href="/login">로그인하기</Link>
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
