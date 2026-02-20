"use client"

import { Suspense } from "react"
import { Loader2 } from "lucide-react"
import DashboardPageClient from "./DashboardPageClient"

export default function DashboardPage() {
    return (
        <Suspense
            fallback={
                <div className="flex justify-center py-10">
                    <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
                </div>
            }
        >
            <DashboardPageClient />
        </Suspense>
    )
}
