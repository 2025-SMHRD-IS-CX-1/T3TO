/**
 * RAG plan → 마일스톤/스킬/자격 변환. 목표 구체화 안내 문자열 포함.
 * 독립 모듈용 — lib 내부 타입·필터만 사용.
 */
import type { RagRoadmapResult, CompanyInfo } from './roadmap-types'
import { filterRelevantQualifications } from './roadmap-qnet'
import { extractKeywordsFromAnalysis, computeCompetenciesFromProfile } from './roadmap-competencies'
import { GOAL_CONCRETIZATION_CONTENT } from './roadmap-prompts'

export type RagPlanToMilestonesResult = {
    info: Array<{ id: string; title: string; description: string; status: string; date: string; quizScore: number; resources: { title: string; url: string; type: 'video' | 'article' | 'quiz'; content?: string }[]; actionItems: string[] }>
    dynamicSkills: Array<{ title: string; desc: string; level: number }>
    dynamicCerts: Array<{ type: string; name: string; status: string; color: string; details?: { written?: string; practical?: string; difficulty?: string; examSchedule?: string; description?: string } }>
    targetJob: string
    targetCompany: string
}

/** RAG plan + Q-Net API 데이터를 기존 마일스톤/스킬/자격 형식으로 변환 */
export function ragPlanToMilestones(
    rag: RagRoadmapResult,
    clientData: { recommended_careers?: string; target_company?: string; education_level?: string; major?: string },
    qualifications: unknown[] = [],
    examSchedule: unknown[] = [],
    companyInfos?: CompanyInfo[],
    analysisList: Array<{ strengths?: string; interest_keywords?: string; career_values?: string }> = [],
    precomputedCerts?: Array<{ type: string; name: string; status: string; color: string; details?: Record<string, string> }>
): RagPlanToMilestonesResult {
    const targetJob = (clientData?.recommended_careers && clientData.recommended_careers !== '없음' && clientData.recommended_careers !== '미정')
        ? clientData.recommended_careers
        : '희망 직무'
    const targetCompany = (clientData?.target_company && clientData.target_company !== '없음' && clientData.target_company !== '미정')
        ? clientData.target_company
        : ''

    const plan = rag?.plan || []
    const summary = rag?.summary || ''

    // 프로필 기반 동적 역량 계산
    const dynamicSkills = computeCompetenciesFromProfile(
        {
            major: clientData?.major,
            education_level: clientData?.education_level,
            work_experience_years: 0, // RAG 경로에서는 work_experience_years 정보가 없으므로 0으로 설정
        },
        analysisList,
        targetJob,
        targetCompany,
        summary // RAG summary를 jobRequirementsText로 활용
    )

    const major = clientData?.major || ''
    const extractedKw = extractKeywordsFromAnalysis(analysisList)
    // 로드맵 생성 시 종합 추천된 자격증이 있으면 사용, 없으면 키워드 필터링
    const dynamicCerts = precomputedCerts && precomputedCerts.length > 0
        ? precomputedCerts
        : filterRelevantQualifications(qualifications, examSchedule, targetJob, major, extractedKw)

    /** "채용 공고·인재상 분석 기반" 등 맥락 문구 제거 후 실질적 수행 내용만 반환 */
    const stripMetaPhrases = (s: string): string => {
        let t = s
            .replace(/\s*채용\s*공고\s*·?\s*인재상\s*(검색\s*)?분석\s*기반\s*/gi, ' ')
            .replace(/\s*검색\s*기반\s*/gi, ' ')
            .replace(/\s*\(검색\s*결과\)\s*/g, ' ')
            .replace(/\s*[-–]\s*웹\s*검색.*?\./g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
        if (t.startsWith('·')) t = t.slice(1).trim()
        return t || s
    }
    /** 추상적 단계 제목 또는 "목표 기업" 포함 시 구체적 실행 방안(추천활동/역량)으로 보완 */
    const concreteTitle = (step: (typeof plan)[0], i: number): string => {
        let raw = (step.단계 || `Step${i + 1}`).trim()
        raw = stripMetaPhrases(raw)
        const hasTargetCompanyPhrase = /목표 기업/.test(raw)
        const isVague = hasTargetCompanyPhrase || (/맞춤형 역량 강화|최종 합격 및 안착|역량 강화/.test(raw) && raw.length < 50)
        if (!isVague) return raw
        const actions = Array.isArray(step.추천활동) ? step.추천활동 as string[] : []
        const competencies = Array.isArray(step.역량) ? step.역량 as string[] : []
        const concrete = actions.find((a: string) => a.length > 25 && /프로젝트|인턴|자격증|프로그래머스|백준|원티드|STAR|면접/.test(a))
            || competencies.find((c: string) => c.length > 25 && /프로젝트|인턴|자격증|프로그래머스|백준|원티드|STAR|면접/.test(c))
        if (concrete) return stripMetaPhrases(concrete.length > 60 ? concrete.slice(0, 57) + '…' : concrete)
        return raw
    }

    const info = plan.map((step, i) => {
        const isFirst = i === 0
        const rawActions = Array.isArray(step.추천활동) ? step.추천활동 : []
        const actionItems = rawActions.map((a: unknown) => stripMetaPhrases(String(a)))
        const resources: { title: string; url: string; type: 'video' | 'article' | 'quiz'; content?: string }[] = []

        if (companyInfos?.length && (i === 1 || i === 2)) {
            for (const co of companyInfos) {
                if (co.talentProfile) resources.push({ title: `${co.companyName} 인재상`, url: '#', type: 'article', content: co.talentProfile.slice(0, 1500) })
                if (co.recruitmentInfo) resources.push({ title: `${co.companyName} 채용·공고 요약`, url: '#', type: 'article', content: co.recruitmentInfo.slice(0, 1500) })
                if (co.techStack) resources.push({ title: `${co.companyName} 기술 스택·개발 환경`, url: '#', type: 'article', content: co.techStack.slice(0, 1500) })
            }
        }
        if (!targetCompany && (i === 0 || i === 1)) {
            resources.push({ title: '목표 구체화 가이드', url: '#', type: 'article', content: GOAL_CONCRETIZATION_CONTENT })
        }
        if (isFirst && step.자격정보?.length) {
            const firstQual = step.자격정보[0] as Record<string, unknown>
            resources.push({ title: String(firstQual?.qualName ?? '자격 정보'), url: '#', type: 'article' })
        }
        if (step.직업군?.length) resources.push({ title: `직업군: ${step.직업군.slice(0, 2).join(', ')}`, url: '#', type: 'article' })
        if (resources.length === 0) resources.push({ title: '진로 가이드', url: '#', type: 'article' })

        let stepDescription = ''
        if (summary && isFirst) {
            stepDescription = summary
        } else if (i === 1) {
            if (step.역량?.length && step.역량.some((v: string) => v.length > 30)) {
                stepDescription = step.역량.join('. ')
            } else if (actionItems.length > 0) {
                const relevantActions = actionItems.filter((item: string) => /프로젝트|인턴|경험|자격증|포트폴리오|오픈소스|협업/i.test(item))
                stepDescription = (relevantActions.length > 0 ? relevantActions : actionItems).slice(0, 2).join('. ')
            } else if (step.역량?.length) {
                stepDescription = step.역량.join('. ')
            } else {
                stepDescription = targetCompany ? '목표 기업 맞춤형 역량 강화를 위한 구체적인 방안을 수립합니다.' : '목표 직무(직무목표)에 맞춘 역량 강화를 위한 구체적인 방안을 수립합니다.'
            }
        } else if (i === 2) {
            if (step.역량?.length && step.역량.some((v: string) => /프로그래머스|백준|원티드|면접|STAR|사이트/i.test(v))) {
                stepDescription = step.역량.join('. ')
            } else if (actionItems.length > 0) {
                const relevantActions = actionItems.filter((item: string) => /면접|이력서|자기소개서|STAR|프로그래머스|백준|원티드|로켓펀치|온보딩/i.test(item))
                stepDescription = (relevantActions.length > 0 ? relevantActions : actionItems).slice(0, 2).join('. ')
            } else if (step.역량?.length) {
                stepDescription = step.역량.join('. ')
            } else {
                stepDescription = targetCompany ? '최종 합격을 위한 전략 수립 및 면접 준비를 진행합니다.' : '목표 직무 달성을 위한 최종 합격 및 면접 전략 수립을 진행합니다.'
            }
        } else if (step.역량?.length) {
            stepDescription = step.역량.join('. ')
        } else {
            stepDescription = '단계별 목표를 진행합니다.'
        }

        return {
            id: `step-${i + 1}`,
            title: concreteTitle(step, i),
            description: stepDescription,
            status: i === 0 ? 'in-progress' : 'locked',
            date: i === 0 ? new Date().toLocaleDateString('ko-KR') : '',
            quizScore: 0,
            resources,
            actionItems,
        }
    })

    if (info.length === 0) {
        info.push({
            id: 'step-1',
            title: '1단계: 목표 설정',
            description: '상담 및 프로필을 바탕으로 목표를 구체화합니다.',
            status: 'in-progress',
            date: new Date().toLocaleDateString('ko-KR'),
            quizScore: 0,
            resources: [{ title: '진로 가이드', url: '#', type: 'article' }],
            actionItems: ['목표 직무·기업 조사', '역량 갭 분석'],
        })
    }

    return { info, dynamicSkills, dynamicCerts, targetJob, targetCompany }
}
