/** 로드맵 단계 타입 — roadmap page / roadmap-gantt에서 사용 */
export interface RoadmapStep {
    id: string
    title: string
    description: string
    status: "completed" | "in-progress" | "locked"
    date?: string
    resources?: { title: string; url: string; type: "video" | "article" | "quiz"; content?: string }[]
    quizScore?: number
    /** 사용자 맞춤 구체적 실행 방안 */
    actionItems?: string[]
}
