import { Suspense } from "react"
import VerifyEmailPageClient from "./VerifyEmailPageClient"

export default function VerifyEmailPage() {
    return (
        <Suspense
            fallback={
                <div className="flex items-center justify-center min-h-screen bg-gray-50">
                    <div className="w-[450px] h-80 rounded-lg bg-gray-100 animate-pulse" />
                </div>
            }
        >
            <VerifyEmailPageClient />
        </Suspense>
    )
}
