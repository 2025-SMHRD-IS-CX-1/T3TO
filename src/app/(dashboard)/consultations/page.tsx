import { Suspense } from "react"
import { Loader2 } from "lucide-react"
import ConsultationsPageClient from "./ConsultationsPageClient"

export default function ConsultationsPage() {
    return (
        <Suspense
            fallback={
                <div className="flex justify-center py-10">
                    <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
                </div>
            }
        >
            <ConsultationsPageClient />
        </Suspense>
    )
}
