/**
 * 규칙 기반 로드맵 생성. 검색(웹) + RAG(프로필·상담·분석) 결과로 제목·설명·액션을 구체화. 하드코딩·목표 기업 변수 치환 최소화.
 */
import type { RoadmapAdapters, RoadmapRagContext, RunRoadmapResult } from './roadmap-adapters'
import type { CompanyInfo, JobInfo } from './roadmap-types'
import { computeCompetenciesFromProfile, extractKeywordsFromAnalysis } from './roadmap-competencies'
import { filterRelevantQualifications } from './roadmap-qnet'
import { GOAL_CONCRETIZATION_CONTENT } from './roadmap-milestones'

/** 검색 결과(CompanyInfo[])에서 제목·액션용 요약 추출 (실제 검색/RAG 기반 구체화용) */
function summarizeFromSearch(companyInfos: CompanyInfo[], jobInfo: JobInfo | null): {
    techStackSummary: string
    talentProfileSummary: string
    recruitmentSummary: string
    jobSkillsSummary: string
} {
    const techParts = companyInfos.map((c) => c.techStack).filter(Boolean) as string[]
    const talentParts = companyInfos.map((c) => c.talentProfile).filter(Boolean) as string[]
    const recruitParts = companyInfos.map((c) => c.recruitmentInfo).filter(Boolean) as string[]
    const techStackSummary = techParts.length
        ? techParts.join(' ').replace(/\s+/g, ' ').slice(0, 120).trim() + (techParts.join('').length > 120 ? '…' : '')
        : ''
    const talentProfileSummary = talentParts.length
        ? talentParts.join(' ').replace(/\s+/g, ' ').slice(0, 100).trim() + (talentParts.join('').length > 100 ? '…' : '')
        : ''
    const recruitmentSummary = recruitParts.length
        ? recruitParts.join(' ').replace(/\s+/g, ' ').slice(0, 100).trim() + (recruitParts.join('').length > 100 ? '…' : '')
        : ''
    const jobSkillsSummary = jobInfo?.skills || jobInfo?.requirements || ''
    return { techStackSummary, talentProfileSummary, recruitmentSummary, jobSkillsSummary }
}

/** RAG(프로필·상담 분석)에서 1단계용 키워드 추출 */
function summarizeFromRag(ruleAnalysisList: Array<{ strengths?: string; interest_keywords?: string; career_values?: string }>): { strengths: string; interests: string } {
    const strengths = ruleAnalysisList.map((a) => a.strengths).filter(Boolean).join(' ').slice(0, 80) || ''
    const interests = ruleAnalysisList.map((a) => a.interest_keywords || a.career_values).filter(Boolean).join(' ').slice(0, 80) || ''
    return { strengths, interests }
}

export async function buildRuleBasedRoadmap(
    clientData: {
        recommended_careers?: string
        target_company?: string
        education_level?: string
        major?: string
        work_experience?: string
        work_experience_years?: number
    },
    userData: RoadmapRagContext,
    adapters: RoadmapAdapters
): Promise<RunRoadmapResult> {
    const ruleProfile = (userData.profile?.[0] || clientData) as { major?: string; education_level?: string; work_experience_years?: number }
    const ruleAnalysisList = (userData.analysis || []) as Array<{ strengths?: string; interest_keywords?: string; career_values?: string }>
    const ragSummary = summarizeFromRag(ruleAnalysisList)

    const rawTargetJob = clientData?.recommended_careers ?? ''
    const rawTargetCompany = clientData?.target_company ?? ''
    const targetJob = rawTargetJob && rawTargetJob !== '없음' && rawTargetJob !== '미정' ? rawTargetJob : '희망 직무'
    const targetCompany = rawTargetCompany && rawTargetCompany !== '없음' && rawTargetCompany !== '미정' ? rawTargetCompany : ''

    // 1) 검색·RAG 선행: 기업 검색 + 직무 검색 + Q-Net 병렬 수행
    const companies = targetCompany ? targetCompany.split(/[,，、]/).map((c) => c.trim()).filter(Boolean) : []
    const [companyInfosRule, jobInfoResult, qualResult] = await Promise.all([
        companies.length && adapters.searchCompany
            ? Promise.race([
                adapters.searchCompany(companies),
                new Promise<CompanyInfo[]>((r) => setTimeout(() => r([]), 8000)),
            ])
            : Promise.resolve([] as CompanyInfo[]),
        adapters.searchJob ? adapters.searchJob(targetJob).catch(() => null) : Promise.resolve(null as JobInfo | null),
        Promise.race([
            Promise.all([
                adapters.getQualifications?.() ?? Promise.resolve([]),
                adapters.getExamSchedule?.() ?? Promise.resolve([]),
            ]),
            new Promise<[unknown[], unknown[]]>((resolve) => setTimeout(() => resolve([[], []]), 5000)),
        ]),
    ])
    const [qualifications, examSchedule] = qualResult
    const searchSummary = summarizeFromSearch(companyInfosRule, jobInfoResult ?? null)

    const educationLevel = clientData?.education_level || ruleProfile?.education_level || '정보 없음'
    const major = clientData?.major || ruleProfile?.major || '전공 분야'
    const experience = clientData?.work_experience ?? ''

    const isDevCareer = /개발|엔지니어|소프트웨어|프로그래머/i.test(targetJob)
    const hasSearchData = companyInfosRule.length > 0 || searchSummary.techStackSummary || searchSummary.talentProfileSummary || searchSummary.recruitmentSummary || searchSummary.jobSkillsSummary

    // 2) 1단계: RAG(프로필·상담 분석) 기반 제목·설명·액션
    let phase1Title = ''
    if (educationLevel === '고등학교 졸업' || educationLevel === '전문대 졸업' || educationLevel === '대학교 재학') {
        phase1Title = `1단계: ${targetJob} 기초 역량 확보 및 자격증 준비`
    } else if (experience && String(experience).length > 20) {
        phase1Title = `1단계: 경력 활용 ${targetJob} 전문성 강화`
    } else {
        phase1Title = `1단계: ${targetJob} 실무 역량 기반 구축`
    }
    const phase1Desc = `목표 직무(${targetJob}) 달성을 위한 기초 역량을 다집니다.`

    const phase1Actions = [
        `전공 지식 증명을 위해 **정보처리기사** 필기 일정 수립 및 3개월 내 1차 취득 목표`,
        `${major} 실무 연계: ${targetJob} 관련 소규모 프로젝트 1개 이상 기획·구현 (Git 저장소 관리)`,
        `협업 도구 숙달: Git 브랜치 전략, Jira 이슈/스프린트 작성 연습`,
        `데이터 기반 문제 해결: 실무 데이터 분석 사례 1건 정리 (의사결정 근거 문서화)`,
    ]
    if (educationLevel === '고등학교 졸업' || educationLevel === '전문대 졸업' || educationLevel === '대학교 재학') {
        phase1Actions[0] = `정보처리기사 또는 관련 기초 자격증 준비 (필기 합격 목표)`
        phase1Actions[1] = `${major} 기초 이론 정리 및 ${targetJob} 진로와 연결한 학습 로드맵 작성`
    }
    if (ragSummary.interests) {
        phase1Actions.push(`관심 분야를 직무와 연결한 학습 계획 반영`)
    }

    // 3) 2단계: 검색(인재상·채용·기술스택) + RAG 기반 제목·설명·액션 (기업명 하드코딩 없음)
    let phase2Title = ''
    let phase2Desc = ''
    let phase2Actions: string[] = []
    if (hasSearchData && (searchSummary.techStackSummary || searchSummary.recruitmentSummary || searchSummary.talentProfileSummary)) {
        const techLabel = searchSummary.techStackSummary
            ? searchSummary.techStackSummary.slice(0, 60) + (searchSummary.techStackSummary.length > 60 ? '…' : '')
            : ''
        phase2Title = isDevCareer
            ? (techLabel ? `2단계: ${techLabel} 포트폴리오 1~2개 완성 및 인턴십·오픈소스 기여 준비` : `2단계: 포트폴리오 1~2개 완성 및 인턴십·오픈소스 기여 준비`)
            : `2단계: 포트폴리오·자격증·실습으로 역량 보완 및 지원 준비`
        phase2Desc = `포트폴리오 완성·오픈소스 기여·자격증 등 구체적 역량 개발을 실행합니다.`
        phase2Actions = [
            `요구 기술 스택을 분석하고, 해당 기술을 활용한 포트폴리오 프로젝트 1~2개 기획`,
            `추구 인재상에 맞춰 내 강점과 연결한 차별화 포인트를 정리해 프로젝트에 반영`,
            `아키텍처·실무 스택 학습 후 프로젝트에 적용`,
            isDevCareer ? `AWS 또는 GCP 실습 환경 구축 및 관련 자격증 준비` : `직무 관련 자격증(ADsP 등) 준비 및 데이터·분석 도구 실습`,
            `원티드·로켓펀치에서 채용 사이클·지원 절차 확인 및 네트워킹·설명회 일정 파악`,
        ]
    } else {
        phase2Title = `2단계: ${targetJob} 포트폴리오 1~2개 완성 및 관련 자격증·인턴 지원 준비`
        phase2Desc = `${targetJob} 역량 강화: 포트폴리오·인턴·자격증 등으로 실무 역량을 개발합니다.`
        phase2Actions = [
            `${targetJob} 직무 기술서 및 실제 채용 공고를 분석하여 역량 갭 분석 및 보완 학습 계획 수립`,
            `포트폴리오용 실무 결과물 1~2개 완성 (Git, 문서화, 배포 URL 포함)`,
            isDevCareer ? `AWS 또는 직무 핵심 도구 활용 프로젝트 1건 추가 및 클라우드 배포 경험 축적` : `데이터 분석/리포트 실무 사례 1건 정리 및 시각화 도구 활용`,
            `희망 기업 리스트업 및 각 기업별 채용 사이클·지원 전략 상세 정리`,
        ]
    }

    // 4) 3단계: 검색(채용 프로세스·면접) + RAG 기반 (기업명 하드코딩 없음)
    const phase3Title = isDevCareer
        ? '3단계: 프로그래머스·백준 코딩테스트 주 3회 + 원티드 면접 후기로 STAR 기법 연습'
        : '3단계: 원티드·잡코리아 면접 후기 수집 및 STAR 기법으로 스토리텔링·이력서 맞춤 수정'
    const phase3Desc = `프로그래머스(programmers.co.kr)·백준(BOJ) 코딩테스트 연습, 원티드(wanted.co.kr) 면접 후기 참고 및 STAR 기법 스토리텔링 연습을 진행합니다.`
    const phase3Actions = hasSearchData
        ? [
            `이력서·자기소개서 초안 작성 (인재상과 내 경험 연결) 후 피드백 2회 이상 반영`,
            `면접 형식(기술/인성) 확인 후 예상 질문 리스트 작성 및 STAR 기법 스토리텔링 연습`,
            `채용 프로세스(서류→코딩테스트→기술면접→인성면접)에 맞춰 단계별 체크리스트·일정 수립`,
            `입사 후 3개월 목표(온보딩·팀 적응·첫 프로젝트) 정리`,
        ]
        : [
            `목표 기업별 이력서·자기소개서 버전 관리 및 인재상에 맞춘 맞춤 수정`,
            `역량 기반 면접 스토리 및 기술 질문 대비 자료 정리 (STAR 기법 활용, 포트폴리오 기반 질문 대비)`,
            `지원 일정·합격/불합격 피드백 기록으로 전략 보완 및 다음 지원에 반영`,
            `입사 후 단기 목표 설정 (온보딩 완료, 첫 프로젝트 참여, 팀 적응 등)`,
        ]

    const step2Resources: RunRoadmapResult['info'][0]['resources'] = []
    const step3Resources: RunRoadmapResult['info'][0]['resources'] = []
    for (const co of companyInfosRule) {
        if (co.talentProfile) {
            step2Resources.unshift({ title: `${co.companyName} 인재상`, url: '#', type: 'article', content: co.talentProfile.slice(0, 1500) })
            step3Resources.push({ title: `${co.companyName} 인재상`, url: '#', type: 'article', content: co.talentProfile.slice(0, 1500) })
        }
        if (co.recruitmentInfo) step2Resources.push({ title: `${co.companyName} 채용·공고 요약`, url: '#', type: 'article', content: co.recruitmentInfo.slice(0, 1500) })
        if (co.techStack) step2Resources.push({ title: `${co.companyName} 기술 스택·개발 환경`, url: '#', type: 'article', content: co.techStack.slice(0, 1500) })
    }
    if (step2Resources.length === 0) step2Resources.push({ title: '직무 기술 가이드', url: '#', type: 'article' })
    const goalResource = { title: '목표 구체화 가이드', url: '#', type: 'article' as const, content: GOAL_CONCRETIZATION_CONTENT }
    if (!targetCompany) {
        step2Resources.push(goalResource)
    }

    const step1Resources: RunRoadmapResult['info'][0]['resources'] = [{ title: '실무 역량 강화 가이드', url: '#', type: 'video' }]
    if (!targetCompany) step1Resources.push(goalResource)

    const info: RunRoadmapResult['info'] = [
        { id: 'step-1', title: phase1Title, description: phase1Desc, status: 'in-progress', date: new Date().toLocaleDateString('ko-KR'), quizScore: 0, resources: step1Resources, actionItems: phase1Actions },
        { id: 'step-2', title: phase2Title, description: phase2Desc, status: 'locked', date: '', quizScore: 0, resources: step2Resources, actionItems: phase2Actions },
        {
            id: 'step-3',
            title: phase3Title,
            description: phase3Desc,
            status: 'locked',
            date: '',
            quizScore: 0,
            resources: step3Resources,
            actionItems: phase3Actions,
        },
    ]

    const dynamicSkills = computeCompetenciesFromProfile(ruleProfile, ruleAnalysisList, targetJob, targetCompany)
    const ruleExtractedKw = extractKeywordsFromAnalysis(ruleAnalysisList)
    let dynamicCerts = filterRelevantQualifications(qualifications, examSchedule, targetJob, major, ruleExtractedKw)

    if (dynamicCerts.length < 3) {
        const isDev = /개발|엔지니어|소프트웨어|프로그래머/i.test(targetJob)
        const isData = /데이터|분석|AI|인공지능/i.test(targetJob)
        if ((isDev || isData) && !dynamicCerts.some((c) => c.name.includes('정보처리'))) {
            dynamicCerts.unshift({
                type: '자격증',
                name: '정보처리기사',
                status: '취득 권장',
                color: 'text-blue-600 bg-blue-50',
                details: { written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)', practical: '실기: 100점 만점에 60점 이상', difficulty: '난이도: 중상', examSchedule: '연 3회 (3월, 7월, 10월)', description: '정보처리 관련 산업기사 자격을 취득한 자 또는 관련학과 졸업자 등이 응시할 수 있는 국가기술자격증입니다.' },
            })
        }
    }

    const isDataRule = /데이터|분석|AI|인공지능/i.test(targetJob)
    const isCivilRule = /토목|건설|측량|건축|구조/i.test(targetJob)
    const isSafetyRule = /안전|산업안전|건설안전/i.test(targetJob)
    const isMechRule = /기계|자동차|메카트로닉스/i.test(targetJob)
    const isElecRule = /전기|전자|전기기사|전자기사/i.test(targetJob)
    if (isDataRule) {
        dynamicCerts.push(
            { type: '자격증', name: 'ADsP (데이터분석 준전문가)', status: '취득 권장', color: 'text-orange-600 bg-orange-50', details: { written: '필기: 60점 이상 (100점 만점)', practical: '실기: 없음', difficulty: '난이도: 중하', examSchedule: '연 4회 (3월, 6월, 9월, 12월)', description: '데이터 분석 기초 지식과 데이터 분석 프로세스에 대한 이해를 인증하는 자격증입니다.' } },
            { type: '자격증', name: 'SQLD (SQL 개발자)', status: '취득 권장', color: 'text-green-600 bg-green-50', details: { written: '필기: 60점 이상 (100점 만점)', practical: '실기: 없음', difficulty: '난이도: 중하', examSchedule: '연 4회 (3월, 6월, 9월, 12월)', description: '데이터베이스와 데이터 모델링에 대한 지식을 바탕으로 SQL을 작성하고 활용할 수 있는 능력을 인증합니다.' } },
            { type: '자격증', name: '빅데이터분석기사', status: '준비 중', color: 'text-purple-600 bg-purple-50', details: { written: '필기: 100점 만점에 60점 이상', practical: '실기: 100점 만점에 60점 이상', difficulty: '난이도: 상', examSchedule: '연 1회 (10월)', description: '빅데이터 분석 및 활용 능력을 종합적으로 평가하는 국가기술자격증입니다.' } }
        )
    } else if (isCivilRule) {
        dynamicCerts.push(
            { type: '자격증', name: '토목기사', status: '취득 권장', color: 'text-blue-600 bg-blue-50', details: { written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)', practical: '실기: 100점 만점에 60점 이상', difficulty: '난이도: 중상', examSchedule: '연 2회 (4월, 10월)', description: '토목공학에 관한 전문지식과 기술을 바탕으로 토목공사 설계, 시공, 감리 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.' } },
            { type: '자격증', name: '건설기사', status: '취득 권장', color: 'text-green-600 bg-green-50', details: { written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)', practical: '실기: 100점 만점에 60점 이상', difficulty: '난이도: 중상', examSchedule: '연 2회 (4월, 10월)', description: '건설공학에 관한 전문지식과 기술을 바탕으로 건설공사 설계, 시공, 감리 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.' } },
            { type: '자격증', name: '측량기사', status: '준비 중', color: 'text-orange-600 bg-orange-50', details: { written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)', practical: '실기: 100점 만점에 60점 이상', difficulty: '난이도: 중', examSchedule: '연 2회 (4월, 10월)', description: '측량에 관한 전문지식과 기술을 바탕으로 지형측량, 지적측량, 공공측량 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.' } },
            { type: '자격증', name: '건설안전기사', status: '준비 중', color: 'text-red-600 bg-red-50', details: { written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)', practical: '실기: 100점 만점에 60점 이상', difficulty: '난이도: 중상', examSchedule: '연 2회 (4월, 10월)', description: '건설현장의 안전관리에 관한 전문지식과 기술을 바탕으로 안전관리 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.' } }
        )
    } else if (isSafetyRule) {
        dynamicCerts.push(
            { type: '자격증', name: '산업안전기사', status: '취득 권장', color: 'text-blue-600 bg-blue-50', details: { written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)', practical: '실기: 100점 만점에 60점 이상', difficulty: '난이도: 중상', examSchedule: '연 2회 (4월, 10월)', description: '산업안전에 관한 전문지식과 기술을 바탕으로 산업현장의 안전관리 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.' } },
            { type: '자격증', name: '건설안전기사', status: '취득 권장', color: 'text-green-600 bg-green-50', details: { written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)', practical: '실기: 100점 만점에 60점 이상', difficulty: '난이도: 중상', examSchedule: '연 2회 (4월, 10월)', description: '건설현장의 안전관리에 관한 전문지식과 기술을 바탕으로 안전관리 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.' } },
            { type: '자격증', name: '소방설비기사', status: '준비 중', color: 'text-red-600 bg-red-50', details: { written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)', practical: '실기: 100점 만점에 60점 이상', difficulty: '난이도: 중상', examSchedule: '연 2회 (4월, 10월)', description: '소방설비에 관한 전문지식과 기술을 바탕으로 소방설비 설치, 유지관리 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.' } },
            { type: '자격증', name: '위험물기능사', status: '준비 중', color: 'text-orange-600 bg-orange-50', details: { written: '필기: 100점 만점에 60점 이상', practical: '실기: 100점 만점에 60점 이상', difficulty: '난이도: 중', examSchedule: '연 2회 (4월, 10월)', description: '위험물의 취급 및 저장에 관한 전문지식과 기술을 인증하는 국가기술자격증입니다.' } }
        )
    } else if (isMechRule) {
        dynamicCerts.push(
            { type: '자격증', name: '기계기사', status: '취득 권장', color: 'text-blue-600 bg-blue-50', details: { written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)', practical: '실기: 100점 만점에 60점 이상', difficulty: '난이도: 중상', examSchedule: '연 2회 (4월, 10월)', description: '기계공학에 관한 전문지식과 기술을 바탕으로 기계설계, 제조, 유지관리 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.' } },
            { type: '자격증', name: '자동차정비기사', status: '취득 권장', color: 'text-green-600 bg-green-50', details: { written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)', practical: '실기: 100점 만점에 60점 이상', difficulty: '난이도: 중', examSchedule: '연 2회 (4월, 10월)', description: '자동차 정비에 관한 전문지식과 기술을 바탕으로 자동차 점검, 수리, 정비 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.' } },
            { type: '자격증', name: '용접기사', status: '준비 중', color: 'text-orange-600 bg-orange-50', details: { written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)', practical: '실기: 100점 만점에 60점 이상', difficulty: '난이도: 중', examSchedule: '연 2회 (4월, 10월)', description: '용접에 관한 전문지식과 기술을 바탕으로 용접 작업을 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.' } },
            { type: '자격증', name: '건설기계기사', status: '준비 중', color: 'text-purple-600 bg-purple-50', details: { written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)', practical: '실기: 100점 만점에 60점 이상', difficulty: '난이도: 중상', examSchedule: '연 2회 (4월, 10월)', description: '건설기계에 관한 전문지식과 기술을 바탕으로 건설기계의 설계, 제조, 유지관리 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.' } }
        )
    } else if (isElecRule) {
        dynamicCerts.push(
            { type: '자격증', name: '전기기사', status: '취득 권장', color: 'text-blue-600 bg-blue-50', details: { written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)', practical: '실기: 100점 만점에 60점 이상', difficulty: '난이도: 중상', examSchedule: '연 2회 (4월, 10월)', description: '전기에 관한 전문지식과 기술을 바탕으로 전기설비 설계, 시공, 유지관리 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.' } },
            { type: '자격증', name: '전자기사', status: '취득 권장', color: 'text-green-600 bg-green-50', details: { written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)', practical: '실기: 100점 만점에 60점 이상', difficulty: '난이도: 중상', examSchedule: '연 2회 (4월, 10월)', description: '전자공학에 관한 전문지식과 기술을 바탕으로 전자설비 설계, 제조, 유지관리 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.' } },
            { type: '자격증', name: '전기공사기사', status: '준비 중', color: 'text-orange-600 bg-orange-50', details: { written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)', practical: '실기: 100점 만점에 60점 이상', difficulty: '난이도: 중', examSchedule: '연 2회 (4월, 10월)', description: '전기공사에 관한 전문지식과 기술을 바탕으로 전기공사 설계, 시공, 감리 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.' } },
            { type: '자격증', name: '산업계측기사', status: '준비 중', color: 'text-purple-600 bg-purple-50', details: { written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)', practical: '실기: 100점 만점에 60점 이상', difficulty: '난이도: 중', examSchedule: '연 2회 (4월, 10월)', description: '산업계측에 관한 전문지식과 기술을 바탕으로 계측기기 설계, 설치, 유지관리 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.' } }
        )
    } else {
        dynamicCerts.push(
            { type: '자격증', name: '정보처리기사', status: '취득 권장', color: 'text-blue-600 bg-blue-50', details: { written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)', practical: '실기: 100점 만점에 60점 이상', difficulty: '난이도: 중상', examSchedule: '연 3회 (3월, 7월, 10월)', description: '정보처리 관련 산업기사 자격을 취득한 자 또는 관련학과 졸업자 등이 응시할 수 있는 국가기술자격증입니다.' } },
            { type: '자격증', name: 'ADsP (데이터분석 준전문가)', status: '준비 중', color: 'text-orange-600 bg-orange-50', details: { written: '필기: 60점 이상 (100점 만점)', practical: '실기: 없음', difficulty: '난이도: 중하', examSchedule: '연 4회 (3월, 6월, 9월, 12월)', description: '데이터 분석 기초 지식과 데이터 분석 프로세스에 대한 이해를 인증하는 자격증입니다.' } },
            { type: '자격증', name: 'SQLD (SQL 개발자)', status: '취득 권장', color: 'text-green-600 bg-green-50', details: { written: '필기: 60점 이상 (100점 만점)', practical: '실기: 없음', difficulty: '난이도: 중하', examSchedule: '연 4회 (3월, 6월, 9월, 12월)', description: '데이터베이스와 데이터 모델링에 대한 지식을 바탕으로 SQL을 작성하고 활용할 수 있는 능력을 인증합니다.' } },
            { type: '자격증', name: '컴퓨터활용능력 1급', status: '준비 중', color: 'text-purple-600 bg-purple-50', details: { written: '필기: 70점 이상 (100점 만점)', practical: '실기: 70점 이상 (100점 만점)', difficulty: '난이도: 중', examSchedule: '연 4회 (3월, 6월, 9월, 12월)', description: '컴퓨터 활용 능력을 평가하는 자격증으로, 엑셀, 액세스 등의 활용 능력을 인증합니다.' } }
        )
    }

    const devPrograms = ['패스트캠퍼스 백엔드 개발 부트캠프', '네이버 커넥트재단 부스트캠프', '삼성 SW 아카데미', '코드스쿼드 마스터즈 코스', '우아한테크코스']
    const dataPrograms = ['패스트캠퍼스 데이터 사이언스 부트캠프', '네이버 커넥트재단 부스트캠프 AI', '삼성 SDS 멀티캠퍼스 데이터 분석 과정', '코드스테이츠 AI 부트캠프', '플래티넘 데이터 아카데미']
    const civilPrograms = ['한국건설기술인협회 토목기사 실무과정', '한국건설기술교육원 건설기사 양성과정', '한국토지주택공사 토목기술자 교육과정', '건설교육원 토목설계 실무과정', '한국건설산업교육원 토목시공 전문과정']
    const safetyPrograms = ['한국산업안전보건공단 산업안전기사 양성과정', '건설안전교육원 건설안전기사 실무과정', '한국안전교육원 산업안전 전문가 과정', '안전보건교육원 안전관리자 양성과정', '한국건설안전협회 건설안전 전문교육']
    const mechPrograms = ['한국기계산업진흥회 기계기사 실무과정', '한국자동차산업협회 자동차정비 전문교육', '기계교육원 기계설계 실무과정', '한국산업인력공단 기계기사 양성과정', '기계기술교육원 기계제조 전문과정']
    const elecPrograms = ['한국전기공사협회 전기기사 실무과정', '한국전자산업진흥회 전자기사 양성과정', '전기교육원 전기설비 실무과정', '한국산업인력공단 전기기사 전문교육', '전자기술교육원 전자설계 실무과정']
    const generalPrograms = ['패스트캠퍼스 IT 부트캠프', '네이버 커넥트재단 부스트캠프', '삼성 SW 아카데미', '코드스테이츠 부트캠프', '멀티캠퍼스 IT 과정']
    let educationProgram = ''
    if (isDevCareer) educationProgram = devPrograms[Math.floor(Math.random() * devPrograms.length)]
    else if (isDataRule) educationProgram = dataPrograms[Math.floor(Math.random() * dataPrograms.length)]
    else if (isCivilRule) educationProgram = civilPrograms[Math.floor(Math.random() * civilPrograms.length)]
    else if (isSafetyRule) educationProgram = safetyPrograms[Math.floor(Math.random() * safetyPrograms.length)]
    else if (isMechRule) educationProgram = mechPrograms[Math.floor(Math.random() * mechPrograms.length)]
    else if (isElecRule) educationProgram = elecPrograms[Math.floor(Math.random() * elecPrograms.length)]
    else educationProgram = generalPrograms[Math.floor(Math.random() * generalPrograms.length)]
    dynamicCerts.push({ type: '교육', name: educationProgram, status: '수료 권장', color: 'text-indigo-600 bg-indigo-50' })

    return { info, dynamicSkills, dynamicCerts, targetJob, targetCompany }
}
