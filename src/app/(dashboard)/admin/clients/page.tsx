import { Suspense } from "react"
import { Loader2 } from "lucide-react"
import ClientsPageClient from "./ClientsPageClient"

export const dynamic = "force-dynamic"

export default function ClientsPage() {
    return (
        <Suspense
            fallback={
                <div className="flex justify-center py-10">
                    <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
                </div>
            }
        >
            <ClientsPageClient />
        </Suspense>
    )
}
