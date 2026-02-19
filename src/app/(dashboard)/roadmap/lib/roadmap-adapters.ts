import type { CompanyInfo, JobInfo } from './roadmap-types'

/**
 * 로드맵을 **하나의 독립 모듈**로 쓰기 위한 어댑터.
 * Next/Supabase에 묶이지 않고, 이 인터페이스만 구현하면 동일 로드맵 기능을 유지한 채 이식 가능.
 */
export interface RoadmapAdapters {
    /** OpenAI API 키 (필수) */
    openaiApiKey: string
    /** 모델명 (기본: gpt-4o-mini) */
    model?: string
    /** 목표 기업명 목록 → 기업 정보 검색 (선택, 없으면 RAG는 프로필/상담만 사용) */
    searchCompany?: (companyNames: string[]) => Promise<CompanyInfo[]>
    /** 목표 직무명 → 직무 요구사항/스킬 검색 (선택) */
    searchJob?: (jobTitle: string) => Promise<JobInfo | null>
    /** Q-Net 자격증 목록 (선택, 없으면 빈 배열) */
    getQualifications?: () => Promise<unknown[]>
    /** Q-Net 시험 일정 (선택) */
    getExamSchedule?: () => Promise<unknown[]>

}

/** RAG 컨텍스트 — DB/API에서 가져올 내담자 데이터. 어댑터에서 이 형태로 넘기면 됨 */
export interface RoadmapRagContext {
    counseling: unknown[]
    analysis: unknown[]
    profile: unknown[]
    roadmap: unknown[]
}

/** 독립 모듈 진입점 runRoadmap( userData, adapters ) 반환 타입 (기능 유지) */
export interface RunRoadmapResult {
    info: Array<{
        id: string
        title: string
        description: string
        status: string
        date: string
        quizScore: number
        resources: Array<{ title: string; url: string; type: 'video' | 'article' | 'quiz'; content?: string }>
        actionItems: string[]
    }>
    dynamicSkills: Array<{ title: string; desc: string; level: number }>
    dynamicCerts: Array<{
        type: string
        name: string
        status: string
        color: string
        details?: { written?: string; practical?: string; difficulty?: string; examSchedule?: string; description?: string }
    }>
    targetJob: string
    targetCompany: string
}
