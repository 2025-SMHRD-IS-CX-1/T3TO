import { Suspense } from "react"
import { Loader2 } from "lucide-react"
import SchedulePageClient from "./SchedulePageClient"

export default function SchedulePage() {
    return (
        <Suspense
            fallback={
                <div className="flex justify-center py-10">
                    <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
                </div>
            }
        >
            <SchedulePageClient />
        </Suspense>
    )
}
