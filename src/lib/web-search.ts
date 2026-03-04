/**
 * 웹 검색 API (Tavily) - 실제 데이터 기반 로드맵 생성을 위해
 * 목표 기업/직무의 실제 채용 공고, 인재상, 기술 스택 정보 검색
 */

const TAVILY_API_KEY = process.env.TAVILY_API_KEY || ''

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
    certifications?: string
    sources: SearchResult[]
}

/**
 * Tavily API로 웹 검색
 */
async function searchWeb(query: string, maxResults = 5): Promise<SearchResult[]> {
    if (!TAVILY_API_KEY) {
        console.warn('[Tavily API] TAVILY_API_KEY가 없어 웹 검색을 건너뜁니다')
        return []
    }

    try {
        const res = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                api_key: TAVILY_API_KEY,
                query,
                search_depth: 'basic',
                include_answer: true,
                include_raw_content: false,
                max_results: maxResults,
            }),
        })

        if (!res.ok) {
            const errorText = await res.text().catch(() => '')
            console.error(`[Tavily API] 응답 실패 - 상태: ${res.status}, 내용: ${errorText.slice(0, 200)}`)
            return []
        }

        const data = await res.json()
        const results: SearchResult[] = (data.results || []).map((r: any) => ({
            title: r.title || '',
            url: r.url || '',
            content: r.content || '',
            score: r.score,
        }))

        // answer가 있으면 첫 번째 결과로 추가
        if (data.answer) {
            results.unshift({
                title: '검색 요약',
                url: '',
                content: data.answer,
            })
        }

        return results
    } catch (e) {
        console.error('[Tavily API] 웹 검색 에러:', e)
        if (e instanceof Error) {
            console.error('[Tavily API] 에러 메시지:', e.message)
        }
        return []
    }
}

/**
 * 목표 기업 정보 검색 (채용 공고, 인재상, 기술 스택)
 */
export async function searchCompanyInfo(companyNames: string[]): Promise<CompanyInfo[]> {
    if (!companyNames.length) {
        console.warn('[Tavily API] 기업명이 없어 검색을 건너뜁니다')
        return []
    }
    if (!TAVILY_API_KEY) {
        console.warn('[Tavily API] TAVILY_API_KEY가 없어 기업 정보 검색을 건너뜁니다')
        return []
    }

    const results: CompanyInfo[] = []

    for (const company of companyNames) {
        const queries = [
            `${company} 채용 공고 인재상`,
            `${company} 기술 스택 개발 환경`,
            `${company} 기업 문화 인재상`,
        ]

        const allResults: SearchResult[] = []
        for (const query of queries) {
            const searchResults = await searchWeb(query, 3)
            allResults.push(...searchResults)
        }

        // 결과를 카테고리별로 분류 (간단한 키워드 매칭)
        const recruitmentInfo = allResults
            .filter((r) => r.content.includes('채용') || r.content.includes('공고') || r.content.includes('인재상'))
            .map((r) => r.content)
            .join('\n\n')
            .slice(0, 1000)

        const techStack = allResults
            .filter((r) => r.content.includes('기술') || r.content.includes('스택') || r.content.includes('개발'))
            .map((r) => r.content)
            .join('\n\n')
            .slice(0, 1000)

        const talentProfile = allResults
            .filter((r) => r.content.includes('인재상') || r.content.includes('문화'))
            .map((r) => r.content)
            .join('\n\n')
            .slice(0, 1000)

        results.push({
            companyName: company,
            recruitmentInfo: recruitmentInfo || undefined,
            talentProfile: talentProfile || undefined,
            techStack: techStack || undefined,
            sources: allResults.slice(0, 5),
        })
    }

    return results
}

/**
 * 목표 직무 정보 검색 (요구사항, 트렌드, 역량)
 */
export async function searchJobInfo(jobTitle: string): Promise<JobInfo | null> {
    if (!jobTitle) {
        console.warn('[Tavily API] 직무명이 없어 검색을 건너뜁니다')
        return null
    }
    if (!TAVILY_API_KEY) {
        console.warn('[Tavily API] TAVILY_API_KEY가 없어 직무 정보 검색을 건너뜁니다')
        return null
    }

    const queries = [
        `${jobTitle} 채용 요구사항 역량`,
        `${jobTitle} 최신 트렌드 2025 2026`,
        `${jobTitle} 필수 스킬 기술`,
        `${jobTitle} 필수 자격증 요구사항`,
    ]

    const allResults: SearchResult[] = []
    for (const query of queries) {
        const searchResults = await searchWeb(query, 3)
        allResults.push(...searchResults)
    }

    const requirements = allResults
        .filter((r) => r.content.includes('요구') || r.content.includes('역량') || r.content.includes('자격'))
        .map((r) => r.content)
        .join('\n\n')
        .slice(0, 1000)

    const trends = allResults
        .filter((r) => r.content.includes('트렌드') || r.content.includes('최신') || r.content.includes('2025') || r.content.includes('2026'))
        .map((r) => r.content)
        .join('\n\n')
        .slice(0, 1000)

    const skills = allResults
        .filter((r) => r.content.includes('스킬') || r.content.includes('기술') || r.content.includes('도구'))
        .map((r) => r.content)
        .join('\n\n')
        .slice(0, 1000)

    const certifications = allResults
        .filter((r) => r.content.includes('자격증') || r.content.includes('자격') || r.content.includes('인증'))
        .map((r) => r.content)
        .join('\n\n')
        .slice(0, 800)

    const result = {
        jobTitle,
        requirements: requirements || undefined,
        trends: trends || undefined,
        skills: skills || undefined,
        certifications: certifications || undefined,
        sources: allResults.slice(0, 5),
    }
    return result
}

/** 자격증 검색 결과 (Q-Net API 대체용 Tavily 검색) */
export interface CertificationSearchResult {
    summary: string
    results: SearchResult[]
}

/**
 * 목표 직무·전공 기준 자격증 정보 Tavily 검색 (Q-Net API 대체)
 * 로드맵 자격증 추천 시 RAG 컨텍스트로 사용
 */
export async function searchCertificationInfo(
    targetJob: string,
    major?: string
): Promise<CertificationSearchResult> {
    if (!TAVILY_API_KEY) {
        console.warn('[Tavily API] TAVILY_API_KEY가 없어 자격증 검색을 건너뜁니다')
        return { summary: '', results: [] }
    }

    const queries: string[] = []
    if (targetJob && targetJob !== '희망 직무' && targetJob !== '없음' && targetJob !== '미정') {
        // 1) 목표 직종 필수·우대 자격증
        queries.push(`${targetJob} 필수 자격증 Q-Net 국가기술자격`)
        queries.push(`${targetJob} 관련 자격증 취업 우대`)
        // 2) 갯수 채우기용: 취업에 도움되는 연관 자격증
        queries.push(`${targetJob} 연관 자격증 따두면 취업 도움`)
        queries.push(`${targetJob} 관련 최신 자격증 및 민간 자격증`)
    }
    if (major && major !== '정보 없음' && major !== '전공 분야') {
        queries.push(`${major} 전공 관련 자격증 한국산업인력공단`)
        queries.push(`${major} 전공 관련 최신 자격증 및 민간 자격증`)
    }
    const combined = `${targetJob} ${major || ''}`
    if (/전기|전자/i.test(combined)) {
        // 전기·전자: 연관 자격증(소방설비기사, 전기공사기사 등) 검색 포함
        queries.push('전기기사 전기공사기사 신재생에너지 발전설비기사 소방설비기사 전기 관련 자격증 Q-Net')
    }
    if (/AI|인공지능|데이터|머신러닝|ML/i.test(combined)) {
        // AI/데이터 직무의 경우 AICE 등 최신 AI 자격증도 함께 탐색
        queries.push('AI 활용 관련 자격증 AICE ADP ADsP 등 비교')
        queries.push(`${targetJob || 'AI 직무'} 관련 AI 자격증 정리`)
    }
    if (queries.length === 0) {
        queries.push('한국 국가기술자격증 정보처리기사 빅데이터분석기사 추천')
    }
    queries.push('한국산업인력공단 Q-Net 시험일정 2025')

    const allResults: SearchResult[] = []
    for (const query of queries.slice(0, 4)) {
        const searchResults = await searchWeb(query, 3)
        allResults.push(...searchResults)
    }

    const summaryParts = allResults
        .filter((r) => r.content && r.content.length > 50)
        .map((r) => r.content)
        .slice(0, 8)
    const summary = summaryParts.join('\n\n').slice(0, 3000)

    return { summary, results: allResults.slice(0, 15) }
}

/**
 * 실제 합격자 자기소개서 예시 검색 (자기소개서 초안 생성 시 RAG 예시 참고용)
 * 직무가 있으면 해당 직무 합격 사례 위주로 검색
 */
export async function searchSelfIntroExamples(targetJob?: string): Promise<CertificationSearchResult> {
    if (!TAVILY_API_KEY) {
        return { summary: '', results: [] }
    }
    const jobSuffix = targetJob && targetJob !== '희망 직무' && targetJob !== '없음' && targetJob !== '미정'
        ? ` ${targetJob}` : ''
    const queries = [
        `실제 합격자 자기소개서 예시${jobSuffix}`,
        `합격 자기소개서 사례 STAR${jobSuffix}`,
        `취업 합격 자기소개서 문단 예시`,
    ]
    const allResults: SearchResult[] = []
    for (const query of queries) {
        const searchResults = await searchWeb(query, 4)
        allResults.push(...searchResults)
    }
    const summaryParts = allResults
        .filter((r) => r.content && r.content.length > 30)
        .map((r) => r.content)
        .slice(0, 10)
    const summary = summaryParts.join('\n\n').slice(0, 2500)
    return { summary, results: allResults.slice(0, 12) }
}

