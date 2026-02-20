import { Suspense } from "react"
import LoginPageClient from "./LoginPageClient"

export default function LoginPage() {
    return (
        <Suspense
            fallback={
                <div className="flex items-center justify-center min-h-screen bg-slate-50 p-4">
                    <div className="w-full max-w-[400px] h-[420px] rounded-lg bg-slate-100 animate-pulse" />
                </div>
            }
        >
            <LoginPageClient />
        </Suspense>
    )
}
