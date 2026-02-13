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
    sources: SearchResult[]
}

/**
 * Tavily API로 웹 검색
 */
async function searchWeb(query: string, maxResults = 5): Promise<SearchResult[]> {
    if (!TAVILY_API_KEY) {
        console.warn('TAVILY_API_KEY not set, skipping web search')
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
            console.error(`Tavily API error: ${res.status}`)
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
        console.error('Web search error:', e)
        return []
    }
}

/**
 * 목표 기업 정보 검색 (채용 공고, 인재상, 기술 스택)
 */
export async function searchCompanyInfo(companyNames: string[]): Promise<CompanyInfo[]> {
    if (!companyNames.length || !TAVILY_API_KEY) return []

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
    if (!jobTitle || !TAVILY_API_KEY) return null

    const queries = [
        `${jobTitle} 채용 요구사항 역량`,
        `${jobTitle} 최신 트렌드 2025 2026`,
        `${jobTitle} 필수 스킬 기술`,
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

    return {
        jobTitle,
        requirements: requirements || undefined,
        trends: trends || undefined,
        skills: skills || undefined,
        sources: allResults.slice(0, 5),
    }
}
