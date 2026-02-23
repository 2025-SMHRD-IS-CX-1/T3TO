import { Suspense } from "react"
import LoginPageClient from "./LoginPageClient"

function LoginFallback() {
    return (
        <div className="flex min-h-screen items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
    )
}

export default function LoginPage() {
    return (
        <Suspense fallback={<LoginFallback />}>
            <LoginPageClient />
        </Suspense>
    )
}
