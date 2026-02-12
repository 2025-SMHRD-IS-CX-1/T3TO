"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { signup } from "../actions"
import { useState } from "react"

export default function SignupPage() {
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    async function handleSubmit(formData: FormData) {
        setLoading(true)
        setError(null)

        const result = await signup(formData)

        if (result?.error) {
            setError(result.error)
            setLoading(false)
        }
        // Redirect handled by server action
    }

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50">
            <Card className="w-[350px]">
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
                        {error && <p className="text-sm text-red-500">{error}</p>}

                        <div className="flex flex-col space-y-2 mt-4">
                            <Button className="w-full" disabled={loading}>
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
