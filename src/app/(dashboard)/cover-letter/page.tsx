import { CoverLetterEditor } from "@/components/cover-letter/editor"
import { getDrafts } from "./actions"

export default async function CoverLetterPage(props: {
    searchParams: Promise<{ clientId?: string; counselorId?: string; draftId?: string }>
}) {
    const searchParams = await props.searchParams
    const drafts = await getDrafts(searchParams.clientId, searchParams.counselorId)

    return (
        <div className="h-full flex flex-col space-y-4">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-gray-900">자기소개서 작성</h1>
                <p className="text-muted-foreground">AI가 분석한 내 강점을 바탕으로 초안을 작성하고 수정해보세요.</p>
            </div>

            <CoverLetterEditor
                initialDrafts={drafts}
                clientId={searchParams.clientId}
                initialSelectedDraftId={searchParams.draftId || undefined}
            />
        </div>
    )
}
