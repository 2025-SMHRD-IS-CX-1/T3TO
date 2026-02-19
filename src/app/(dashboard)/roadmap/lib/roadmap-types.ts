/** 마이그레이션 시 외부에서 주입 가능하도록 앱 의존성 없이 정의 */
export interface SearchResult {
    title: string
    url: string
    content: string
    score?: number
}

export interface CompanyInfo {
    companyName: string
    recruitmentInfo?: string
    talentProfile?: string
    techStack?: string
    culture?: string
    sources: SearchResult[]
}

export interface JobInfo {
    jobTitle: string
    requirements?: string
    trends?: string
    skills?: string
    sources: SearchResult[]
}

/** LLM 로드맵 plan 단계 구조 */
export type RagPlanStep = {
    단계?: string
    추천활동?: string[]
    직업군?: string[]
    역량?: string[]
    자격정보?: unknown[]
    시험일정?: unknown[]
    교육과정?: string[]
    '산업분야/대표기업'?: string[]
    직무역량?: unknown[]
}

/** RAG 로드맵 LLM 결과 (요약, plan, 기업정보, 직무 요구역량 텍스트) */
export type RagRoadmapResult = {
    summary?: string
    citations_used?: string[]
    plan?: RagPlanStep[]
    companyInfos?: CompanyInfo[]
    /** 웹 검색으로 확보한 직무 요구역량·스킬 (실제 역량 표기용) */
    jobRequirementsText?: string
}
