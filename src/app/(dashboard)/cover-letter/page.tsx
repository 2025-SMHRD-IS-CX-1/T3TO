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
                <h1 className="text-2xl font-bold tracking-tight text-gray-900">AI 자기소개서 초안 작성</h1>
                <p className="text-muted-foreground">AI가 분석한 내 강점을 바탕으로 초안을 작성하고 수정해보세요.</p>
                <p className="text-sm text-muted-foreground mt-1">
                    적합도는 자기소개서 유형 유사도·적성·직무역량 반영도·추천 직무 적합도 3가지 기준(각 100점)의 평균을 백분율로 표시한 값입니다.
                </p>
            </div>

            <CoverLetterEditor
                initialDrafts={drafts}
                clientId={searchParams.clientId}
                counselorId={searchParams.counselorId}
                initialSelectedDraftId={searchParams.draftId || undefined}
            />
        </div>
    )
}
