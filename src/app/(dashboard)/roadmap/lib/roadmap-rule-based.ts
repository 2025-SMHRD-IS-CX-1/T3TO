/**
 * 규칙 기반 로드맵 생성. 검색(웹) + RAG(프로필·상담·분석) 결과로 제목·설명·액션을 구체화. 하드코딩·목표 기업 변수 치환 최소화.
 */
import type { RoadmapAdapters, RoadmapRagContext, RunRoadmapResult } from './roadmap-adapters'
import type { CompanyInfo, JobInfo } from './roadmap-types'
import { computeCompetenciesFromProfile, extractKeywordsFromAnalysis } from './roadmap-competencies'
import { filterRelevantQualifications } from './roadmap-qnet'
import { GOAL_CONCRETIZATION_CONTENT } from './roadmap-prompts'
import { recommendCertificationsWithRag, getCertificationsFromOpenAIFallback, getCertificationsFromTavilyContext } from './roadmap-qnet-rag'

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

    // 1) 검색·RAG 선행: 기업 검색 + 직무 검색 (자격증/시험일정 API 미사용)
    const companies = targetCompany ? targetCompany.split(/[,，、]/).map((c) => c.trim()).filter(Boolean) : []
    const [companyInfosRule, jobInfoResult] = await Promise.all([
        companies.length && adapters.searchCompany
            ? Promise.race([
                adapters.searchCompany(companies),
                new Promise<CompanyInfo[]>((r) => setTimeout(() => r([]), 8000)),
            ])
            : Promise.resolve([] as CompanyInfo[]),
        adapters.searchJob ? adapters.searchJob(targetJob).catch(() => null) : Promise.resolve(null as JobInfo | null),
    ])
    const qualifications: unknown[] = []
    const examSchedule: unknown[] = []
    const searchSummary = summarizeFromSearch(companyInfosRule, jobInfoResult ?? null)

    const educationLevel = clientData?.education_level || ruleProfile?.education_level || '정보 없음'
    const major = clientData?.major || ruleProfile?.major || '전공 분야'
    const experience = clientData?.work_experience ?? ''

    const isDevCareer = /개발|소프트웨어\s*엔지니어|IT\s*엔지니어|프로그래머|백엔드|프론트엔드|풀스택|웹\s*개발|앱\s*개발/i.test(targetJob)
    const isHWEngineerCareer = /전기|전자|기계|기계설계|자동차|반도체|로봇|메카트로닉스|제어|플랜트|화학공학|토목|건축|건설|환경|신소재|재료/i.test(targetJob + ' ' + major) && !isDevCareer
    const isCounselingCareer = /상담|심리|복지|사회복지|청소년|아동|임상|치료|교육|보육/i.test(targetJob)
    const isMedicalCareer = /의사|의료|간호|약사|보건|의학|병원|클리닉|재활|물리치료/i.test(targetJob)
    const isResearchCareer = /연구|연구원|연구개발|R&D|실험|분석/i.test(targetJob) && !isDevCareer
    const isBusinessCareer = /경영|기획|마케팅|영업|회계|재무|인사|총무|행정|사무/i.test(targetJob)
    const hasSearchData = companyInfosRule.length > 0 || searchSummary.techStackSummary || searchSummary.talentProfileSummary || searchSummary.recruitmentSummary || searchSummary.jobSkillsSummary

    // 2) 1단계: RAG(프로필·상담 분석) 기반 제목·설명·액션
    const isUnivOrHigher = /대학교\s*재학|대학\s*재학|대재|재학\s*중|대학교\s*졸업|대졸|4년제|졸업\s*예정|대학원|석사|박사/i.test(educationLevel)
    const isLowEducation = /고등학교\s*졸업|고졸|전문대\s*재학/i.test(educationLevel)
    let phase1Title = ''
    if (isLowEducation) {
        phase1Title = `1단계: ${targetJob} 기초 역량 확보 및 자격증 준비`
    } else if (experience && String(experience).length > 20) {
        phase1Title = `1단계: 경력 활용 ${targetJob} 전문성 강화`
    } else {
        phase1Title = `1단계: ${targetJob} 실무 역량 기반 구축`
    }
    const phase1Desc = `목표 직무(${targetJob}) 달성을 위한 기초 역량을 다집니다.`

    // 자격증 추천: Tavily 자격증 검색(Q-Net 대체) 또는 OpenAI 폴백
    const dynamicSkills = computeCompetenciesFromProfile(ruleProfile, ruleAnalysisList, targetJob, targetCompany)
    const jobInfoFromTavily = jobInfoResult ? {
        jobTitle: jobInfoResult.jobTitle,
        requirements: jobInfoResult.requirements,
        trends: jobInfoResult.trends,
        skills: jobInfoResult.skills,
        certifications: (jobInfoResult as { certifications?: string }).certifications,
    } : null
    let dynamicCerts: RunRoadmapResult['dynamicCerts']
    if (qualifications.length > 0) {
        dynamicCerts = await recommendCertificationsWithRag({
            qualifications,
            examSchedule,
            targetJob,
            major,
            analysisList: ruleAnalysisList,
            jobInfoFromTavily,
        })
    } else if (adapters.searchCertification) {
        try {
            const tavilyCertContext = await Promise.race([
                adapters.searchCertification(targetJob, major),
                new Promise<{ summary: string; results: Array<{ title: string; url: string; content: string }> }>((r) => setTimeout(() => r({ summary: '', results: [] }), 8000)),
            ])
            if (tavilyCertContext.summary.length > 0 || tavilyCertContext.results.length > 0) {
                dynamicCerts = await getCertificationsFromTavilyContext({
                    targetJob,
                    major,
                    analysisList: ruleAnalysisList,
                    tavilyCertContext,
                    jobInfoFromTavily,
                    education_level: educationLevel,
                })
            } else {
                dynamicCerts = await getCertificationsFromOpenAIFallback({ targetJob, major, analysisList: ruleAnalysisList, jobInfoFromTavily, education_level: educationLevel })
            }
        } catch {
            dynamicCerts = await getCertificationsFromOpenAIFallback({ targetJob, major, analysisList: ruleAnalysisList, jobInfoFromTavily, education_level: educationLevel })
        }
    } else {
        dynamicCerts = await getCertificationsFromOpenAIFallback({
            targetJob,
            major,
            analysisList: ruleAnalysisList,
            jobInfoFromTavily,
            education_level: educationLevel,
        })
    }

    // 전공/직무 기반 첫 번째 자격증 추천 (Q-Net 결과 우선, 없으면 전공 기반)
    const firstCertName = dynamicCerts.length > 0 ? dynamicCerts[0].name : (major && major !== '전공 분야' && major !== '정보 없음' ? `${major} 관련 자격증` : '목표 직무 관련 자격증')
    let phase1Actions: string[]
    if (isDevCareer) {
        phase1Actions = [
            `전공 지식 증명을 위해 **${firstCertName}** 필기 일정 수립 및 3개월 내 1차 취득 목표`,
            `${major} 실무 연계: ${targetJob} 관련 소규모 프로젝트 1개 이상 기획·구현 (Git 저장소 관리)`,
            `협업 도구 숙달: Git 브랜치 전략, Jira 이슈/스프린트 작성 연습`,
            `데이터 기반 문제 해결: 실무 데이터 분석 사례 1건 정리 (의사결정 근거 문서화)`,
        ]
    } else if (isHWEngineerCareer) {
        phase1Actions = [
            `**${firstCertName}** 필기·실기 학습 일정 수립 및 3개월 내 1차 취득 목표`,
            `${major} 전공 핵심 과목 복습 및 ${targetJob} 관련 실무 이론 정리`,
            `CAD·시뮬레이션 도구 등 직무 필수 소프트웨어 실습`,
            `${targetJob} 관련 현장 실습·산업체 견학·실험 참여로 실무 감각 쌓기`,
        ]
    } else if (isCounselingCareer) {
        phase1Actions = [
            `**${firstCertName}** 취득을 위한 학습 일정 수립 및 3개월 내 필기 합격 목표`,
            `${major} 기본 과목 이수 및 ${targetJob} 관련 기초 이론·사례 독서 정리`,
            `상담이론 및 심리치료 관련 서적 독서 및 요약 정리`,
            `${targetJob} 현장 봉사활동·관찰 실습 참여로 실무 감각 쌓기`,
        ]
    } else if (isMedicalCareer) {
        phase1Actions = [
            `**${firstCertName}** 취득을 위한 학습 계획 수립 및 3개월 내 1차 합격 목표`,
            `${major} 기본 과목 복습 및 ${targetJob} 관련 임상 지식 정리`,
            `관련 의료기관·보건소 현장 견학 및 실습 기회 탐색`,
            `${targetJob} 실무 사례 학습 및 최신 가이드라인·프로토콜 파악`,
        ]
    } else if (isResearchCareer) {
        phase1Actions = [
            `**${firstCertName}** 취득을 위한 학습 일정 수립 및 3개월 내 1차 합격 목표`,
            `${major} 핵심 이론 복습 및 ${targetJob} 관련 최신 논문·보고서 리뷰`,
            `실험 설계·데이터 수집 방법론 학습 및 소규모 실습 진행`,
            `연구 윤리·학술 논문 작성법 기초 학습`,
        ]
    } else if (isBusinessCareer) {
        phase1Actions = [
            `**${firstCertName}** 취득을 위한 학습 일정 수립 및 3개월 내 필기 합격 목표`,
            `${major} 실무 연계: ${targetJob} 관련 기초 분석 보고서 1건 작성`,
            `비즈니스 문서 작성·프레젠테이션 스킬 향상 연습`,
            `${targetJob} 관련 산업 동향·시장 분석 자료 정리`,
        ]
    } else {
        phase1Actions = [
            `**${firstCertName}** 취득을 위한 학습 일정 수립 및 3개월 내 1차 합격 목표`,
            `${major} 기초 이론 정리 및 ${targetJob} 직무와 연결한 학습 계획 수립`,
            `${targetJob} 관련 현장 경험·실습 기회 탐색 및 참여`,
            `${targetJob} 실무 사례 학습 및 직무 이해도 향상`,
        ]
    }
    if (isLowEducation) {
        phase1Actions[0] = `${firstCertName} 또는 관련 기초 자격증 준비 (필기 합격 목표)`
        phase1Actions[1] = `${major} 기초 이론 정리 및 ${targetJob} 진로와 연결한 학습 로드맵 작성`
    }
    if (ragSummary.interests) {
        phase1Actions.push(`관심 분야를 직무와 연결한 학습 계획 반영`)
    }

    // 3) 2단계: 검색(인재상·채용·기술스택) + RAG 기반 제목·설명·액션 (기업명 하드코딩 없음)
    let phase2Title = ''
    let phase2Desc = ''
    let phase2Actions: string[] = []

    // 직무 유형별 성과물 용어 결정
    const getOutputTerm = () => {
        if (isDevCareer) return { noun: '포트폴리오', detail: '포트폴리오 프로젝트 1~2개 완성 (Git, 문서화, 배포 URL 포함)' }
        if (isHWEngineerCareer) return { noun: '설계·시뮬레이션 보고서', detail: '설계 도면·시뮬레이션 결과 보고서 1건 완성 및 실험/프로젝트 결과 정리' }
        if (isCounselingCareer) return { noun: '사례 연구·실습 보고서', detail: '상담 사례 연구 및 분석 보고서 작성, 관련 기관 인턴십·현장 실습 참여' }
        if (isMedicalCareer) return { noun: '임상 실습·사례 보고서', detail: '임상 실습 경험 축적 및 사례 보고서 작성, 관련 기관 실습 참여' }
        if (isResearchCareer) return { noun: '논문·실험 보고서', detail: '연구 논문 또는 실험 보고서 1편 작성, 학회 발표·참여 경험 확보' }
        if (isBusinessCareer) return { noun: '기획서·분석 보고서', detail: '직무 관련 기획서·분석 보고서 1건 완성 및 실무 사례 정리' }
        return { noun: '실무 성과물', detail: `${targetJob} 관련 실무 성과물·보고서 1건 이상 완성` }
    }
    const outputTerm = getOutputTerm()

    if (hasSearchData && (searchSummary.techStackSummary || searchSummary.recruitmentSummary || searchSummary.talentProfileSummary)) {
        const techLabel = searchSummary.techStackSummary
            ? searchSummary.techStackSummary.slice(0, 60) + (searchSummary.techStackSummary.length > 60 ? '…' : '')
            : ''
        if (isDevCareer) {
            phase2Title = techLabel
                ? `2단계: ${techLabel} 포트폴리오 1~2개 완성 및 인턴십·오픈소스 기여 준비`
                : `2단계: 포트폴리오 1~2개 완성 및 인턴십·오픈소스 기여 준비`
            phase2Desc = `포트폴리오 완성·오픈소스 기여·자격증 등 구체적 역량 개발을 실행합니다.`
            phase2Actions = [
                `요구 기술 스택을 분석하고, 해당 기술을 활용한 포트폴리오 프로젝트 1~2개 기획`,
                `추구 인재상에 맞춰 내 강점과 연결한 차별화 포인트를 정리해 프로젝트에 반영`,
                `아키텍처·실무 스택 학습 후 프로젝트에 적용`,
                `AWS 또는 GCP 실습 환경 구축 및 관련 자격증 준비`,
                `원티드·로켓펀치에서 채용 사이클·지원 절차 확인 및 네트워킹·설명회 일정 파악`,
            ]
        } else {
            phase2Title = `2단계: ${outputTerm.noun}·자격증·실습으로 역량 보완 및 지원 준비`
            phase2Desc = `${outputTerm.noun} 완성·자격증 취득 등 구체적 역량 개발을 실행합니다.`
            phase2Actions = [
                `채용 공고 요구사항을 분석하고, 해당 역량을 입증할 ${outputTerm.noun} 준비`,
                `추구 인재상에 맞춰 내 강점과 연결한 차별화 포인트 정리`,
                outputTerm.detail,
                `직무 관련 상위 자격증 준비 및 실무 역량 축적`,
                `채용 사이트(잡코리아, 사람인 등)에서 채용 사이클·지원 절차 확인`,
            ]
        }
    } else {
        if (isDevCareer) {
            phase2Title = `2단계: ${targetJob} 포트폴리오 1~2개 완성 및 관련 자격증·인턴 지원 준비`
            phase2Desc = `${targetJob} 역량 강화: 포트폴리오·인턴·자격증 등으로 실무 역량을 개발합니다.`
            phase2Actions = [
                `${targetJob} 직무 기술서 및 실제 채용 공고를 분석하여 역량 갭 분석 및 보완 학습 계획 수립`,
                `포트폴리오용 실무 결과물 1~2개 완성 (Git, 문서화, 배포 URL 포함)`,
                `AWS 또는 직무 핵심 도구 활용 프로젝트 1건 추가 및 클라우드 배포 경험 축적`,
                `희망 기업 리스트업 및 각 기업별 채용 사이클·지원 전략 상세 정리`,
            ]
        } else {
            phase2Title = `2단계: ${targetJob} ${outputTerm.noun} 완성 및 인턴십·자격증 준비`
            phase2Desc = `${targetJob} 역량 강화: ${outputTerm.noun}·인턴십·자격증 등으로 실무 역량을 개발합니다.`
            phase2Actions = [
                `${targetJob} 채용 공고를 분석하여 역량 갭 분석 및 보완 학습 계획 수립`,
                outputTerm.detail,
                `관련 기관 인턴십·현장 실습 기회 탐색 및 지원서 준비`,
                `희망 기관 리스트업 및 채용 사이클·지원 전략 정리`,
            ]
        }
    }

    // 4) 3단계: 검색(채용 프로세스·면접) + RAG 기반 (기업명 하드코딩 없음)
    let phase3Title: string
    let phase3Desc: string
    if (isDevCareer) {
        phase3Title = '3단계: 프로그래머스·백준 코딩테스트 주 3회 + 원티드 면접 후기로 STAR 기법 연습'
        phase3Desc = `프로그래머스(programmers.co.kr)·백준(BOJ) 코딩테스트 연습, 원티드(wanted.co.kr) 면접 후기 참고 및 STAR 기법 스토리텔링 연습을 진행합니다.`
    } else if (isHWEngineerCareer) {
        phase3Title = `3단계: ${targetJob} 전공 면접·NCS 필기 대비 및 취업 정보 수집`
        phase3Desc = `${targetJob} 채용 프로세스에 맞는 전공 기술 면접·NCS 필기 대비, 잡코리아·사람인 면접 후기 분석 및 STAR 기법 스토리텔링 연습을 진행합니다.`
    } else if (isCounselingCareer) {
        phase3Title = `3단계: ${targetJob} 면접 준비 및 전공 면접·사례 면접 대비`
        phase3Desc = `${targetJob} 채용 프로세스에 맞는 면접 준비 방법 습득, 잡코리아·사람인 면접 후기 분석 및 STAR 기법 스토리텔링 연습을 진행합니다.`
    } else if (isMedicalCareer) {
        phase3Title = `3단계: ${targetJob} 면접 준비 및 임상·전공 면접 대비`
        phase3Desc = `${targetJob} 채용 프로세스에 맞는 전공 지식 면접·인성 면접 준비, 취업 사이트 면접 후기 분석을 진행합니다.`
    } else {
        phase3Title = `3단계: ${targetJob} 면접 준비 및 취업 정보 수집`
        phase3Desc = `원티드(wanted.co.kr)·잡코리아(jobkorea.co.kr) 면접 후기 참고 및 STAR 기법 스토리텔링 연습을 진행합니다.`
    }

    let phase3Actions: string[]
    if (isDevCareer) {
        phase3Actions = hasSearchData
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
    } else if (isHWEngineerCareer) {
        phase3Actions = [
            `전공 기술 면접 대비: ${major} 핵심 이론 및 실무 지식 정리, 기출문제 분석`,
            `NCS 직업기초능력평가 대비 (해당 시 필기시험·적성검사 준비)`,
            `잡코리아, 사람인 등에서 면접 후기 분석 및 STAR 기법 스토리텔링 연습`,
            `인턴십·현장실습 경험 활용한 입사 후 3개월 목표 설정 (실무 투입·팀 적응)`,
        ]
    } else if (isCounselingCareer) {
        phase3Actions = [
            `전공 면접 대비를 위한 상담 이론 및 사례 정리`,
            `잡코리아, 사람인 등에서 면접 후기 분석 및 STAR 기법 연습`,
            `관련 기관 인턴십·수습 기회 탐색 및 입사 후 적응 준비`,
            `입사 후 단기 목표 설정 (수련·적응·첫 사례 담당 등)`,
        ]
    } else {
        phase3Actions = [
            `목표 기관별 이력서·자기소개서 버전 관리 및 맞춤 수정`,
            `전공 면접·인성 면접 예상 질문 정리 및 STAR 기법 스토리텔링 연습`,
            `지원 일정·합격/불합격 피드백 기록으로 전략 보완 및 다음 지원에 반영`,
            `입사 후 단기 목표 설정 (온보딩 완료, 실무 적응, 팀 융화 등)`,
        ]
    }

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

    const devPrograms = ['패스트캠퍼스 백엔드 개발 부트캠프', '네이버 커넥트재단 부스트캠프', '삼성 SW 아카데미', '코드스쿼드 마스터즈 코스', '우아한테크코스']
    const dataPrograms = ['패스트캠퍼스 데이터 사이언스 부트캠프', '네이버 커넥트재단 부스트캠프 AI', '삼성 SDS 멀티캠퍼스 데이터 분석 과정', '코드스테이츠 AI 부트캠프', '플래티넘 데이터 아카데미']
    const civilPrograms = ['한국건설기술인협회 토목기사 실무과정', '한국건설기술교육원 건설기사 양성과정', '한국토지주택공사 토목기술자 교육과정', '건설교육원 토목설계 실무과정', '한국건설산업교육원 토목시공 전문과정']
    const safetyPrograms = ['한국산업안전보건공단 산업안전기사 양성과정', '건설안전교육원 건설안전기사 실무과정', '한국안전교육원 산업안전 전문가 과정', '안전보건교육원 안전관리자 양성과정', '한국건설안전협회 건설안전 전문교육']
    const mechPrograms = ['한국기계산업진흥회 기계기사 실무과정', '한국자동차산업협회 자동차정비 전문교육', '기계교육원 기계설계 실무과정', '한국산업인력공단 기계기사 양성과정', '기계기술교육원 기계제조 전문과정']
    const elecPrograms = ['한국전기공사협회 전기기사 실무과정', '한국전자산업진흥회 전자기사 양성과정', '전기교육원 전기설비 실무과정', '한국산업인력공단 전기기사 전문교육', '전자기술교육원 전자설계 실무과정']
    const generalPrograms = ['패스트캠퍼스 IT 부트캠프', '네이버 커넥트재단 부스트캠프', '삼성 SW 아카데미', '코드스테이츠 부트캠프', '멀티캠퍼스 IT 과정']
    
    // 직무 계열 분석
    const isDataRule = /데이터|분석|AI|인공지능/i.test(targetJob)
    const isCivilRule = /토목|건설|측량|건축|구조/i.test(targetJob)
    const isSafetyRule = /안전|산업안전|건설안전/i.test(targetJob)
    const isMechRule = /기계|자동차|메카트로닉스/i.test(targetJob)
    const isElecRule = /전기|전자|전기기사|전자기사/i.test(targetJob)
    
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
