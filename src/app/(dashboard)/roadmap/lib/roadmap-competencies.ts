/** 상담 분석(강점, 관심키워드, 가치관)에서 자격증 필터링용 키워드 추출 */
export function extractKeywordsFromAnalysis(
    analysisList: Array<{ strengths?: string; interest_keywords?: string; career_values?: string }>
): string[] {
    const raw: string[] = []
    for (const a of analysisList || []) {
        if (a.strengths) raw.push(a.strengths)
        if (a.interest_keywords) raw.push(a.interest_keywords)
        if (a.career_values) raw.push(a.career_values)
    }
    const text = raw.join(' ')
    if (!text.trim()) return []
    return text.split(/[,\s·\/]+/).map((k) => k.trim()).filter((k) => k.length > 1)
}

/** 긴 텍스트에서 핵심만 요약(역량·능력·경험·자격 등 키워드 포함 구간 우선) */
function summarizeToKeyPoints(text: string, maxSegments = 3): string {
    if (!text || text.length <= 100) return text.trim()
    const byComma = text.split(/[,·]/).map((s) => s.trim()).filter((s) => s.length > 2)
    const keyPattern = /역량|능력|경험|자격|스택|개발|관리|테스트|협업|분석|설계|운영|품질|데이터|API|프로젝트/
    const keySegments = byComma.filter((s) => keyPattern.test(s) && s.length <= 60)
    const fallbackSegments = byComma.filter((s) => s.length >= 5 && s.length <= 50)
    const candidates = keySegments.length ? keySegments : fallbackSegments
    const picked = candidates.slice(0, maxSegments)
    if (picked.length) return picked.join(', ')
    const firstSentence = text.split(/[.]/)[0]?.trim()
    return (firstSentence && firstSentence.length <= 120 ? firstSentence : text.slice(0, 100).trim() + '…') || text.slice(0, 80) + '…'
}

// ────────────────────────────────────────────────────────────────
// 직무 카테고리 설정 — 세부 직종별 구분 유지, 공유 스킬은 상수로 재사용
// 배열 순서 = 매칭 우선순위 (구체 → 일반)
// ────────────────────────────────────────────────────────────────

interface JobCategoryDef {
    jobPattern: RegExp
    majorPattern?: RegExp
    firstTitle: string
    fallbackRequirements: string
    skills: Array<{ title: string; desc: string }>
}

const MEDICAL_TECH_SKILLS: JobCategoryDef['skills'] = [
    { title: '의료·기술 융합', desc: '의료·기기·규제 이해 및 기술 적용' },
    { title: '협업·소통', desc: '임상·연구·제조 부서 간 협업' },
    { title: '문제 해결', desc: '품질·검증·장애의 논리적 해결' },
]
const PHYSICIAN_SKILLS: JobCategoryDef['skills'] = [
    { title: '전문 실무', desc: '진료·기록·절차 수행 능력' },
    { title: '협업·소통', desc: '환자·동료·타 부서 협업' },
    { title: '상황 판단', desc: '응급 대응·의사결정 능력' },
]
const SW_DEV_SKILLS: JobCategoryDef['skills'] = [
    { title: '기술 스택·실무', desc: '개발 환경·버전관리·API 설계 등' },
    { title: '협업 도구 활용', desc: 'Git·이슈트래킹·팀 소통' },
    { title: '문제 해결', desc: '버그·요구사항의 논리적 분해·해결' },
]
const DATA_AI_SKILLS: JobCategoryDef['skills'] = [
    { title: '데이터 분석·활용', desc: '데이터 기반 문제 해결·의사결정' },
    { title: '협업 도구 활용', desc: '팀 협업·소통·도구 숙련' },
    { title: '문제 해결', desc: '복잡한 문제의 논리적 분해·해결' },
]
const BIZ_SKILLS: JobCategoryDef['skills'] = [
    { title: '시장·데이터 분석', desc: '시장 분석·데이터 기반 의사결정' },
    { title: '협업·커뮤니케이션', desc: '팀·고객 협업·소통' },
    { title: '문제 해결', desc: '과제의 논리적 분해·실행' },
]

const JOB_CATEGORIES: JobCategoryDef[] = [
    // ── 의료기기·의료AI ──
    {
        jobPattern: /의료AI|헬스케어\s*AI|의료\s*(개발|엔지니어)|의료기기/i,
        majorPattern: /의학공학|의료공학|의료기기|바이오의공학|바이오공학/i,
        firstTitle: '의료기기·의료AI 역량',
        fallbackRequirements: '고가용성 시스템·데이터 파이프라인, 머신러닝·의료 데이터 품질 관리, 개발 역량',
        skills: MEDICAL_TECH_SKILLS,
    },
    // ── 의사 (과목별 세분화, 구체 → 일반 순서) ──
    { jobPattern: /신경외과/i, firstTitle: '진료·전문의 역량', fallbackRequirements: '의사면허, 신경외과 전문의·펠로우 경력, 수술·진료 역량', skills: PHYSICIAN_SKILLS },
    { jobPattern: /외과|정형외과|흉부외과/i, firstTitle: '진료·전문의 역량', fallbackRequirements: '의사면허, 해당 과목 전문의·펠로우 경력, 수술 역량', skills: PHYSICIAN_SKILLS },
    { jobPattern: /소아과|소아청소년/i, firstTitle: '진료·전문의 역량', fallbackRequirements: '의사면허, 소아청소년과 전문의·수련, 진료 역량', skills: PHYSICIAN_SKILLS },
    { jobPattern: /정신과|정신의학/i, firstTitle: '진료·전문의 역량', fallbackRequirements: '의사면허, 정신과 전문의·수련, 상담·치료 역량', skills: PHYSICIAN_SKILLS },
    { jobPattern: /의사|의과|진료|전문의|내과|가정의|일반의/i, firstTitle: '진료·전문의 역량', fallbackRequirements: '의사면허, 해당 과목 전문의·수련 경력, 진료 역량', skills: PHYSICIAN_SKILLS },
    // ── 간호·약사 (개별 구분) ──
    {
        jobPattern: /간호|간호사/i, firstTitle: '면허·실무 역량',
        fallbackRequirements: '간호사 면허, 임상 경력, 환자 돌봄·기록 역량',
        skills: [
            { title: '환자 돌봄·기록', desc: '환자 돌봄·기록·절차 수행 능력' },
            { title: '협업·소통', desc: '환자·동료·타 부서 협업·소통' },
            { title: '문제 해결', desc: '상황 판단·대응 및 의사결정 능력' },
        ],
    },
    {
        jobPattern: /약사|약학/i, firstTitle: '면허·실무 역량',
        fallbackRequirements: '약사 면허, 조제·복약지도 역량, GMP·품질 관리',
        skills: [
            { title: '조제·복약지도', desc: '조제·복약지도·기록 등 실무' },
            { title: '협업·소통', desc: '환자·동료·타 부서 협업·소통' },
            { title: '문제 해결', desc: '상황 판단·대응 및 의사결정 능력' },
        ],
    },
    // ── 의료 일반 (위 세부에 안 걸린 의료 관련 catch-all) ──
    {
        jobPattern: /의료|의과|병원|클리닉|헬스케어|바이오/i,
        majorPattern: /의학|의과|간호|약학|보건/i,
        firstTitle: '의료·기술 역량',
        fallbackRequirements: '의료·기기·규제 이해, 기술 적용·임상 연계 역량',
        skills: MEDICAL_TECH_SKILLS,
    },
    // ── 데이터·AI (세분화) ──
    {
        jobPattern: /데이터\s*분석|데이터분석|데이터\s*사이언티스트/i,
        majorPattern: /데이터|통계|경영|정보|컴퓨터|수학|산업/i,
        firstTitle: '데이터·분석 역량',
        fallbackRequirements: 'SQL·데이터 분석 도구, ADsP·빅데이터분석기사 등, 리포팅·시각화 역량',
        skills: DATA_AI_SKILLS,
    },
    {
        jobPattern: /AI|인공지능|머신러닝|ML|딥러닝/i,
        majorPattern: /데이터|통계|컴퓨터|수학|정보/i,
        firstTitle: '데이터·분석 역량',
        fallbackRequirements: 'Python·통계·ML 프레임워크, 데이터 파이프라인, 논문·실험 역량',
        skills: DATA_AI_SKILLS,
    },
    {
        jobPattern: /데이터|분석|빅데이터/i,
        majorPattern: /데이터|통계|경영|정보|컴퓨터|수학|산업/i,
        firstTitle: '데이터·분석 역량',
        fallbackRequirements: '데이터 분석 도구·SQL, ADsP 등 자격, 리포팅·의사결정 지원 역량',
        skills: DATA_AI_SKILLS,
    },
    // ── SW 개발 (세분화) ──
    { jobPattern: /백엔드|서버|backend/i, majorPattern: /컴퓨터|소프트웨어|정보|전산|IT|전자|전기/i, firstTitle: '개발·설계 역량', fallbackRequirements: '정보처리기사·관련 자격, 서버·DB 개발 역량, Git·API 설계 경험', skills: SW_DEV_SKILLS },
    { jobPattern: /프론트엔드|프론트|frontend|웹\s*개발/i, majorPattern: /컴퓨터|소프트웨어|정보|전산|IT/i, firstTitle: '개발·설계 역량', fallbackRequirements: 'HTML/CSS/JS·React 등 프레임워크, 반응형·접근성, Git·협업', skills: SW_DEV_SKILLS },
    { jobPattern: /풀스택|fullstack/i, majorPattern: /컴퓨터|소프트웨어|정보|전산|IT/i, firstTitle: '개발·설계 역량', fallbackRequirements: '프론트·백엔드 기술 스택, DB·API, Git·배포 경험', skills: SW_DEV_SKILLS },
    { jobPattern: /임베디드|펌웨어|IoT/i, majorPattern: /컴퓨터|전자|전기|정보|IT/i, firstTitle: '개발·설계 역량', fallbackRequirements: 'C/C++·임베디드 개발, 하드웨어 이해, 디버깅·테스트 역량', skills: SW_DEV_SKILLS },
    { jobPattern: /앱|android|ios|모바일/i, majorPattern: /컴퓨터|소프트웨어|정보|전산|IT/i, firstTitle: '개발·설계 역량', fallbackRequirements: '모바일 프레임워크(Android/iOS), API 연동, 스토어 배포 경험', skills: SW_DEV_SKILLS },
    { jobPattern: /소프트웨어|개발자|프로그래머/i, majorPattern: /컴퓨터|소프트웨어|정보|전산|IT|전자|전기/i, firstTitle: '개발·설계 역량', fallbackRequirements: '정보처리기사·관련 자격, 프로그래밍·설계 역량, Git·협업·프로젝트 경험', skills: SW_DEV_SKILLS },
    // ── 토목·건설 ──
    {
        jobPattern: /토목|건설|측량|건축|구조/i, firstTitle: '기술·관리 역량',
        fallbackRequirements: '토목기사·건설기사·측량기사 등, 설계·시공·안전 관리 역량',
        skills: [
            { title: '설계·시공', desc: '도면·시공·감리 등 실무 수행' },
            { title: '안전·품질 관리', desc: '현장 안전·품질 점검' },
            { title: '협업·현장 소통', desc: '현장 협력·공정 관리' },
        ],
    },
    // ── 안전·소방 ──
    {
        jobPattern: /안전|산업안전|건설안전|소방/i, firstTitle: '기술·관리 역량',
        fallbackRequirements: '산업안전기사·안전관리자 등, 위험성 평가·교육·점검 역량',
        skills: [
            { title: '위험성 평가', desc: '안전 점검·교육 수행' },
            { title: '안전·품질 관리', desc: '안전관리체계·리포트' },
            { title: '협업·소통', desc: '현장·관리부서 협업' },
        ],
    },
    // ── 기계·자동차 ──
    {
        jobPattern: /기계|자동차|메카트로닉스/i, firstTitle: '기술·관리 역량',
        fallbackRequirements: '기계기사·관련 자격, 설계·제조·정비 역량, CAD·시뮬레이션',
        skills: [
            { title: '설계·제조', desc: '설계·제조·정비·CAD 실무' },
            { title: '장비·품질 관리', desc: '장비 운용·점검·품질 관리' },
            { title: '문제 해결', desc: '설비·공정 문제 진단·해결' },
        ],
    },
    // ── 전기·전자 ──
    {
        jobPattern: /전기|전자/i, firstTitle: '기술·관리 역량',
        fallbackRequirements: '전기기사·전자기사 등, 설계·시공·유지보수 역량',
        skills: [
            { title: '설계·시공·유지보수', desc: '전기·전자 설비 설계·시공·유지보수' },
            { title: '안전·규격 준수', desc: '전기안전·규격 점검' },
            { title: '문제 해결', desc: '장애 진단·원인 분석·해결' },
        ],
    },
    // ── 마케팅·기획 / 인사·HR ──
    { jobPattern: /마케팅|기획|PM|프로덕트/i, firstTitle: '기획·협업 역량', fallbackRequirements: '시장 분석·기획 역량, 데이터 기반 의사결정, 커뮤니케이션·협업', skills: BIZ_SKILLS },
    { jobPattern: /인사|HR|채용|조직|경영/i, firstTitle: '기획·협업 역량', fallbackRequirements: '노무·채용 프로세스 이해, 조직 분석·역량 개발, 커뮤니케이션', skills: BIZ_SKILLS },
]

/** 직무명·전공명으로 카테고리 탐색. 직무 우선, 전공 보조 */
function findJobCategory(targetJob: string, major: string): JobCategoryDef | null {
    const j = (targetJob || '').trim()
    const m = (major || '').trim()
    for (const cat of JOB_CATEGORIES) {
        if (j && cat.jobPattern.test(j)) return cat
    }
    for (const cat of JOB_CATEGORIES) {
        if (m && cat.majorPattern?.test(m)) return cat
    }
    return null
}

/** 직무별 요구역량 텍스트 (웹 검색 없을 때 폴백) */
export function getConcreteRequiredCompetencies(targetJob: string, major?: string): string {
    const cat = findJobCategory(targetJob, major || '')
    if (cat) return cat.fallbackRequirements
    return '해당 분야 자격·수련·실무 경력, 직무 수행에 필요한 핵심 역량'
}

/** 프로필·상담분석 기반 핵심 직무 역량과 수준(0~100). jobRequirementsText 있으면 실제 검색 역량 사용, 없으면 카테고리 폴백 */
export function computeCompetenciesFromProfile(
    profile: { major?: string; education_level?: string; work_experience_years?: number },
    analysisList: Array<{ strengths?: string; interest_keywords?: string; career_values?: string }>,
    targetJob: string,
    targetCompany: string,
    jobRequirementsText?: string
): Array<{ title: string; desc: string; level: number }> {
    const major = (profile?.major || '').trim()
    const educationLevel = (profile?.education_level || '').trim()
    const workYears = typeof profile?.work_experience_years === 'number' ? profile.work_experience_years : 0
    const hasTargetCompany = !!(targetCompany && targetCompany !== '없음' && targetCompany !== '미정')

    const analysisText = analysisList
        .map((a) => [a.strengths, a.interest_keywords, a.career_values].filter(Boolean).join(' '))
        .join(' ')
        .toLowerCase()

    const hasStrength = (keywords: string[]) => keywords.some((k) => analysisText.includes(k.toLowerCase()))
    const educationScore = (() => {
        if (!educationLevel) return 0
        if (/대학원|석사|박사/i.test(educationLevel)) return 15
        if (/대학교\s*졸업|대졸|4년제/i.test(educationLevel)) return 12
        if (/전문대|대학교\s*재학|대재/i.test(educationLevel)) return 8
        if (/고등학교|고졸/i.test(educationLevel)) return 3
        return 5
    })()
    const experienceScore = workYears >= 3 ? 20 : workYears >= 1 ? 12 : workYears > 0 ? 5 : 0

    const jobLower = targetJob.toLowerCase()
    const majorLower = major.toLowerCase()
    const cat = findJobCategory(targetJob, major)

    // 전공-직무 일치도: 키워드 겹침 → 25, 카테고리 전공 패턴 → 25, 공학계열 → 8
    const majorJobMatch = (() => {
        if (!majorLower || !jobLower) return 0
        const majorTokens = majorLower.split(/[\s·,\/()]+/).filter(w => w.length > 1)
        const jobTokens = jobLower.split(/[\s·,\/()]+/).filter(w => w.length > 1)
        const hasOverlap = majorTokens.some(mw => jobTokens.some(jw => mw.includes(jw) || jw.includes(mw)))
        if (hasOverlap) return 25
        if (cat?.majorPattern?.test(majorLower)) return 25
        if (/공학|학과|전공/i.test(majorLower)) return 8
        return 0
    })()

    let jobLevel = 45 + majorJobMatch + Math.min(educationScore, 15) + Math.min(experienceScore, 15)
    if (hasTargetCompany) jobLevel += 5
    if (hasStrength(['기술', '개발', '코딩', '프로그래밍', '문제해결', '논리', '분석', '설계', '연구', '실험'])) jobLevel += 10
    jobLevel = Math.min(95, Math.max(25, jobLevel))

    const isJobCategoryMatch = cat !== null
    let secondaryLevel = 40
    if (isJobCategoryMatch) secondaryLevel += 15
    if (majorJobMatch >= 25) secondaryLevel += 15
    secondaryLevel += Math.min(experienceScore, 10) + Math.min(educationScore, 10)
    if (hasStrength(['데이터', '분석', '통계', '설계', '제조', '기술', '실험', '연구', '기획', '수치', '리포트'])) secondaryLevel += 10
    secondaryLevel = Math.min(95, Math.max(30, secondaryLevel))

    let collabLevel = 50 + Math.min(experienceScore, 25) + Math.min(educationScore, 15)
    if (hasStrength(['협업', '소통', '팀', '커뮤니케이션', '협력'])) collabLevel += 10
    collabLevel = Math.min(95, Math.max(35, collabLevel))

    let problemLevel = 50 + Math.min(experienceScore, 20) + Math.min(educationScore, 15)
    if (hasStrength(['문제해결', '논리', '분석', '해결', '도전'])) problemLevel += 10
    problemLevel = Math.min(95, Math.max(35, problemLevel))

    const firstTitle = cat?.firstTitle ?? (targetJob ? `${targetJob} 핵심 역량` : '목표 직무 역량')

    const concreteCompetencies =
        (jobRequirementsText && jobRequirementsText.trim()) || getConcreteRequiredCompetencies(targetJob, major)
    const rawKeyPoints =
        concreteCompetencies.length <= 100
            ? concreteCompetencies
            : summarizeToKeyPoints(concreteCompetencies)
    const firstDesc = rawKeyPoints
        .replace(/\s*·\s*프로필\s*·?\s*상담\s*반영\s*/g, ' ')
        .replace(/\s*프로필\s*·?\s*상담\s*반영\s*/g, ' ')
        .trim()
        .replace(/\s+·\s*$/, '')
        .trim() || '목표 직무 요구 역량'

    const skills = cat?.skills ?? [
        { title: `${targetJob || '직무'} 실무 역량`, desc: '목표 직무에 필요한 실무 수행 능력' },
        { title: '협업·소통', desc: '팀 협업·소통 및 프로젝트 관리 능력' },
        { title: '문제 해결', desc: '복잡한 실무 문제를 논리적으로 분해하고 해결하는 능력' },
    ]

    return [
        { title: firstTitle, desc: firstDesc, level: Math.round(jobLevel) },
        { title: skills[0].title, desc: skills[0].desc, level: Math.round(secondaryLevel) },
        { title: skills[1].title, desc: skills[1].desc, level: Math.round(collabLevel) },
        { title: skills[2].title, desc: skills[2].desc, level: Math.round(problemLevel) },
    ]
}
