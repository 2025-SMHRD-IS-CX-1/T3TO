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

/** 직무별로 실제 필요한 역량의 핵심(자격·경력·역량)을 구체적으로 반환 (폴백용 하드코딩) */
export function getConcreteRequiredCompetencies(targetJob: string, major?: string): string {
    const j = (targetJob || '').toLowerCase()
    const m = (major || '').toLowerCase()

    const isMedicalEng = /의학공학|의료공학|의료기기|바이오의공학|바이오공학/i.test(m)
    const isMedicalTechJob = /의료AI|헬스케어\s*AI|의료\s*개발|의료\s*엔지니어|의료기기/i.test(j)
    if (isMedicalEng || isMedicalTechJob)
        return '고가용성 시스템·데이터 파이프라인, 머신러닝·의료 데이터 품질 관리, 개발 역량'

    if (/의사|의료|의과|병원|클리닉/i.test(j) || /의학|의과|간호|약학|보건/i.test(m)) {
        if (/신경외과|신경외과의/i.test(j) || /신경외과/i.test(m)) return '의사면허, 신경외과 전문의·펠로우 경력, 수술·진료 역량'
        if (/내과|가정의|일반의/i.test(j)) return '의사면허, 해당 과목 수련·전문의 자격, 진료 역량'
        if (/외과|정형외과|흉부외과/i.test(j)) return '의사면허, 해당 과목 전문의·펠로우 경력, 수술 역량'
        if (/소아과|소아청소년/i.test(j)) return '의사면허, 소아청소년과 전문의·수련, 진료 역량'
        if (/정신과|정신의학/i.test(j)) return '의사면허, 정신과 전문의·수련, 상담·치료 역량'
        return '의사면허, 해당 과목 전문의·수련 경력, 진료 역량'
    }
    if (/간호|간호사/i.test(j)) return '간호사 면허, 임상 경력, 환자 돌봄·기록 역량'
    if (/약사|약학/i.test(j)) return '약사 면허, 조제·복약지도 역량, GMP·품질 관리'

    if (/백엔드|서버|backend/i.test(j)) return '정보처리기사·관련 자격, 서버·DB 개발 역량, Git·API 설계 경험'
    if (/프론트엔드|프론트|frontend|웹 개발/i.test(j)) return 'HTML/CSS/JS·React 등 프레임워크, 반응형·접근성, Git·협업'
    if (/풀스택|fullstack|웹/i.test(j)) return '프론트·백엔드 기술 스택, DB·API, Git·배포 경험'
    if (/소프트웨어|개발자|엔지니어|프로그래머/i.test(j) && !/데이터|분석|AI/i.test(j)) {
        if (/임베디드|펌웨어|IoT/i.test(j)) return 'C/C++·임베디드 개발, 하드웨어 이해, 디버깅·테스트 역량'
        if (/앱|android|ios|모바일/i.test(j)) return '모바일 프레임워크(Android/iOS), API 연동, 스토어 배포 경험'
        return '정보처리기사·관련 자격, 프로그래밍·설계 역량, Git·협업·프로젝트 경험'
    }

    if (/데이터\s*분석|데이터분석|데이터\s*사이언티스트/i.test(j)) return 'SQL·데이터 분석 도구, ADsP·빅데이터분석기사 등, 리포팅·시각화 역량'
    if (/AI|인공지능|머신러닝|ML|딥러닝/i.test(j)) return 'Python·통계·ML 프레임워크, 데이터 파이프라인, 논문·실험 역량'
    if (/의료AI|헬스케어\s*AI/i.test(j)) return '의료 데이터·규제 이해, AI/ML 역량, 임상 연계·검증 경험'

    if (/토목|건설|측량|건축|구조/i.test(j)) return '토목기사·건설기사·측량기사 등, 설계·시공·안전 관리 역량'
    if (/안전|산업안전|건설안전|소방/i.test(j)) return '산업안전기사·안전관리자 등, 위험성 평가·교육·점검 역량'

    if (/기계|자동차|메카트로닉스/i.test(j)) return '기계기사·관련 자격, 설계·제조·정비 역량, CAD·시뮬레이션'
    if (/전기|전자|전기기사|전자기사/i.test(j)) return '전기기사·전자기사 등, 설계·시공·유지보수 역량'

    if (/마케팅|기획|PM|프로덕트/i.test(j)) return '시장 분석·기획 역량, 데이터 기반 의사결정, 커뮤니케이션·협업'
    if (/인사|HR|채용|조직/i.test(j)) return '노무·채용 프로세스 이해, 조직 분석·역량 개발, 커뮤니케이션'

    if (/개발|엔지니어|소프트웨어/i.test(j)) return '정보처리기사·관련 자격, 실무 기술 스택·프로젝트 경험, 협업·버전관리'
    if (/데이터|분석/i.test(j)) return '데이터 분석 도구·SQL, ADsP 등 자격, 리포팅·의사결정 지원 역량'
    return '해당 분야 자격·수련·실무 경력, 직무 수행에 필요한 핵심 역량'
}

/** 프로필·상담분석 기반 핵심 직무 역량과 수준(0~100). jobRequirementsText 있으면 실제 검색 역량 사용, 없으면 getConcreteRequiredCompetencies 폴백 */
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
    const majorJobMatch = (() => {
        const jobWords = ['개발', '엔지니어', '소프트웨어', '데이터', '분석', 'AI', '인공지능', '컴퓨터', '공학', 'IT', '프로그래머']
        const majorWords = ['컴퓨터', '공학', '소프트웨어', '정보', '데이터', '통계', '경영', '산업', '전자', '전기', 'IT']
        const jobMatch = jobWords.some((w) => jobLower.includes(w) && (majorLower.includes(w) || majorLower.includes('공학') || majorLower.includes('정보')))
        const majorMatch = majorWords.some((w) => majorLower.includes(w) && jobLower.includes(w))
        if (jobMatch || majorMatch) return 25
        if (majorLower && jobLower && (majorLower.includes('공학') || majorLower.includes('학과'))) return 12
        return 0
    })()

    let jobLevel = 45 + majorJobMatch + Math.min(educationScore, 15) + Math.min(experienceScore, 15)
    if (hasTargetCompany) jobLevel += 5
    if (hasStrength(['기술', '개발', '코딩', '프로그래밍', '문제해결', '논리', '분석'])) jobLevel += 10
    jobLevel = Math.min(95, Math.max(25, jobLevel))

    const isDataJob = /데이터|분석|AI|인공지능|빅데이터/i.test(targetJob)
    const isDataMajor = /데이터|통계|경영|정보|컴퓨터/i.test(majorLower)
    let dataLevel = 40
    if (isDataJob) dataLevel += 25
    if (isDataMajor) dataLevel += 15
    dataLevel += Math.min(experienceScore, 10) + Math.min(educationScore, 10)
    if (hasStrength(['데이터', '분석', '통계', '수치', '리포트'])) dataLevel += 10
    dataLevel = Math.min(95, Math.max(30, dataLevel))

    let collabLevel = 50 + Math.min(experienceScore, 25) + Math.min(educationScore, 15)
    if (hasStrength(['협업', '소통', '팀', '커뮤니케이션', '협력'])) collabLevel += 10
    collabLevel = Math.min(95, Math.max(35, collabLevel))

    let problemLevel = 50 + Math.min(experienceScore, 20) + Math.min(educationScore, 15)
    if (hasStrength(['문제해결', '논리', '분석', '해결', '도전'])) problemLevel += 10
    problemLevel = Math.min(95, Math.max(35, problemLevel))

    const concreteCompetencies =
        (jobRequirementsText && jobRequirementsText.trim()) || getConcreteRequiredCompetencies(targetJob, major)
    const segments = concreteCompetencies.split(/[,·]/).map((s) => s.trim()).filter(Boolean)

    /** 직무·프로필·상담을 종합해 첫 번째 역량 제목 판단 (의학공학=의료기기/의료AI, 의사=진료·전문의 구분) */
    const synthesizedFirstTitle = ((): string => {
        const j = (targetJob || '').toLowerCase()
        const isPhysicianJob = /의사|의과|진료|전문의|내과|외과|소아과|정신과|신경외과|가정의|일반의/i.test(j)
        const isMedicalEngMajor = /의학공학|의료공학|의료기기|바이오의공학|바이오공학/i.test(majorLower)
        const isMedicalTechJob = /의료AI|의료기기|헬스케어\s*AI|의료\s*개발|의료\s*엔지니어/i.test(j)
        if (isPhysicianJob) return '진료·전문의 역량'
        if (isMedicalEngMajor || isMedicalTechJob) return '의료기기·의료AI 역량'
        if (/의료|의과|병원|클리닉/i.test(j)) return '의료·기술 역량'
        if (/간호|약사|약학/i.test(j)) return '면허·실무 역량'
        if (/백엔드|프론트|풀스택|소프트웨어|개발자|엔지니어|프로그래머/i.test(j)) return '개발·설계 역량'
        if (/데이터|분석|AI|인공지능|머신러닝/i.test(j)) return '데이터·분석 역량'
        if (/토목|건설|안전|기계|전기|전자/i.test(j)) return '기술·관리 역량'
        if (/마케팅|기획|PM|인사|HR/i.test(j)) return '기획·협업 역량'
        if (targetJob) return `${targetJob} 핵심 역량`
        return '목표 직무 역량'
    })()

    /** 직무 요구 요약 설명. 표시용에서 '프로필·상담 반영' 문구 제거(직접 넣지 않음, 없으면 삭제) */
    const rawKeyPoints =
        concreteCompetencies.length <= 100
            ? concreteCompetencies
            : summarizeToKeyPoints(concreteCompetencies)
    const stripped = rawKeyPoints
        .replace(/\s*·\s*프로필\s*·?\s*상담\s*반영\s*/g, ' ')
        .replace(/\s*프로필\s*·?\s*상담\s*반영\s*/g, ' ')
        .trim()
        .replace(/\s+·\s*$/, '')
        .trim()
    const firstDesc = stripped || '목표 직무 요구 역량'

    /** 목표 직무·전공에 맞는 2~4번째 역량 제목·설명 (고정 문구 제거, 프로필 맞춤) */
    const secondThirdFourth = ((): Array<{ title: string; desc: string; level: number }> => {
        if (/토목|건설|측량|건축|구조/i.test(jobLower)) {
            return [
                { title: '설계·시공 역량', desc: '설계 도면·시공·감리 등 실무 수행 능력', level: Math.round(dataLevel) },
                { title: '안전·품질 관리', desc: '현장 안전·품질 관리 및 점검 역량', level: Math.round(collabLevel) },
                { title: '협업·현장 소통', desc: '현장 협력·소통 및 공정 관리 능력', level: Math.round(problemLevel) },
            ]
        }
        if (/안전|산업안전|건설안전|소방/i.test(jobLower)) {
            return [
                { title: '위험성 평가 역량', desc: '위험성 평가·안전 점검·교육 수행 능력', level: Math.round(dataLevel) },
                { title: '안전·품질 관리', desc: '안전관리체계·점검·리포트 역량', level: Math.round(collabLevel) },
                { title: '협업·소통', desc: '현장·관리부서와의 협업 및 소통 능력', level: Math.round(problemLevel) },
            ]
        }
        if (/기계|자동차|메카트로닉스/i.test(jobLower)) {
            return [
                { title: '설계·제조 역량', desc: '설계·제조·정비·CAD 등 실무 역량', level: Math.round(dataLevel) },
                { title: '장비·품질 관리', desc: '장비 운용·점검·품질 관리 역량', level: Math.round(collabLevel) },
                { title: '문제 해결', desc: '설비·공정 문제를 논리적으로 진단·해결하는 능력', level: Math.round(problemLevel) },
            ]
        }
        if (/전기|전자|전기기사|전자기사/i.test(jobLower)) {
            return [
                { title: '설계·시공·유지보수', desc: '전기·전자 설비 설계·시공·유지보수 역량', level: Math.round(dataLevel) },
                { title: '안전·규격 준수', desc: '전기안전·규격 준수 및 점검 역량', level: Math.round(collabLevel) },
                { title: '문제 해결', desc: '장애 진단·원인 분석 및 해결 능력', level: Math.round(problemLevel) },
            ]
        }
        if (/데이터|분석|AI|인공지능|머신러닝/i.test(jobLower)) {
            return [
                { title: '데이터 분석 및 활용', desc: '실무 데이터 기반 문제 해결 및 의사결정 능력', level: Math.round(dataLevel) },
                { title: '협업 도구 활용', desc: '팀 협업·소통 및 협업 도구 숙련도', level: Math.round(collabLevel) },
                { title: '문제 해결', desc: '복잡한 실무 문제를 논리적으로 분해하고 해결하는 능력', level: Math.round(problemLevel) },
            ]
        }
        if (/백엔드|프론트|풀스택|소프트웨어|개발자|엔지니어|프로그래머/i.test(jobLower)) {
            return [
                { title: '기술 스택·실무 역량', desc: '개발 환경·버전관리·API 설계 등 실무 역량', level: Math.round(dataLevel) },
                { title: '협업 도구 활용', desc: 'Git·이슈트래킹·팀 소통 역량', level: Math.round(collabLevel) },
                { title: '문제 해결', desc: '버그·요구사항을 논리적으로 분해하고 해결하는 능력', level: Math.round(problemLevel) },
            ]
        }
        if (/의료|의학|바이오|의료기기|헬스케어/i.test(jobLower) || /의학공학|의료공학|바이오/i.test(majorLower)) {
            return [
                { title: '의료·기술 융합 역량', desc: '의료·기기·규제 이해 및 기술 적용 역량', level: Math.round(dataLevel) },
                { title: '협업·소통', desc: '임상·연구·제조 부서와의 협업 역량', level: Math.round(collabLevel) },
                { title: '문제 해결', desc: '품질·검증·장애를 논리적으로 해결하는 능력', level: Math.round(problemLevel) },
            ]
        }
        if (/마케팅|기획|PM|인사|HR|경영/i.test(jobLower)) {
            return [
                { title: '시장·데이터 분석', desc: '시장 분석·데이터 기반 의사결정 능력', level: Math.round(dataLevel) },
                { title: '협업·커뮤니케이션', desc: '팀·고객과의 협업 및 소통 역량', level: Math.round(collabLevel) },
                { title: '문제 해결', desc: '과제를 논리적으로 분해하고 실행하는 능력', level: Math.round(problemLevel) },
            ]
        }
        if (/간호|약사|약학|의사|진료/i.test(jobLower)) {
            // 첫 번째 역량이 이미 "면허·실무 역량"이므로 두 번째는 다른 제목 사용
            const secondTitle = /약사|약학/i.test(jobLower) 
                ? '조제·복약지도 역량' 
                : /간호/i.test(jobLower)
                ? '환자 돌봄·기록 역량'
                : '전문 실무 역량'
            return [
                { title: secondTitle, desc: '전문 분야 실무·기록·절차 수행 능력', level: Math.round(dataLevel) },
                { title: '협업·소통', desc: '환자·동료·타 부서와의 협업·소통 역량', level: Math.round(collabLevel) },
                { title: '문제 해결', desc: '상황 판단·대응 및 의사결정 능력', level: Math.round(problemLevel) },
            ]
        }
        return [
            { title: '실무 역량', desc: '목표 직무에 필요한 실무 수행 능력', level: Math.round(dataLevel) },
            { title: '협업 도구 활용', desc: '팀 협업·소통 및 협업 도구 숙련도', level: Math.round(collabLevel) },
            { title: '문제 해결', desc: '복잡한 실무 문제를 논리적으로 분해하고 해결하는 능력', level: Math.round(problemLevel) },
        ]
    })()

    const competencies: Array<{ title: string; desc: string; level: number }> = [
        { title: synthesizedFirstTitle, desc: firstDesc, level: Math.round(jobLevel) },
        ...secondThirdFourth,
    ]

    console.log('[역량 분석] 프로필 기반 역량 수준:', { major, educationLevel, workYears, targetJob: targetJob || '(없음)', levels: competencies.map((c) => `${c.title}: ${c.level}%`) })
    return competencies
}
