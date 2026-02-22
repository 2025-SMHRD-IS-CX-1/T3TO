import { Suspense } from "react"
import { Loader2 } from "lucide-react"
import RoadmapPageClient from "./RoadmapPageClient"

export default function RoadmapPage() {
    return (
        <Suspense
            fallback={
                <div className="flex justify-center py-10">
                    <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
                </div>
            }
        >
            <RoadmapPageClient />
        </Suspense>
    )
}
