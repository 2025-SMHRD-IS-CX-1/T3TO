/**
 * 2025-02-19 오늘 수정 사항 - 핵심 코드 참고용
 * 실제 적용 위치: src/app/(dashboard)/roadmap/actions.ts, roadmap/page.tsx, admin/clients/page.tsx, dashboard/page.tsx, timeline.tsx
 * 이 파일은 복사용 참고이며, 단독 실행되지 않음.
 */

// ========== 1. 직무별 실제 필요 역량 (자격·경력) 반환 ==========
// 위치: roadmap/actions.ts

function getConcreteRequiredCompetencies(targetJob: string, major?: string): string {
    const j = (targetJob || '').toLowerCase()
    const m = (major || '').toLowerCase()

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

// ========== 2. 프로필 기반 역량 수준(0~100) 분석 ==========
// 위치: roadmap/actions.ts

function computeCompetenciesFromProfile(
    profile: { major?: string; education_level?: string; work_experience_years?: number },
    analysisList: Array<{ strengths?: string; interest_keywords?: string; career_values?: string }>,
    targetJob: string,
    targetCompany: string
): Array<{ title: string; desc: string; level: number }> {
    const major = (profile?.major || '').trim()
    const educationLevel = (profile?.education_level || '').trim()
    const workYears = typeof profile?.work_experience_years === 'number' ? profile.work_experience_years : 0
    const analysisText = analysisList
        .map((a) => [a.strengths, a.interest_keywords, a.career_values].filter(Boolean).join(' '))
        .join(' ')
        .toLowerCase()
    const hasStrength = (keywords: string[]) => keywords.some((k) => analysisText.includes(k.toLowerCase()))
    const educationScore = !educationLevel ? 0 : /대학원|석사|박사/i.test(educationLevel) ? 15 : /대학교\s*졸업|대졸|4년제/i.test(educationLevel) ? 12 : /전문대|대학교\s*재학|대재/i.test(educationLevel) ? 8 : /고등학교|고졸/i.test(educationLevel) ? 3 : 5
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
    if (targetCompany && targetCompany !== '없음' && targetCompany !== '미정') jobLevel += 5
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
    const concreteCompetencies = getConcreteRequiredCompetencies(targetJob, major)
    return [
        { title: '목표 직무 필요 역량', desc: concreteCompetencies, level: Math.round(jobLevel) },
        { title: '데이터 분석 및 활용', desc: '실무 데이터 기반 문제 해결 및 의사결정 능력', level: Math.round(dataLevel) },
        { title: '협업 도구 활용', desc: '팀 협업·소통 및 협업 도구 숙련도', level: Math.round(collabLevel) },
        { title: '문제 해결', desc: '복잡한 실무 문제를 논리적으로 분해하고 해결하는 능력', level: Math.round(problemLevel) },
    ]
}

// ========== 3. 목표 구체화 가이드 상수 (목표 기업 없을 때 사용) ==========
// 위치: roadmap/actions.ts

const GOAL_CONCRETIZATION_CONTENT = `【목표 구체화를 위한 상세 안내】

1. SMART 목표 설정
• Specific(구체적): "개발자"가 아니라 "백엔드/프론트엔드/데이터 엔지니어" 등 구체 직무
• Measurable(측정 가능): "역량 쌓기"가 아니라 "정보처리기사 취득", "포트폴리오 2개 완성"
• Achievable(달성 가능): 현재 학력·경력에서 1~2년 내 도달 가능한 수준
• Relevant(관련성): 전공·경험·관심사와 연결된 직무·산업
• Time-bound(기한): "3개월 내 자격증 취득", "6개월 내 인턴 지원" 등

2. 직무·산업 구체화
• 희망 직무를 1~2개로 좁히기: 채용 사이트(원티드, 잡코리아)에서 실제 공고 키워드로 검색해 비슷한 직무명 확인
• 관심 산업 정하기: IT·금융·제조·공공·스타트업 등, 직무와 맞는 산업 1~2개
• 목표 연봉·근무 형태(정규직/인턴/프리랜서) 범위 정하기

3. 역량 갭 분석
• 해당 직무 채용 공고 5~10개에서 공통 요구 역량·자격·경험 정리
• 현재 보유 역량과 비교해 부족한 항목(기술, 자격증, 프로젝트 경험 등) 리스트업
• 부족 역량 중 3개월·6개월·1년 단위로 보완할 항목 우선순위 정하기

4. 다음 단계
• 위 내용을 바탕으로 1단계(기초 역량)→2단계(역량 강화·포트폴리오)→3단계(취업·안착) 순서로 실행 계획 수립
• 상담 시 "구체적 직무명", "선호 산업", "갭 분석 결과"를 공유하면 더 맞춤형 로드맵을 만들 수 있습니다.`

// ========== 4. 나이 입력 UI (연령대 → 실제 나이) ==========
// 위치: dashboard/page.tsx, admin/clients/page.tsx

// 대시보드·관리자 폼:
// <Label htmlFor="age_group">나이</Label>
// <Input id="age_group" name="age_group" type="number" min={15} max={100} placeholder="만 25" ... />

// 관리자 상세/로드맵 표시 (숫자면 "25세", 아니면 기존 연령대 그대로):
// const ageDisplay = selectedClient.age_group && /^\d+$/.test(String(selectedClient.age_group))
//   ? `${selectedClient.age_group}세` : (selectedClient.age_group || '미정')

// ========== 5. 리소스 content 표시 (로드맵 단계 다이얼로그) ==========
// 위치: roadmap/page.tsx

// {selectedStep.resources.map((resource, i) => (
//   <li key={i}>
//     <span>• {resource.title}</span>
//     {'content' in resource && resource.content && (
//       <div className="mt-1.5 pl-4 py-2 bg-gray-50 rounded-md text-gray-700 whitespace-pre-wrap max-h-48 overflow-y-auto text-xs">
//         {resource.content}
//       </div>
//     )}
//   </li>
// ))}

// ========== 6. 타입 확장 (리소스에 content) ==========
// 위치: timeline.tsx
// resources?: { title: string; url: string; type: "video" | "article" | "quiz"; content?: string }[]

export {}
