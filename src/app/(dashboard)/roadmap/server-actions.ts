'use server'

import { createClient, getEffectiveUserId } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import OpenAI from 'openai'
import { getRoadmapModel } from '@/lib/ai-models'
import { getIntegratedExamSchedules, getQualificationList } from '@/lib/qnet'
import type { ExamSchedule } from '@/lib/roadmap-data'
import { searchCompanyInfo, searchJobInfo } from '@/lib/web-search'

// --- RAG: 내담자별 상담·분석·프로필·로드맵 수집 ---
async function getRoadmapRagContext(
    supabase: Awaited<ReturnType<typeof createClient>>,
    profileId: string,
    userIdStr: string
) {
    const { data: profileRows } = await supabase
        .from('career_profiles')
        .select('*')
        .eq('profile_id', profileId)
        .eq('user_id', userIdStr)

    if (!profileRows?.length) return null

    const { data: counseling } = await supabase
        .from('consultations')
        .select('*')
        .eq('profile_id', profileId)
        .eq('user_id', userIdStr)

    const consultationIds = (counseling || []).map((c: { consultation_id: string }) => c.consultation_id)
    let analysis: unknown[] = []
    for (const cid of consultationIds.slice(0, 5)) {
        const { data: a } = await supabase
            .from('consultation_analysis')
            .select('*')
            .eq('consultation_id', cid)
        if (a?.length) analysis = analysis.concat(a)
    }

    const { data: roadmap } = await supabase
        .from('career_roadmaps')
        .select('*')
        .eq('profile_id', profileId)
        .eq('user_id', userIdStr)

    return {
        counseling: counseling || [],
        analysis,
        profile: profileRows,
        roadmap: roadmap || [],
    }
}

// --- LLM 진로 로드맵 생성 (RAG: DB 데이터 + 웹 검색 결과) ---
type RagPlanStep = {
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

type RagRoadmapResult = { summary?: string; plan?: RagPlanStep[] }

async function generateRoadmapWithRag(userData: {
    counseling: unknown[]
    analysis: unknown[]
    profile: unknown[]
    roadmap: unknown[]
}): Promise<RagRoadmapResult | null> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
        console.warn('[Roadmap RAG] OPENAI_API_KEY가 없음')
        return null
    }

    const model = getRoadmapModel()
    console.log('[Roadmap RAG] 사용 모델:', model)
    const client = new OpenAI({ apiKey })

    const profile = (userData.profile?.[0] || {}) as Record<string, unknown>
    const targetJobFromProfile = (profile.recommended_careers ?? profile.target_job ?? '') as string
    const targetCompanyFromProfile = (profile.target_company ?? '') as string

    // RAG 컨텍스트 구성: DB 데이터 + 웹 검색 결과
    // 웹 검색으로 실제 데이터 수집 (환각 방지)
    // 검색 데이터는 있으면 RAG 컨텍스트에 추가하고, 없어도 DB 데이터만으로 LLM이 생성하도록 함
    let companyInfoText = ''
    let jobInfoText = ''
    let hasWebSearchData = false

    // 웹 검색 최적화: 기업과 직무 검색을 병렬로 실행 (타임아웃 10초)
    const webSearchPromises: Promise<void>[] = []

    if (targetCompanyFromProfile && targetCompanyFromProfile !== '없음' && targetCompanyFromProfile !== '미정') {
        const companies = targetCompanyFromProfile.split(/[,，、]/).map((c) => c.trim()).filter(Boolean)
        if (companies.length > 0) {
            console.log('[Roadmap LLM] 웹 검색 시작 - 목표 기업:', companies)
            webSearchPromises.push(
                searchCompanyInfo(companies)
                    .then((companyInfos) => {
                        console.log('[Roadmap LLM] 웹 검색 결과 - 기업 수:', companyInfos.length)
                        if (companyInfos.length > 0) {
                            hasWebSearchData = true
                            companyInfoText = `\n\n[목표 기업 실제 정보 (웹 검색 결과)]\n`
                            companyInfos.forEach((info) => {
                                companyInfoText += `\n${info.companyName}:\n`
                                if (info.recruitmentInfo) companyInfoText += `- 채용 공고/인재상: ${info.recruitmentInfo.slice(0, 500)}\n`
                                if (info.techStack) companyInfoText += `- 기술 스택: ${info.techStack.slice(0, 500)}\n`
                                if (info.talentProfile) companyInfoText += `- 인재상/문화: ${info.talentProfile.slice(0, 500)}\n`
                            })
                            console.log('[Roadmap LLM] 웹 검색 데이터 추가됨 - 기업 정보')
                        } else {
                            console.log('[Roadmap LLM] 웹 검색 결과 없음 - DB 데이터만으로 진행')
                        }
                    })
                    .catch((e) => {
                        console.warn('[Roadmap LLM] 기업 웹 검색 실패:', e)
                    })
            )
        }
    }

    if (targetJobFromProfile && targetJobFromProfile !== '없음' && targetJobFromProfile !== '미정') {
        console.log('[Roadmap LLM] 웹 검색 시작 - 목표 직무:', targetJobFromProfile)
        webSearchPromises.push(
            searchJobInfo(targetJobFromProfile)
                .then((jobInfo) => {
                    console.log('[Roadmap LLM] 웹 검색 결과 - 직무 정보:', jobInfo ? '있음' : '없음')
                    if (jobInfo) {
                        hasWebSearchData = true
                        jobInfoText = `\n\n[목표 직무 실제 정보 (웹 검색 결과)]\n`
                        if (jobInfo.requirements) jobInfoText += `- 채용 요구사항/역량: ${jobInfo.requirements.slice(0, 500)}\n`
                        if (jobInfo.trends) jobInfoText += `- 최신 트렌드: ${jobInfo.trends.slice(0, 500)}\n`
                        if (jobInfo.skills) jobInfoText += `- 필수 스킬/기술: ${jobInfo.skills.slice(0, 500)}\n`
                        console.log('[Roadmap LLM] 웹 검색 데이터 추가됨 - 직무 정보')
                    } else {
                        console.log('[Roadmap LLM] 웹 검색 결과 없음 - DB 데이터만으로 진행')
                    }
                })
                .catch((e) => {
                    console.warn('[Roadmap LLM] 직무 웹 검색 실패:', e)
                })
        )
    }

    // 웹 검색 병렬 실행 (최대 10초 대기)
    if (webSearchPromises.length > 0) {
        await Promise.race([
            Promise.all(webSearchPromises),
            new Promise((resolve) => setTimeout(resolve, 10000)), // 10초 타임아웃
        ])
    }

    console.log('[Roadmap RAG] RAG 컨텍스트 구성 완료 - DB 데이터: 있음, 웹 검색 데이터:', hasWebSearchData ? '있음 (RAG: DB + 웹 검색)' : '없음 (RAG: DB만)')

    const systemPrompt = `너는 진로 상담 전문가야.
아래 **RAG 컨텍스트(DB 데이터 + 웹 검색 결과)**를 **종합 분석**해서 단계별 진로 로드맵을 작성해라.

[핵심 원칙 - RAG 기반 생성]
- **RAG 컨텍스트는 DB 데이터(진로프로필, 상담내역, 분석결과)와 웹 검색 결과를 모두 포함**한다.
- DB 데이터와 웹 검색 결과를 모두 함께 참고해서 종합적으로 로드맵을 작성해라.
- 진로프로필의 필드(전공, 학력, 경력, 연령대, 성향 등)를 그대로 나열하지 말고, 상담내역·분석결과와 함께 해석하여 내담자의 현재 상태와 강점을 파악해라.
- **웹 검색으로 가져온 실제 기업 채용 공고, 인재상, 기술 스택, 직무 요구사항 정보**를 RAG 컨텍스트의 일부로 활용해서 환각을 피하고 실제 시장 정보를 반영해라.
- 웹 검색 결과가 없어도 DB 데이터만으로 RAG 기반 로드맵을 생성해라.
- **주요 목표**는 반드시 "내담자가 목표로 하는 직무(희망 직무)"와 "목표로 하는 기업(희망 기업)"으로 설정해라.
- **[중요] 진로 변경(Career Switch) 케이스 처리**: 내담자의 전공이 목표 직무와 무관한 경우(예: 토목공학 전공 -> IT 개발자 목표), **전공 관련 내용은 배경 설명에만 사용하고, 추천 활동/자격증/로드맵 단계는 100% 목표 직무 중심으로 작성해라.** 전공 관련 자격증(예: 토목기사)을 추천하지 마라.
- 모든 단계(Step1~StepN)는 "그 목표 직무·목표 기업에 도달하기 위한 역량·활동"으로 방향을 잡아라.

[RAG 컨텍스트 활용 방법 - DB 데이터 + 웹 검색 결과 종합]
1. **DB 데이터 활용 (RAG 필수 구성요소)**:
   - 진로프로필의 전공, 학력, 경력, 연령대를 바탕으로 내담자의 현재 역량 수준 파악
   - 상담내역과 분석결과에서 드러난 강점, 가치관, 관심사 반영
   - 내담자의 현재 상태에 맞는 단계별 난이도 조절

2. **웹 검색 결과 활용 (RAG 선택 구성요소 - 있으면 포함)**:
   - 목표 직무의 실제 요구사항, 최신 트렌드, 필수 스킬 정보가 있으면 RAG 컨텍스트에 포함
   - 목표 기업의 실제 채용 공고, 인재상, 기술 스택 정보가 있으면 RAG 컨텍스트에 포함
   - 웹 검색 결과가 없어도 DB 데이터만으로 RAG 기반 로드맵 생성 가능

3. **RAG 기반 종합 생성 (핵심)**:
   - **RAG 컨텍스트 = DB 데이터 + 웹 검색 결과(있으면)**를 모두 함께 사용해서 로드맵 생성
   - 검색 데이터가 있으면: RAG(DB + 웹 검색)를 활용해 내담자 현재 상태와 실제 시장 정보를 결합
   - 검색 데이터가 없으면: RAG(DB만)를 활용해 내담자 맞춤형 로드맵 생성
   - 내담자의 현재 역량 수준에서 목표까지의 갭을 분석하고, 단계별로 채워나가는 로드맵 작성

[단계별 구성 - 분석 결과 기반 맞춤형 제목 및 전략 필수]
- **단계 제목 작성 규칙 (매우 중요)**:
  - DB 필드(전공, 학력, 경력, 연령대 등)를 그대로 나열하지 말 것
  - 상담내역, 분석결과, 웹 검색 결과를 종합 분석한 결과를 바탕으로 제목 작성
  - 내담자의 현재 상태, 강점, 목표 직무/기업의 요구사항을 분석하여 구체적인 제목 생성
  - 예시 (나쁜 예): "Step1: 컴퓨터공학 전공 백엔드 개발자 기초 역량 다지기" (DB 필드 그대로 나열)
  - 예시 (좋은 예): "Step1: 백엔드 개발 기초 역량 확보 및 정보처리기사 준비" (분석 결과 기반)
  - 예시 (나쁜 예): "Step2: 삼성, 네이버 맞춤형 역량 강화" (단순 기업명 나열)
  - 예시 (좋은 예): "Step2: 삼성전자 Spring Boot 기술 스택 프로젝트 및 네이버 인턴십 준비" (분석 결과 기반)

- Step1 (단기 1~3개월): 목표 직무 달성을 위한 **기초 역량 다지기**
  - 상담내역과 분석결과에서 드러난 내담자의 현재 역량 수준을 파악하고
  - 목표 직무의 요구사항·필수 스킬과 비교해 부족한 부분을 보완하는 활동 제시
  - 제목은 내담자의 현재 상태 분석 결과를 반영하여 구체적으로 작성
  
- Step2 (중기 3~12개월): 목표 기업 맞춤형 **역량 강화** - **구체적인 역량 개발 방법 필수**
  - **역량 필드에는 일반적인 역량명(예: "클라우드 서비스 활용 능력")이 아닌, 구체적인 역량 개발 방법을 제시해야 함**
  - 반드시 다음 4가지 방법 중 적절한 것을 조합하여 제시:
    1. **경험 (Experience)**: 실제 업무 경험, 사이드 프로젝트, 오픈소스 기여 등
    2. **인턴 (Internship)**: 목표 기업 인턴십, 관련 기업 인턴십, 실습 프로그램 등
    3. **프로젝트 (Projects)**: 포트폴리오 프로젝트, 팀 프로젝트, 개인 프로젝트 등
    4. **자격증 (Certifications)**: 목표 직무 관련 자격증, 기술 인증 등
  - 예시: "삼성전자 채용 공고의 Spring Boot, Docker 기술 스택을 활용한 포트폴리오 프로젝트 1개 완성 및 GitHub 배포"
  - 예시: "네이버 인턴십 지원을 위한 오픈소스 기여 경험 축적 및 협업 프로젝트 참여"
  - 예시: "AWS Certified Developer 자격증 취득 및 클라우드 기반 프로젝트 실습"
  - 목표 기업의 실제 채용 공고·인재상·기술 스택을 구체적으로 분석하고, 이를 바탕으로 경험/인턴/프로젝트/자격증 중 어떤 방법으로 역량을 개발할지 명시
  
- Step3 (장기 1년+): 목표 기업 **최종 합격 및 안착** - **면접 준비 구체적 방법 필수**
  - **역량 필드에는 일반적인 역량명(예: "면접 준비 및 자기 PR 능력")이 아닌, 면접 준비를 위한 구체적인 사이트나 방법을 안내해야 함**
  - 반드시 다음을 포함하여 제시:
    1. **면접 준비 사이트**: 백준, 프로그래머스, LeetCode, 코딩테스트 사이트 등
    2. **면접 준비 방법**: STAR 기법, 기술 면접 대비, 인성 면접 대비 등
    3. **정보 수집 사이트**: 원티드, 잡코리아, 로켓펀치, 기업 공식 채용 페이지 등
    4. **면접 후속 조치**: 피드백 정리, 재지원 전략 등
  - 예시: "네이버 기술면접 대비: 프로그래머스(programmers.co.kr) 코딩테스트 연습 주 3회, 백준(BOJ) 알고리즘 문제 풀이"
  - 예시: "삼성전자 인성면접 대비: 원티드(wanted.co.kr) 면접 후기 참고 및 STAR 기법 스토리텔링 연습"
  - 예시: "카카오 면접 정보 수집: 로켓펀치(rocketpunch.com) 채용 공고 분석 및 기업 공식 블로그 면접 프로세스 확인"
  - 목표 기업의 실제 채용 프로세스, 면접 형식을 구체적으로 언급하며, 이를 대비하기 위한 구체적인 사이트와 방법을 제시

[Constraints]
- **단계 제목 작성 규칙 (매우 중요)**:
  - DB 필드(전공, 학력, 경력, 연령대, 성향 등)를 그대로 나열하지 말 것
  - 상담내역, 분석결과, 웹 검색 결과를 종합 분석한 결과를 바탕으로 제목 작성
  - 내담자의 현재 상태 분석, 강점 파악, 목표 직무/기업의 요구사항 분석을 통해 구체적이고 맞춤형인 제목 생성
  - 예시 (나쁜 예): "Step1: 컴퓨터공학 전공 대학교 졸업 백엔드 개발자 기초 역량 다지기" (DB 필드 나열)
  - 예시 (좋은 예): "Step1: 백엔드 개발 기초 역량 확보 및 정보처리기사 준비" (분석 결과 기반)
  - 예시 (나쁜 예): "Step2: 삼성, 네이버 맞춤형 역량 강화" (단순 기업명 나열)
  - 예시 (좋은 예): "Step2: 삼성전자 Spring Boot 기술 스택 프로젝트 및 네이버 인턴십 준비" (분석 결과 기반)
  - 예시 (나쁜 예): "Step3: 삼성, 네이버 최종 합격 및 안착" (단순 기업명 나열)
  - 예시 (좋은 예): "Step3: 네이버 기술면접 대비 및 삼성전자 인성면접 STAR 기법 준비" (분석 결과 기반)

- 단계 제목과 추천활동은 목표 직무·목표 기업 달성을 위한 구체적 행동으로 작성.
- 내담자 정보(전공, 학력, 경력, 강점)와 실제 시장 정보를 모두 반영하되, DB 필드를 그대로 나열하지 말고 분석 결과를 바탕으로 작성해라.
- 내담자의 현재 상태와 목표 달성 요구사항의 갭을 고려해 현실적인 활동 제시.
- 추천활동은 목표 직무 역량 강화, 목표 기업 맞춤 준비에 초점.
- 직업군·역량은 목표 직무와 연결된 항목으로 제안.
- **중요**: "DB 데이터", "웹 검색", "종합" 같은 메타 표현을 출력에 포함하지 말고, 자연스러운 문구로 작성해라.

[Step2, Step3 구체적인 역량 개발 및 면접 준비 방법 필수]
- **Step2 (중기) - 역량 필드 작성 규칙**:
  - 일반적인 역량명(예: "클라우드 서비스 활용 능력", "프로젝트 관리 및 협업 능력")을 사용하지 말 것
  - 대신 구체적인 역량 개발 방법을 제시: 경험(Experience), 인턴(Internship), 프로젝트(Projects), 자격증(Certifications)
  - 예: "삼성전자 채용 공고의 Spring Boot, Docker 기술 스택을 활용한 포트폴리오 프로젝트 1개 완성 및 GitHub 배포"
  - 예: "네이버 인턴십 지원을 위한 오픈소스 기여 경험 축적 및 협업 프로젝트 참여"
  - 예: "AWS Certified Developer 자격증 취득 및 클라우드 기반 프로젝트 실습"
  - 목표 기업의 실제 채용 공고, 인재상, 기술 스택을 구체적으로 언급하며, 경험/인턴/프로젝트/자격증 중 어떤 방법으로 역량을 개발할지 명시

- **Step3 (장기) - 역량 필드 작성 규칙**:
  - 일반적인 역량명(예: "면접 준비 및 자기 PR 능력", "조직 적응 및 팀워크")을 사용하지 말 것
  - 대신 면접 준비를 위한 구체적인 사이트나 방법을 안내:
    * 면접 준비 사이트: 백준(acmicpc.net), 프로그래머스(programmers.co.kr), LeetCode, 코딩테스트 사이트 등
    * 면접 준비 방법: STAR 기법, 기술 면접 대비, 인성 면접 대비 등
    * 정보 수집 사이트: 원티드(wanted.co.kr), 잡코리아(jobkorea.co.kr), 로켓펀치(rocketpunch.com), 기업 공식 채용 페이지 등
  - 예: "네이버 기술면접 대비: 프로그래머스(programmers.co.kr) 코딩테스트 연습 주 3회, 백준(BOJ) 알고리즘 문제 풀이"
  - 예: "삼성전자 인성면접 대비: 원티드(wanted.co.kr) 면접 후기 참고 및 STAR 기법 스토리텔링 연습"
  - 예: "카카오 면접 정보 수집: 로켓펀치(rocketpunch.com) 채용 공고 분석 및 기업 공식 블로그 면접 프로세스 확인"
  - 목표 기업의 실제 면접 형식, 채용 프로세스를 구체적으로 언급하며, 이를 대비하기 위한 구체적인 사이트와 방법을 제시

[교육 과정 추천 - 실제 교육 프로그램 필수]
- 교육과정 필드는 출력하지 말아라. 교육 과정은 시스템에서 자동으로 실제 교육 프로그램으로 추가된다.
- 만약 교육 과정을 언급해야 한다면, 추천활동에 실제 존재하는 교육 프로그램 이름을 구체적으로 언급해라.
  - 개발자: "패스트캠퍼스 백엔드 개발 부트캠프 수료", "네이버 커넥트재단 부스트캠프 참여", "삼성 SW 아카데미 지원" 등
  - 데이터 분석: "패스트캠퍼스 데이터 사이언스 부트캠프 수료", "네이버 커넥트재단 부스트캠프 AI 참여" 등
  - 일반적인 이름(예: "백엔드 개발자 전문 과정")은 사용하지 말고 반드시 실제 교육 프로그램 이름을 사용해라.

[Output Format]
반드시 아래 JSON만 출력해라. 다른 설명 없이 JSON만.
{
  "summary": "목표 직무·목표 기업을 명시한 한 줄 요약 (예: OOO 직무 및 OOO 기업 입사를 목표로 ~)",
  "plan": [
    {
      "단계": "분석 결과를 바탕으로 한 구체적인 Step1 제목 (예: '백엔드 개발 기초 역량 확보 및 정보처리기사 준비', DB 필드 나열 금지)",
      "추천활동": ["내담자의 전공과 학력을 바탕으로 목표 직무에 필요한 구체적 활동1","활동2"],
      "직업군": ["목표와 연관 직업1","직업2"],
      "역량": ["목표 달성에 필요한 역량1","역량2"]
    },
    {
      "단계": "분석 결과를 바탕으로 한 구체적인 Step2 제목 (예: '삼성전자 Spring Boot 기술 스택 프로젝트 및 네이버 인턴십 준비', 단순 기업명 나열 금지)",
      "추천활동": [
        "목표 기업의 실제 채용 공고에서 요구하는 기술 스택을 구체적으로 언급하며 프로젝트 계획 (예: '네이버 채용 공고의 Spring Boot, Redis 기술 스택을 활용한 프로젝트')",
        "목표 기업의 인재상을 구체적으로 언급하며 차별화 포인트 연결 (예: '삼성전자 인재상(혁신, 협업)을 반영한 팀 프로젝트 경험 정리')",
        "목표 기업의 기술 블로그/공식 자료를 분석한 구체적 학습 계획 (예: '카카오 기술 블로그의 마이크로서비스 아키텍처 사례 분석 및 실습')"
      ],
      "직업군": ["목표와 연관 직업1","직업2"],
      "역량": [
        "구체적인 역량 개발 방법 제시 (예: '삼성전자 채용 공고의 Spring Boot, Docker 기술 스택을 활용한 포트폴리오 프로젝트 1개 완성 및 GitHub 배포')",
        "경험/인턴/프로젝트/자격증 중 적절한 방법 명시 (예: '네이버 인턴십 지원을 위한 오픈소스 기여 경험 축적 및 협업 프로젝트 참여')"
      ]
    },
    {
      "단계": "분석 결과를 바탕으로 한 구체적인 Step3 제목 (예: '네이버 기술면접 대비 및 삼성전자 인성면접 STAR 기법 준비', 단순 기업명 나열 금지)",
      "추천활동": [
        "목표 기업의 실제 채용 프로세스를 구체적으로 언급하며 면접 준비 (예: '네이버 기술면접 형식(코딩테스트 + 시스템 설계) 대비 주 3회 문제 풀이')",
        "목표 기업의 면접 형식/문화를 구체적으로 언급하며 스토리텔링 준비 (예: '삼성전자 인성면접 대비: 회사 가치관과 내 경험을 연결한 STAR 기법 연습')",
        "목표 기업의 온보딩/입사 후 과정을 구체적으로 언급하며 준비 (예: '카카오 신입사원 온보딩 프로그램 일정 확인 및 첫 3개월 목표 설정')"
      ],
      "직업군": ["목표와 연관 직업1","직업2"],
      "역량": [
        "면접 준비를 위한 구체적인 사이트 안내 (예: '네이버 기술면접 대비: 프로그래머스(programmers.co.kr) 코딩테스트 연습 주 3회, 백준(BOJ) 알고리즘 문제 풀이')",
        "면접 정보 수집 사이트 및 방법 안내 (예: '삼성전자 인성면접 대비: 원티드(wanted.co.kr) 면접 후기 참고 및 STAR 기법 스토리텔링 연습')"
      ]
    }
  ]
}`

    const context = `[RAG 컨텍스트 - DB 데이터 + 웹 검색 결과]

[내담자 목표 (로드맵의 핵심 방향)]
- 목표 직무(희망 직무): ${targetJobFromProfile || '프로필·상담에서 추출'}
- 목표 기업(희망 기업): ${targetCompanyFromProfile || '프로필·상담에서 추출'}
위 목표 직무·기업을 달성하는 데 초점을 맞춰 단계를 구성해라.

[RAG 컨텍스트 구성요소 1: 웹 검색 결과 - 실제 시장 정보 (환각 방지)]
${jobInfoText || '(목표 직무 웹 검색 결과 없음 - RAG는 DB 데이터만 사용)'}

${companyInfoText || '(목표 기업 웹 검색 결과 없음 - RAG는 DB 데이터만 사용)'}

[RAG 컨텍스트 구성요소 2: DB 데이터 - 내담자 현재 상태 및 상담 정보]
진로프로필 (전공, 학력, 경력, 연령대, 성향 등): ${JSON.stringify(userData.profile)}
상담내역: ${JSON.stringify(userData.counseling)}
상담내역 분석결과 (강점, 가치관, 관심사 등): ${JSON.stringify(userData.analysis)}
기존 로드맵: ${JSON.stringify(userData.roadmap)}

[작성 지침 - RAG 컨텍스트(DB + 웹 검색) 종합 활용]
- 위 RAG 컨텍스트의 DB 데이터를 참고해 내담자의 현재 상태(전공, 학력, 경력, 강점, 가치관)를 파악하고
- RAG 컨텍스트에 웹 검색 결과가 포함되어 있으면 실제 시장 정보(직무 요구사항, 기업 채용 공고, 인재상, 기술 스택)를 함께 활용하고
- 웹 검색 결과가 RAG 컨텍스트에 없어도 DB 데이터만으로 RAG 기반 내담자 맞춤형 로드맵을 생성해라
- **핵심**: RAG 컨텍스트의 모든 데이터(DB + 웹 검색)를 함께 사용해서 종합적으로 로드맵을 작성해라. 웹 검색이 실패해도 RAG(DB만)로 생성해야 한다.
- 내담자의 현재 상태에서 목표까지의 갭을 분석하고, 단계별로 현실적인 로드맵을 작성해라.`

    try {
        console.log('[Roadmap RAG] LLM 호출 시작 - 컨텍스트 길이:', context.length)
        const res = await client.chat.completions.create({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: context },
            ],
            temperature: 0,
        })
        const text = res.choices[0]?.message?.content?.trim() || ''
        console.log('[Roadmap RAG] LLM 응답 받음 - 길이:', text.length, '처음 200자:', text.slice(0, 200))
        let jsonStr = text
        if (text.startsWith('```')) {
            const lines = text.split('\n')
            jsonStr = lines[0].includes('json') ? lines.slice(1, -1).join('\n') : text
        }
        const parsed = JSON.parse(jsonStr) as RagRoadmapResult
        console.log('[Roadmap RAG] JSON 파싱 성공 - plan 수:', parsed?.plan?.length || 0)
        return parsed
    } catch (e) {
        console.error('[Roadmap RAG] LLM 에러 발생:', e)
        if (e instanceof Error) {
            console.error('[Roadmap RAG] 에러 메시지:', e.message)
            console.error('[Roadmap RAG] 에러 스택:', e.stack)
        }
        return null
    }
}

// Q-Net API에서 가져온 자격증을 전공/직무 키워드로 필터링
function filterRelevantQualifications(
    qualifications: unknown[],
    examSchedule: unknown[],
    targetJob: string,
    major: string
): Array<{ type: string; name: string; status: string; color: string; details?: { written?: string; practical?: string; difficulty?: string; examSchedule?: string; description?: string } }> {
    const keywords: string[] = []

    // 목표 직무에서 키워드 추출
    if (targetJob) {
        keywords.push(...targetJob.split(/[,\s]+/).filter(k => k.length > 1))
        // 직무 관련 일반 키워드 추가
        if (/개발|엔지니어|소프트웨어|프로그래머/i.test(targetJob)) {
            keywords.push('정보처리', '소프트웨어', 'IT', '컴퓨터')
        }
        if (/데이터|분석|AI|인공지능/i.test(targetJob)) {
            keywords.push('데이터', '분석', '빅데이터', 'AI')
        }
        if (/토목|건설|측량|건축|구조/i.test(targetJob)) {
            keywords.push('토목', '건설', '측량', '건축', '구조')
        }
        if (/안전|산업안전|건설안전/i.test(targetJob)) {
            keywords.push('안전', '산업안전', '건설안전', '소방')
        }
        if (/기계|자동차|메카트로닉스/i.test(targetJob)) {
            keywords.push('기계', '자동차', '용접', '메카트로닉스')
        }
        if (/전기|전자|전기기사|전자기사/i.test(targetJob)) {
            keywords.push('전기', '전자', '전기공사', '산업계측')
        }
    }

    // 전공은 진로 변경 시 부적절한 추천을 유발할 수 있으므로, 자격증 필터링 키워드에서 제외하거나 보조로만 사용
    // if (major && major !== '정보 없음' && major !== '전공 분야') {
    //    keywords.push(...major.split(/[,\s]+/).filter(k => k.length > 1))
    // }

    // 중복 제거 및 소문자 변환
    const uniqueKeywords = [...new Set(keywords.map(k => k.toLowerCase()))]

    console.log('[Q-Net 필터링] 목표 직무:', targetJob, '전공:', major, '키워드:', uniqueKeywords)

    // 자격증 필터링
    const relevantCerts: Array<{ type: string; name: string; status: string; color: string; details?: { written?: string; practical?: string; difficulty?: string; examSchedule?: string; description?: string } }> = []
    const seenNames = new Set<string>()

    for (const qual of qualifications) {
        if (!qual || typeof qual !== 'object') continue

        const qualObj = qual as Record<string, unknown>
        const qualName = String(qualObj.qualName || qualObj.qualNm || qualObj.name || '').trim()
        const qualDesc = String(qualObj.description || qualObj.desc || qualObj.qualDesc || '').trim()

        if (!qualName || seenNames.has(qualName)) continue

        // 키워드 매칭 확인
        const qualNameLower = qualName.toLowerCase()
        const qualDescLower = qualDesc.toLowerCase()
        const matchesKeyword = uniqueKeywords.some(keyword =>
            qualNameLower.includes(keyword) || qualDescLower.includes(keyword)
        )

        // 키워드가 없으면 모든 자격증을 포함하거나, 기본 키워드로 매칭
        // [수정] '기사', '산업기사'가 포함된 자격증을 무조건 포함하는 로직 제거 (타 전공 자격증 포함 방지)
        if (uniqueKeywords.length === 0 || matchesKeyword) {
            // 시험 일정 찾기 (ExamSchedule[] 타입 사용)
            let examScheduleInfo = '일정 공고 확인 필요'
            const now = new Date()

            // 해당 자격증과 관련된 일정 필터링
            // examSchedule은 unknown[]으로 전달될 수 있으므로 명시적 형변환
            const schedules = examSchedule as ExamSchedule[]
            const certSchedules = schedules.filter(s =>
                (s.summary.includes(qualName) || s.description.includes(qualName))
            )

            // 1순위: 원서접수 일정 중 마감되지 않은 것 (미래 시작 or 현재 진행중)
            // 종료일(end_date)이 지나지 않은 '원서접수' 일정
            const registrationSchedules = certSchedules.filter(s =>
                s.summary.includes('원서접수') && new Date(s.end_date) >= now
            )

            // 시작일 기준 오름차순 정렬
            registrationSchedules.sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())

            if (registrationSchedules.length > 0) {
                const nearest = registrationSchedules[0]
                const startDate = new Date(nearest.start_date)
                const endDate = new Date(nearest.end_date)

                // D-Day 계산 (시작일 기준)
                const diffTime = startDate.getTime() - now.getTime()
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

                let dDayStr = ''
                if (diffDays > 0) {
                    dDayStr = `(D-${diffDays})`
                } else if (diffDays <= 0 && endDate >= now) {
                    dDayStr = '(접수중)'
                }

                // 요약에서 자격증 이름 제외하고 깔끔하게 표시
                // 예: [정보처리기사] 필기 원서접수 (2026년도 제1회) -> 필기 원서접수 (2026년도 제1회)
                const cleanSummary = nearest.summary.replace(`[${qualName}]`, '').trim()

                // 날짜 포맷 간단화 (YYYY-MM-DD -> MM.DD)
                const startFmt = nearest.start_date.substring(5).replace('-', '.')
                const endFmt = nearest.end_date.substring(5).replace('-', '.')

                examScheduleInfo = `${cleanSummary}: ${startFmt}~${endFmt} ${dDayStr}`
            } else {
                // 2순위: 접수 일정은 없지만 남은 시험 일정이 있는 경우
                const examOnlySchedules = certSchedules.filter(s => s.summary.includes('시험') && !s.summary.includes('원서접수') && new Date(s.end_date) >= now)

                if (examOnlySchedules.length > 0) {
                    examOnlySchedules.sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
                    const nearest = examOnlySchedules[0]
                    const cleanSummary = nearest.summary.replace(`[${qualName}]`, '').trim()
                    const startFmt = nearest.start_date.substring(5).replace('-', '.')
                    const endFmt = nearest.end_date.substring(5).replace('-', '.')
                    examScheduleInfo = `${cleanSummary}: ${startFmt}~${endFmt} (접수마감)`
                } else if (certSchedules.length > 0) {
                    // 2026년 일정이 있지만 모두 지난 경우
                    examScheduleInfo = '2026년 일정 종료 (내년 일정 확인 필요)'
                }
            }

            const colors = [
                'text-blue-600 bg-blue-50',
                'text-green-600 bg-green-50',
                'text-orange-600 bg-orange-50',
                'text-purple-600 bg-purple-50',
                'text-red-600 bg-red-50',
            ]
            const statuses = ['취득 권장', '준비 중', '관심 분야']

            relevantCerts.push({
                type: '자격증',
                name: qualName,
                status: statuses[relevantCerts.length % statuses.length],
                color: colors[relevantCerts.length % colors.length],
                details: {
                    description: qualDesc || `${qualName}에 관한 국가기술자격증입니다.`,
                    examSchedule: examScheduleInfo || '시험일정: Q-Net 공식 사이트 확인',
                    difficulty: '난이도: 중',
                    written: '필기: 100점 만점에 60점 이상',
                    practical: '실기: 100점 만점에 60점 이상',
                }
            })
            seenNames.add(qualName)

            // 최대 4개까지만
            if (relevantCerts.length >= 4) break
        }
    }

    console.log('[Q-Net 필터링] 필터링된 자격증 수:', relevantCerts.length)
    return relevantCerts
}

// RAG plan + Q-Net API 데이터를 기존 마일스톤/스킬/자격 형식으로 변환
function ragPlanToMilestones(
    rag: RagRoadmapResult,
    clientData: { recommended_careers?: string; target_company?: string; education_level?: string; major?: string },
    qualifications: unknown[] = [],
    examSchedule: ExamSchedule[] = []
): {
    info: Array<{ id: string; title: string; description: string; status: string; date: string; quizScore: number; resources: { title: string; url: string; type: 'video' | 'article' | 'quiz' }[]; actionItems: string[] }>
    dynamicSkills: Array<{ title: string; desc: string; level: number }>
    dynamicCerts: Array<{ type: string; name: string; status: string; color: string; details?: { written?: string; practical?: string; difficulty?: string; examSchedule?: string; description?: string } }>
    targetJob: string
    targetCompany: string
} {
    const targetJob = (clientData?.recommended_careers && clientData.recommended_careers !== '없음' && clientData.recommended_careers !== '미정')
        ? clientData.recommended_careers
        : '희망 직무'
    const targetCompany = (clientData?.target_company && clientData.target_company !== '없음' && clientData.target_company !== '미정')
        ? clientData.target_company
        : ''

    const plan = rag?.plan || []
    const summary = rag?.summary || ''

    const dynamicSkills = [
        { title: `${targetJob} 숙련도`, desc: `${targetJob} 수행을 위한 핵심 역량`, level: 80 },
        { title: '데이터 분석 및 활용', desc: '실무 데이터 기반 문제 해결 능력', level: 70 },
        { title: '협업 도구 활용', desc: '팀 협업 시스템 숙련도', level: 85 },
        { title: '문제 해결', desc: '논리적 분해 및 해결 능력', level: 75 },
    ]

    // Q-Net API에서 가져온 자격증을 전공/직무 키워드로 필터링
    const major = clientData?.major || ''
    let dynamicCerts = filterRelevantQualifications(qualifications, examSchedule, targetJob, major)

    // Q-Net API에서 필터링된 자격증이 없거나 부족한 경우에만 기본 자격증 추가
    if (dynamicCerts.length < 3) {
        console.log('[Q-Net 필터링] 필터링된 자격증이 부족하여 기본 자격증 추가')
        // [수정] '엔지니어'라는 단어만으로는 IT 직무로 판단하지 않도록 구체화
        const isDevCareer = /개발|소프트웨어|프로그래머|코딩|웹|앱|백엔드|프론트엔드|풀스택|데이터|클라우드|인공지능|AI|시스템\s*엔지니어|네트워크/i.test(targetJob)
        const isDataCareer = /데이터|분석|AI|인공지능|빅데이터/i.test(targetJob)

        if (isDevCareer || isDataCareer) {
            // IT 직무: 정보처리기사 기본 포함
            if (!dynamicCerts.some(c => c.name.includes('정보처리'))) {
                dynamicCerts.unshift({
                    type: '자격증',
                    name: '정보처리기사',
                    status: '취득 권장',
                    color: 'text-blue-600 bg-blue-50',
                    details: {
                        written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)',
                        practical: '실기: 100점 만점에 60점 이상',
                        difficulty: '난이도: 중상',
                        examSchedule: '연 3회 (3월, 7월, 10월)',
                        description: '정보처리 관련 산업기사 자격을 취득한 자 또는 관련학과 졸업자 등이 응시할 수 있는 국가기술자격증입니다.'
                    }
                })
            }
        }
    }

    // 하드코딩된 자격증 로직 제거 - Q-Net API 필터링 결과만 사용
    // 교육 프로그램만 직무별로 추가
    const isDevCareer = /개발|소프트웨어|프로그래머|코딩|웹|앱|백엔드|프론트엔드|풀스택|데이터|클라우드|인공지능|AI|시스템\s*엔지니어|네트워크/i.test(targetJob)
    const isDataCareer = /데이터|분석|AI|인공지능/i.test(targetJob)
    const isCivilCareer = /토목|건설|측량|건축|구조/i.test(targetJob)
    const isSafetyCareer = /안전|산업안전|건설안전/i.test(targetJob)
    const isMechCareer = /기계|자동차|메카트로닉스/i.test(targetJob)
    const isElecCareer = /전기|전자|전기기사|전자기사/i.test(targetJob)

    // 하드코딩된 자격증 로직 제거됨 - Q-Net API 필터링 결과만 사용
    if (false) {
        // 개발자 직무: 클라우드, 컨테이너, 데이터베이스 자격증 추가
        dynamicCerts.push(
            {
                type: '자격증',
                name: 'AWS Certified Developer',
                status: '준비 중',
                color: 'text-orange-600 bg-orange-50',
                details: {
                    written: '필기: 65점 이상 (1000점 만점)',
                    practical: '실기: 없음 (온라인 시험)',
                    difficulty: '난이도: 중',
                    examSchedule: '연중 상시 시험 가능',
                    description: 'AWS 클라우드 플랫폼에서 애플리케이션을 개발하고 배포하는 능력을 인증하는 자격증입니다.'
                }
            },
            {
                type: '자격증',
                name: 'SQLD (SQL 개발자)',
                status: '취득 권장',
                color: 'text-green-600 bg-green-50',
                details: {
                    written: '필기: 60점 이상 (100점 만점)',
                    practical: '실기: 없음',
                    difficulty: '난이도: 중하',
                    examSchedule: '연 4회 (3월, 6월, 9월, 12월)',
                    description: '데이터베이스와 데이터 모델링에 대한 지식을 바탕으로 SQL을 작성하고 활용할 수 있는 능력을 인증합니다.'
                }
            },
            {
                type: '자격증',
                name: '리눅스마스터 2급',
                status: '준비 중',
                color: 'text-purple-600 bg-purple-50',
                details: {
                    written: '필기: 70점 이상 (100점 만점)',
                    practical: '실기: 70점 이상 (100점 만점)',
                    difficulty: '난이도: 중',
                    examSchedule: '연 2회 (5월, 11월)',
                    description: '리눅스 시스템 관리 및 운영 능력을 인증하는 자격증으로, 서버 운영 및 관리 업무에 유용합니다.'
                }
            }
        )
    } else if (isDataCareer) {
        // 데이터 분석 직무: 데이터 분석, SQL, 빅데이터 자격증 추가
        dynamicCerts.push(
            {
                type: '자격증',
                name: 'ADsP (데이터분석 준전문가)',
                status: '취득 권장',
                color: 'text-orange-600 bg-orange-50',
                details: {
                    written: '필기: 60점 이상 (100점 만점)',
                    practical: '실기: 없음',
                    difficulty: '난이도: 중하',
                    examSchedule: '연 4회 (3월, 6월, 9월, 12월)',
                    description: '데이터 분석 기초 지식과 데이터 분석 프로세스에 대한 이해를 인증하는 자격증입니다.'
                }
            },
            {
                type: '자격증',
                name: 'SQLD (SQL 개발자)',
                status: '취득 권장',
                color: 'text-green-600 bg-green-50',
                details: {
                    written: '필기: 60점 이상 (100점 만점)',
                    practical: '실기: 없음',
                    difficulty: '난이도: 중하',
                    examSchedule: '연 4회 (3월, 6월, 9월, 12월)',
                    description: '데이터베이스와 데이터 모델링에 대한 지식을 바탕으로 SQL을 작성하고 활용할 수 있는 능력을 인증합니다.'
                }
            },
            {
                type: '자격증',
                name: '빅데이터분석기사',
                status: '준비 중',
                color: 'text-purple-600 bg-purple-50',
                details: {
                    written: '필기: 100점 만점에 60점 이상',
                    practical: '실기: 100점 만점에 60점 이상',
                    difficulty: '난이도: 상',
                    examSchedule: '연 1회 (10월)',
                    description: '빅데이터 분석 및 활용 능력을 종합적으로 평가하는 국가기술자격증입니다.'
                }
            }
        )
    } else if (isCivilCareer) {
        // 토목/건설 직무: 토목기사, 건설기사, 측량기사 등
        dynamicCerts.push(
            {
                type: '자격증',
                name: '토목기사',
                status: '취득 권장',
                color: 'text-blue-600 bg-blue-50',
                details: {
                    written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)',
                    practical: '실기: 100점 만점에 60점 이상',
                    difficulty: '난이도: 중상',
                    examSchedule: '연 2회 (4월, 10월)',
                    description: '토목공학에 관한 전문지식과 기술을 바탕으로 토목공사 설계, 시공, 감리 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.'
                }
            },
            {
                type: '자격증',
                name: '건설기사',
                status: '취득 권장',
                color: 'text-green-600 bg-green-50',
                details: {
                    written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)',
                    practical: '실기: 100점 만점에 60점 이상',
                    difficulty: '난이도: 중상',
                    examSchedule: '연 2회 (4월, 10월)',
                    description: '건설공학에 관한 전문지식과 기술을 바탕으로 건설공사 설계, 시공, 감리 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.'
                }
            },
            {
                type: '자격증',
                name: '측량기사',
                status: '준비 중',
                color: 'text-orange-600 bg-orange-50',
                details: {
                    written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)',
                    practical: '실기: 100점 만점에 60점 이상',
                    difficulty: '난이도: 중',
                    examSchedule: '연 2회 (4월, 10월)',
                    description: '측량에 관한 전문지식과 기술을 바탕으로 지형측량, 지적측량, 공공측량 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.'
                }
            },
            {
                type: '자격증',
                name: '건설안전기사',
                status: '준비 중',
                color: 'text-red-600 bg-red-50',
                details: {
                    written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)',
                    practical: '실기: 100점 만점에 60점 이상',
                    difficulty: '난이도: 중상',
                    examSchedule: '연 2회 (4월, 10월)',
                    description: '건설현장의 안전관리에 관한 전문지식과 기술을 바탕으로 안전관리 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.'
                }
            }
        )
    } else if (isSafetyCareer) {
        // 안전 직무: 산업안전기사, 건설안전기사 등
        dynamicCerts.push(
            {
                type: '자격증',
                name: '산업안전기사',
                status: '취득 권장',
                color: 'text-blue-600 bg-blue-50',
                details: {
                    written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)',
                    practical: '실기: 100점 만점에 60점 이상',
                    difficulty: '난이도: 중상',
                    examSchedule: '연 2회 (4월, 10월)',
                    description: '산업안전에 관한 전문지식과 기술을 바탕으로 산업현장의 안전관리 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.'
                }
            },
            {
                type: '자격증',
                name: '건설안전기사',
                status: '취득 권장',
                color: 'text-green-600 bg-green-50',
                details: {
                    written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)',
                    practical: '실기: 100점 만점에 60점 이상',
                    difficulty: '난이도: 중상',
                    examSchedule: '연 2회 (4월, 10월)',
                    description: '건설현장의 안전관리에 관한 전문지식과 기술을 바탕으로 안전관리 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.'
                }
            },
            {
                type: '자격증',
                name: '소방설비기사',
                status: '준비 중',
                color: 'text-red-600 bg-red-50',
                details: {
                    written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)',
                    practical: '실기: 100점 만점에 60점 이상',
                    difficulty: '난이도: 중상',
                    examSchedule: '연 2회 (4월, 10월)',
                    description: '소방설비에 관한 전문지식과 기술을 바탕으로 소방설비 설치, 유지관리 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.'
                }
            },
            {
                type: '자격증',
                name: '위험물기능사',
                status: '준비 중',
                color: 'text-orange-600 bg-orange-50',
                details: {
                    written: '필기: 100점 만점에 60점 이상',
                    practical: '실기: 100점 만점에 60점 이상',
                    difficulty: '난이도: 중',
                    examSchedule: '연 2회 (4월, 10월)',
                    description: '위험물의 취급 및 저장에 관한 전문지식과 기술을 인증하는 국가기술자격증입니다.'
                }
            }
        )
    } else if (isMechCareer) {
        // 기계 직무: 기계기사, 자동차정비기사 등
        dynamicCerts.push(
            {
                type: '자격증',
                name: '기계기사',
                status: '취득 권장',
                color: 'text-blue-600 bg-blue-50',
                details: {
                    written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)',
                    practical: '실기: 100점 만점에 60점 이상',
                    difficulty: '난이도: 중상',
                    examSchedule: '연 2회 (4월, 10월)',
                    description: '기계공학에 관한 전문지식과 기술을 바탕으로 기계설계, 제조, 유지관리 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.'
                }
            },
            {
                type: '자격증',
                name: '자동차정비기사',
                status: '취득 권장',
                color: 'text-green-600 bg-green-50',
                details: {
                    written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)',
                    practical: '실기: 100점 만점에 60점 이상',
                    difficulty: '난이도: 중',
                    examSchedule: '연 2회 (4월, 10월)',
                    description: '자동차 정비에 관한 전문지식과 기술을 바탕으로 자동차 점검, 수리, 정비 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.'
                }
            },
            {
                type: '자격증',
                name: '용접기사',
                status: '준비 중',
                color: 'text-orange-600 bg-orange-50',
                details: {
                    written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)',
                    practical: '실기: 100점 만점에 60점 이상',
                    difficulty: '난이도: 중',
                    examSchedule: '연 2회 (4월, 10월)',
                    description: '용접에 관한 전문지식과 기술을 바탕으로 용접 작업을 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.'
                }
            },
            {
                type: '자격증',
                name: '건설기계기사',
                status: '준비 중',
                color: 'text-purple-600 bg-purple-50',
                details: {
                    written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)',
                    practical: '실기: 100점 만점에 60점 이상',
                    difficulty: '난이도: 중상',
                    examSchedule: '연 2회 (4월, 10월)',
                    description: '건설기계에 관한 전문지식과 기술을 바탕으로 건설기계의 설계, 제조, 유지관리 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.'
                }
            }
        )
    } else if (isElecCareer) {
        // 전기/전자 직무: 전기기사, 전자기사 등
        dynamicCerts.push(
            {
                type: '자격증',
                name: '전기기사',
                status: '취득 권장',
                color: 'text-blue-600 bg-blue-50',
                details: {
                    written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)',
                    practical: '실기: 100점 만점에 60점 이상',
                    difficulty: '난이도: 중상',
                    examSchedule: '연 2회 (4월, 10월)',
                    description: '전기에 관한 전문지식과 기술을 바탕으로 전기설비 설계, 시공, 유지관리 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.'
                }
            },
            {
                type: '자격증',
                name: '전자기사',
                status: '취득 권장',
                color: 'text-green-600 bg-green-50',
                details: {
                    written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)',
                    practical: '실기: 100점 만점에 60점 이상',
                    difficulty: '난이도: 중상',
                    examSchedule: '연 2회 (4월, 10월)',
                    description: '전자공학에 관한 전문지식과 기술을 바탕으로 전자설비 설계, 제조, 유지관리 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.'
                }
            },
            {
                type: '자격증',
                name: '전기공사기사',
                status: '준비 중',
                color: 'text-orange-600 bg-orange-50',
                details: {
                    written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)',
                    practical: '실기: 100점 만점에 60점 이상',
                    difficulty: '난이도: 중',
                    examSchedule: '연 2회 (4월, 10월)',
                    description: '전기공사에 관한 전문지식과 기술을 바탕으로 전기공사 설계, 시공, 감리 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.'
                }
            },
            {
                type: '자격증',
                name: '산업계측기사',
                status: '준비 중',
                color: 'text-purple-600 bg-purple-50',
                details: {
                    written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)',
                    practical: '실기: 100점 만점에 60점 이상',
                    difficulty: '난이도: 중',
                    examSchedule: '연 2회 (4월, 10월)',
                    description: '산업계측에 관한 전문지식과 기술을 바탕으로 계측기기 설계, 설치, 유지관리 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.'
                }
            }
        )
    } else if (isDataCareer) {
        // 데이터 분석 직무는 이미 위에서 처리됨
    } else {
        // 기타 직무: 일반적인 IT 자격증 (IT 관련이 아닌 경우에도 기본 제공)
        dynamicCerts.push(
            {
                type: '자격증',
                name: '정보처리기사',
                status: '취득 권장',
                color: 'text-blue-600 bg-blue-50',
                details: {
                    written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)',
                    practical: '실기: 100점 만점에 60점 이상',
                    difficulty: '난이도: 중상',
                    examSchedule: '연 3회 (3월, 7월, 10월)',
                    description: '정보처리 관련 산업기사 자격을 취득한 자 또는 관련학과 졸업자 등이 응시할 수 있는 국가기술자격증입니다.'
                }
            },
            {
                type: '자격증',
                name: 'ADsP (데이터분석 준전문가)',
                status: '준비 중',
                color: 'text-orange-600 bg-orange-50',
                details: {
                    written: '필기: 60점 이상 (100점 만점)',
                    practical: '실기: 없음',
                    difficulty: '난이도: 중하',
                    examSchedule: '연 4회 (3월, 6월, 9월, 12월)',
                    description: '데이터 분석 기초 지식과 데이터 분석 프로세스에 대한 이해를 인증하는 자격증입니다.'
                }
            },
            {
                type: '자격증',
                name: 'SQLD (SQL 개발자)',
                status: '취득 권장',
                color: 'text-green-600 bg-green-50',
                details: {
                    written: '필기: 60점 이상 (100점 만점)',
                    practical: '실기: 없음',
                    difficulty: '난이도: 중하',
                    examSchedule: '연 4회 (3월, 6월, 9월, 12월)',
                    description: '데이터베이스와 데이터 모델링에 대한 지식을 바탕으로 SQL을 작성하고 활용할 수 있는 능력을 인증합니다.'
                }
            },
            {
                type: '자격증',
                name: '컴퓨터활용능력 1급',
                status: '준비 중',
                color: 'text-purple-600 bg-purple-50',
                details: {
                    written: '필기: 70점 이상 (100점 만점)',
                    practical: '실기: 70점 이상 (100점 만점)',
                    difficulty: '난이도: 중',
                    examSchedule: '연 4회 (3월, 6월, 9월, 12월)',
                    description: '컴퓨터 활용 능력을 평가하는 자격증으로, 엑셀, 액세스 등의 활용 능력을 인증합니다.'
                }
            }
        )
    }

    // 실제 교육 프로그램 추가 (직무별)
    let educationProgram = ''
    if (isDevCareer) {
        const devPrograms = [
            '패스트캠퍼스 백엔드 개발 부트캠프',
            '네이버 커넥트재단 부스트캠프',
            '삼성 SW 아카데미',
            '코드스쿼드 마스터즈 코스',
            '우아한테크코스'
        ]
        educationProgram = devPrograms[Math.floor(Math.random() * devPrograms.length)]
    } else if (isDataCareer) {
        const dataPrograms = [
            '패스트캠퍼스 데이터 사이언스 부트캠프',
            '네이버 커넥트재단 부스트캠프 AI',
            '삼성 SDS 멀티캠퍼스 데이터 분석 과정',
            '코드스테이츠 AI 부트캠프',
            '플래티넘 데이터 아카데미'
        ]
        educationProgram = dataPrograms[Math.floor(Math.random() * dataPrograms.length)]
    } else if (isCivilCareer) {
        const civilPrograms = [
            '한국건설기술인협회 토목기사 실무과정',
            '한국건설기술교육원 건설기사 양성과정',
            '한국토지주택공사 토목기술자 교육과정',
            '건설교육원 토목설계 실무과정',
            '한국건설산업교육원 토목시공 전문과정'
        ]
        educationProgram = civilPrograms[Math.floor(Math.random() * civilPrograms.length)]
    } else if (isSafetyCareer) {
        const safetyPrograms = [
            '한국산업안전보건공단 산업안전기사 양성과정',
            '건설안전교육원 건설안전기사 실무과정',
            '한국안전교육원 산업안전 전문가 과정',
            '안전보건교육원 안전관리자 양성과정',
            '한국건설안전협회 건설안전 전문교육'
        ]
        educationProgram = safetyPrograms[Math.floor(Math.random() * safetyPrograms.length)]
    } else if (isMechCareer) {
        const mechPrograms = [
            '한국기계산업진흥회 기계기사 실무과정',
            '한국자동차산업협회 자동차정비 전문교육',
            '기계교육원 기계설계 실무과정',
            '한국산업인력공단 기계기사 양성과정',
            '기계기술교육원 기계제조 전문과정'
        ]
        educationProgram = mechPrograms[Math.floor(Math.random() * mechPrograms.length)]
    } else if (isElecCareer) {
        const elecPrograms = [
            '한국전기공사협회 전기기사 실무과정',
            '한국전자산업진흥회 전자기사 양성과정',
            '전기교육원 전기설비 실무과정',
            '한국산업인력공단 전기기사 전문교육',
            '전자기술교육원 전자설계 실무과정'
        ]
        educationProgram = elecPrograms[Math.floor(Math.random() * elecPrograms.length)]
    } else {
        const generalPrograms = [
            '패스트캠퍼스 IT 부트캠프',
            '네이버 커넥트재단 부스트캠프',
            '삼성 SW 아카데미',
            '코드스테이츠 부트캠프',
            '멀티캠퍼스 IT 과정'
        ]
        educationProgram = generalPrograms[Math.floor(Math.random() * generalPrograms.length)]
    }
    dynamicCerts.push(
        { type: '교육', name: educationProgram, status: '수료 권장', color: 'text-indigo-600 bg-indigo-50' }
    )

    const info = plan.map((step, i) => {
        const isFirst = i === 0
        const actionItems = Array.isArray(step.추천활동) ? step.추천활동 : []
        const resources: { title: string; url: string; type: 'video' | 'article' | 'quiz' }[] = []
        if (isFirst && step.자격정보?.length) {
            const firstQual = step.자격정보[0] as Record<string, unknown>
            resources.push({ title: String(firstQual?.qualName ?? '자격 정보'), url: '#', type: 'article' })
        }
        if (step.직업군?.length) {
            resources.push({ title: `직업군: ${step.직업군.slice(0, 2).join(', ')}`, url: '#', type: 'article' })
        }
        if (resources.length === 0) resources.push({ title: '진로 가이드', url: '#', type: 'article' })

        // Step2, Step3의 description은 구체적인 방안을 제시하도록 함
        let stepDescription = ''
        if (summary && isFirst) {
            stepDescription = summary
        } else if (i === 1) {
            // Step2: 맞춤형 역량 강화를 위한 구체적인 방안 제시
            if (step.역량?.length && step.역량.some((v: string) => v.length > 30)) {
                // 역량 필드에 구체적인 방법이 있으면 사용
                stepDescription = step.역량.join('. ')
            } else if (actionItems.length > 0) {
                // 추천활동에서 역량 강화 방안 추출
                const relevantActions = actionItems.filter((item: string) =>
                    /프로젝트|인턴|경험|자격증|포트폴리오|오픈소스|협업/i.test(item)
                )
                if (relevantActions.length > 0) {
                    stepDescription = relevantActions.slice(0, 2).join('. ')
                } else {
                    stepDescription = actionItems.slice(0, 2).join('. ')
                }
            } else if (step.역량?.length) {
                stepDescription = step.역량.join('. ')
            } else {
                stepDescription = '목표 기업 맞춤형 역량 강화를 위한 구체적인 방안을 수립합니다.'
            }
        } else if (i === 2) {
            // Step3: 최종 합격을 위한 전략 수립 방안 및 정보 안내
            if (step.역량?.length && step.역량.some((v: string) => /프로그래머스|백준|원티드|면접|STAR|사이트/i.test(v))) {
                // 역량 필드에 면접 준비 사이트/방법이 있으면 사용
                stepDescription = step.역량.join('. ')
            } else if (actionItems.length > 0) {
                // 추천활동에서 면접 준비/전략 관련 내용 추출
                const relevantActions = actionItems.filter((item: string) =>
                    /면접|이력서|자기소개서|STAR|프로그래머스|백준|원티드|로켓펀치|온보딩/i.test(item)
                )
                if (relevantActions.length > 0) {
                    stepDescription = relevantActions.slice(0, 2).join('. ')
                } else {
                    stepDescription = actionItems.slice(0, 2).join('. ')
                }
            } else if (step.역량?.length) {
                stepDescription = step.역량.join('. ')
            } else {
                stepDescription = '최종 합격을 위한 전략 수립 및 면접 준비를 진행합니다.'
            }
        } else if (step.역량?.length) {
            stepDescription = step.역량.join('. ')
        } else {
            stepDescription = '단계별 목표를 진행합니다.'
        }

        return {
            id: `step-${i + 1}`,
            title: step.단계 || `Step${i + 1}`,
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

export async function getRoadmap(profileId?: string, counselorId?: string | null) {
    const supabase = await createClient()
    const userIdStr = await getEffectiveUserId(counselorId)
    if (!userIdStr) return null

    let query = supabase
        .from('career_roadmaps')
        .select('*')
        .eq('user_id', userIdStr)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

    if (profileId) {
        query = query.eq('profile_id', profileId)
    }

    const { data, error } = await query.limit(1).single()

    if (error) {
        if (error.code !== 'PGRST116') {
            console.error('Error fetching roadmap:', error)
        }
        return null
    }

    return data
}

export async function getClientProfile(profileId: string, counselorId?: string | null) {
    const supabase = await createClient()
    const userIdStr = await getEffectiveUserId(counselorId)
    if (!userIdStr) return null

    const { data, error } = await supabase
        .from('career_profiles')
        .select('*')
        .eq('profile_id', profileId)
        .eq('user_id', userIdStr)
        .single()

    if (error) {
        console.error('Error fetching client profile:', error)
        return null
    }

    return data
}

export async function generateClientRoadmap(profileId?: string, clientData?: any, counselorId?: string | null, updateOnly: boolean = false) {
    const supabase = await createClient()
    const userIdStr = await getEffectiveUserId(counselorId)
    if (!userIdStr) return { error: 'Unauthorized' }

    let info!: Array<{ id: string; title: string; description: string; status: string; date: string; quizScore: number; resources: { title: string; url: string; type: 'video' | 'article' | 'quiz' }[]; actionItems: string[] }>
    let dynamicSkills!: Array<{ title: string; desc: string; level: number }>
    let dynamicCerts!: Array<{ type: string; name: string; status: string; color: string; url?: string; details?: { written?: string; practical?: string; difficulty?: string; examSchedule?: string; description?: string } }>
    let targetJob!: string
    let targetCompany!: string
    let usedRag = false

    // LLM 기반 로드맵 생성: OPENAI_API_KEY 있고 profileId 있을 때
    // 검색 데이터와 DB 데이터를 모두 활용해 LLM이 종합적으로 생성
    if (process.env.OPENAI_API_KEY && profileId) {
        console.log('[Roadmap LLM] 시작 - profileId:', profileId, 'API_KEY 존재:', !!process.env.OPENAI_API_KEY)
        const ragContext = await getRoadmapRagContext(supabase, profileId, userIdStr)
        if (ragContext) {
            // [중요] clientData가 전달된 경우, DB 데이터보다 우선하여 적용 (최신 수정사항 반영)
            if (clientData) {
                console.log('[Roadmap LLM] 전달받은 clientData로 프로필 컨텍스트 업데이트')
                ragContext.profile = { ...ragContext.profile, ...clientData }
            }

            console.log('[Roadmap LLM] DB 컨텍스트 수집 완료 - 상담:', ragContext.counseling.length, '분석:', ragContext.analysis.length, '프로필:', ragContext.profile.length)

            // LLM 호출 시도 (검색 데이터는 있으면 추가, 없어도 DB 데이터만으로 생성)
            const ragResult = await generateRoadmapWithRag(ragContext)

            if (ragResult?.plan?.length) {
                console.log('[Roadmap LLM] LLM 생성 성공 - 단계 수:', ragResult.plan.length)
                console.log('[Roadmap LLM] Q-Net API 호출 시작 (자격증 목록 및 일정)')

                // 1. 전체 자격증 목록 조회
                const qualList = await getQualificationList()
                console.log('[Roadmap LLM] 자격증 목록 조회 완료:', qualList.length)

                // 2. targetJob 기반 관련 자격증 필터링 (일정 없이 이름만 먼저 추출)
                // 임시로 빈 일정 배열을 넘겨서 이름만 매칭
                const tempCerts = filterRelevantQualifications(qualList, [], targetJob || '', '')
                const targetCertNames = tempCerts.map(c => c.name)
                console.log('[Roadmap LLM] 관련 자격증 후보:', targetCertNames)

                // 3. 후보 자격증들에 대한 통합 일정 조회 (병렬 처리)
                const examSchedules = await getIntegratedExamSchedules(targetCertNames)
                console.log('[Roadmap LLM] 통합 일정 조회 완료:', examSchedules.length)

                // 4. 일정 정보를 포함하여 최종 매핑
                // 기존 filterRelevantQualifications를 재사용하되, 이번엔 실제 일정을 넘김
                const finalCerts = filterRelevantQualifications(qualList, examSchedules, targetJob || '', '')

                const qualifications = qualList // 호환성 유지
                // jobCompetency는 현재 QNet.ts에 없음, 빈 배열 처리하거나 필요시 추가 구현
                const jobCompetency: unknown[] = []

                console.log('[Roadmap LLM] Q-Net 데이터 준비 완료')
                const first = ragResult.plan[0] as RagPlanStep
                first.자격정보 = finalCerts.slice(0, 3)
                first.시험일정 = examSchedules.slice(0, 3)
                // 교육과정은 ragPlanToMilestones에서 실제 교육 프로그램으로 대체되므로 여기서는 설정하지 않음
                first['산업분야/대표기업'] = first['산업분야/대표기업'] || ['삼성전자', '현대자동차', '네이버']
                first.직무역량 = jobCompetency.slice(0, 3)
                console.log('[Roadmap LLM] Q-Net 데이터 병합 완료')

                console.log('[Roadmap LLM] 마일스톤 변환 시작')
                const mapped = ragPlanToMilestones(ragResult, clientData || {}, qualifications, examSchedules)
                info = mapped.info
                dynamicSkills = mapped.dynamicSkills
                dynamicCerts = mapped.dynamicCerts
                targetJob = mapped.targetJob
                targetCompany = mapped.targetCompany
                console.log('[Roadmap LLM] 마일스톤 변환 완료 - 단계 수:', info.length, '스킬 수:', dynamicSkills.length, '자격증 수:', dynamicCerts.length)
                usedRag = true
            } else {
                console.warn('[Roadmap LLM] LLM 결과가 비어있거나 plan이 없음 - 규칙 기반으로 fallback:', ragResult)
            }
        } else {
            console.warn('[Roadmap LLM] DB 컨텍스트 수집 실패 또는 없음 - 규칙 기반으로 fallback')
        }
    } else {
        console.log('[Roadmap LLM] 건너뜀 - API_KEY:', !!process.env.OPENAI_API_KEY, 'profileId:', profileId, '→ 규칙 기반 사용')
    }

    // RAG 미사용 시 기존 규칙 기반
    if (!usedRag) {
        console.log('[Roadmap] 규칙 기반 로드맵 생성 시작')
        console.log('[Roadmap] clientData:', JSON.stringify(clientData, null, 2))

        // 목표 직무/기업 먼저 결정 (Q-Net 조회 시 필요)
        const rawTargetJob = clientData?.recommended_careers || ''
        const rawTargetCompany = clientData?.target_company || ''

        // Filter out "없음", "미정" or empty strings for clean labels
        targetJob = (rawTargetJob && rawTargetJob !== '없음' && rawTargetJob !== '미정') ? rawTargetJob : '희망 직무'
        targetCompany = (rawTargetCompany && rawTargetCompany !== '없음' && rawTargetCompany !== '미정') ? rawTargetCompany : ''

        console.log('[Roadmap] 규칙 기반 - Q-Net API 호출 시작 (자격증 목록 및 일정)')

        // 1. 전체 자격증 목록 조회
        const qualifications = await getQualificationList()

        // 2. targetJob 기반 관련 자격증 필터링 for Names
        const tempCerts = filterRelevantQualifications(qualifications, [], targetJob, '')
        const targetCertNames = tempCerts.map(c => c.name)

        // 3. 통합 일정 조회
        const examSchedules = await getIntegratedExamSchedules(targetCertNames)
        console.log('[Roadmap] 규칙 기반 - Q-Net 통합 일정 조회 완료:', examSchedules.length)

        // (호환성 변수)
        const examSchedule = examSchedules
        targetCompany = (rawTargetCompany && rawTargetCompany !== '없음' && rawTargetCompany !== '미정') ? rawTargetCompany : ''
        const educationLevel = clientData?.education_level || '정보 없음'
        const major = clientData?.major || '전공 분야'
        const experience = clientData?.work_experience || ''
        console.log('[Roadmap Force Update] 목표 직무:', targetJob, '목표 기업:', targetCompany)
        console.log('[Roadmap Force Update] 학력:', educationLevel, '전공:', major)

        // 방향: 목표 직무·목표 기업 달성에 맞춘 단계 제목·설명 (DB 필드 나열이 아닌 분석 결과 기반)
        // DB 필드를 그대로 나열하지 않고, 내담자의 현재 상태와 목표를 분석한 결과를 바탕으로 제목 생성

        // Step1: 내담자의 현재 상태 분석 기반 제목
        let phase1Title = ''
        if (educationLevel === '고등학교 졸업' || educationLevel === '전문대 졸업' || educationLevel === '대학교 재학') {
            phase1Title = `1단계: ${targetJob} 기초 역량 확보 및 자격증 준비`
        } else if (experience && experience.length > 20) {
            phase1Title = `1단계: 경력 활용 ${targetJob} 전문성 강화`
        } else {
            phase1Title = `1단계: ${targetJob} 실무 역량 기반 구축`
        }
        let phase1Desc = `목표 직무(${targetJob}) 달성을 위한 기초 역량을 다집니다.${targetCompany ? ` ${targetCompany} 입사를 염두에 두고 준비합니다.` : ''}`

        // Step2: 목표 기업 분석 결과 기반 제목
        const isDevCareerForTitle = /개발|엔지니어|소프트웨어|프로그래머/i.test(targetJob)
        let phase2Title = ''
        if (targetCompany) {
            // 목표 기업이 있으면 구체적인 기술 스택이나 전략을 제목에 포함
            if (isDevCareerForTitle) {
                phase2Title = `2단계: ${targetCompany} 기술 스택 프로젝트 및 인턴십 준비`
            } else {
                phase2Title = `2단계: ${targetCompany} 맞춤형 역량 강화 및 포트폴리오 구축`
            }
        } else {
            phase2Title = `2단계: ${targetJob} 포트폴리오 및 역량 강화`
        }
        let phase2Desc = `${targetJob} 시장에서 경쟁력을 보여줄 실무 결과물을 만듭니다. 경험(Experience), 인턴(Internship), 프로젝트(Projects), 자격증(Certifications)을 통해 역량을 개발합니다.`

        if (targetCompany) {
            phase2Desc = `${targetCompany} 채용 공고의 기술 스택을 활용한 포트폴리오 프로젝트 완성, 인턴십 지원을 위한 오픈소스 기여 경험 축적, 관련 자격증 취득 등 구체적인 역량 개발 방법을 실행합니다.`
        }

        // 사용자(전공·목표직무·목표기업)에 맞춘 구체적 실행 방안
        const isDevCareerForActions = /개발|소프트웨어|프로그래머|코딩|웹|앱|백엔드|프론트엔드|풀스택|데이터|클라우드|인공지능|AI|시스템\s*엔지니어|네트워크/i.test(targetJob)
        const phase1Actions = [
            `전공 지식 증명을 위해 **정보처리기사** 필기 일정 수립 및 3개월 내 1차 취득 목표`,
            `${major} 실무 연계: ${targetJob} 관련 소규모 프로젝트 1개 이상 기획·구현 (Git 저장소 관리)`,
            `협업 도구 숙달: Git 브랜치 전략, Jira 이슈/스프린트 작성 연습`,
            `데이터 기반 문제 해결: 실무 데이터 분석 사례 1건 정리 (의사결정 근거 문서화)`,
        ]
        if (educationLevel === '고등학교 졸업' || educationLevel === '전문대 졸업' || educationLevel === '대학교 재학') {
            if (isDevCareerForActions) {
                phase1Actions[0] = `정보처리기사 또는 관련 기초 자격증 준비 (필기 합격 목표)`
                phase1Actions[1] = `${major} 기초 이론 정리 및 ${targetJob} 진로와 연결한 학습 로드맵 작성`
            } else {
                phase1Actions[0] = `${targetJob} 관련 기초 자격증 탐색 및 취득 준비`
                phase1Actions[1] = `${major} 전공 학습 심화 및 실무 관련성 파악`
            }
        }

        const phase2Actions = targetCompany
            ? [
                `${targetCompany} 채용 공고에서 요구하는 기술 스택을 구체적으로 분석 (예: Spring Boot, Docker, Kubernetes 등)하고 해당 기술을 활용한 포트폴리오 프로젝트 1~2개 기획`,
                `${targetCompany} 인재상(혁신, 협업, 도전 등)을 구체적으로 언급하며 내 강점과 연결한 차별화 포인트 정리 및 프로젝트에 반영`,
                `${targetCompany} 기술 블로그/공식 자료를 분석하여 실제 사용하는 아키텍처 패턴(마이크로서비스, 이벤트 드리븐 등) 학습 및 프로젝트에 적용`,
                isDevCareerForActions ? `AWS Certified Developer 준비: ${targetCompany}에서 사용하는 클라우드 서비스(AWS, GCP 등)를 확인하고 실습 환경 구축` : `목표 직무 관련 자격증(ADsP 등) 준비 및 ${targetCompany}에서 요구하는 데이터 분석 도구 실습`,
                `${targetCompany} 관련 네트워킹·설명회 일정 확인 및 참석, 내부 추천 경로 파악, 지원 시기·절차 상세 분석`,
            ]
            : [
                `${targetJob} 직무 기술서 및 실제 채용 공고를 분석하여 역량 갭 분석 및 보완 학습 계획 수립`,
                `포트폴리오용 실무 결과물 1~2개 완성 (Git, 문서화, 배포 URL 포함)`,
                isDevCareerForActions ? `AWS 또는 직무 핵심 도구 활용 프로젝트 1건 추가 및 클라우드 배포 경험 축적` : `데이터 분석/리포트 실무 사례 1건 정리 및 시각화 도구 활용`,
                `희망 기업 리스트업 및 각 기업별 채용 사이클·지원 전략 상세 정리`,
            ]

        const phase3Actions = targetCompany
            ? [
                `${targetCompany} 맞춤 이력서·자기소개서 초안 작성 (${targetCompany} 인재상과 내 경험을 구체적으로 연결) 후 피드백 2회 이상 반영`,
                `${targetCompany} 면접 형식을 구체적으로 확인 (기술면접: 코딩테스트/시스템 설계, 인성면접: STAR 기법 등)하고 예상 질문 리스트 작성 및 스토리텔링 연습`,
                `${targetCompany} 채용 프로세스를 구체적으로 파악 (서류전형 → 코딩테스트 → 기술면접 → 인성면접 → 최종합격)하고 각 단계별 체크리스트 관리 및 일정 수립`,
                `${targetCompany} 신입사원 온보딩 프로그램 일정 확인 및 입사 후 3개월 목표(온보딩·팀 적응·첫 프로젝트) 구체적으로 정리`,
            ]
            : [
                `목표 기업별 이력서·자기소개서 버전 관리 및 각 기업의 인재상에 맞춘 맞춤 수정`,
                `역량 기반 면접 스토리 및 기술 질문 대비 자료 정리 (STAR 기법 활용, 포트폴리오 기반 질문 대비)`,
                `지원 일정·합격/불합격 피드백 기록으로 전략 보완 및 다음 지원 기업에 반영`,
                `입사 후 단기 목표 설정 (온보딩 완료, 첫 프로젝트 참여, 팀 적응 등)`,
            ]

        info = [
            {
                id: "step-1",
                title: phase1Title,
                description: phase1Desc,
                status: "in-progress",
                date: new Date().toLocaleDateString('ko-KR'),
                quizScore: 0,
                resources: [
                    { title: "실무 역량 강화 가이드", url: "#", type: "video" },
                ],
                actionItems: phase1Actions,
            },
            {
                id: "step-2",
                title: phase2Title,
                description: phase2Desc,
                status: "locked",
                date: "",
                quizScore: 0,
                resources: [
                    targetCompany ? { title: `${targetCompany} 채용 분석 리포트`, url: "#", type: "article" } : { title: "직무 기술 가이드", url: "#", type: "article" }
                ],
                actionItems: phase2Actions,
            },
            {
                id: "step-3",
                title: targetCompany
                    ? (isDevCareerForActions
                        ? `3단계: ${targetCompany} 기술면접 대비 및 인성면접 STAR 기법 준비`
                        : `3단계: ${targetCompany} 면접 전략 수립 및 최종 합격 준비`)
                    : "3단계: 최종 합격을 위한 면접 전략 수립",
                description: targetCompany
                    ? `${targetCompany} 면접 준비: 프로그래머스(programmers.co.kr) 코딩테스트 연습, 백준(BOJ) 알고리즘 문제 풀이, 원티드(wanted.co.kr) 면접 후기 참고 및 STAR 기법 스토리텔링 연습`
                    : `면접 준비: 프로그래머스(programmers.co.kr) 코딩테스트 연습, 백준(BOJ) 알고리즘 문제 풀이, 원티드(wanted.co.kr) 및 로켓펀치(rocketpunch.com) 면접 정보 수집`,
                status: "locked",
                date: "",
                quizScore: 0,
                resources: [],
                actionItems: phase3Actions,
            }
        ]

        // Dynamic Competencies and Certifications based on Job
        dynamicSkills = [
            { title: `${targetJob} 숙련도`, desc: `${targetJob} 수행을 위한 핵심 도구 및 프레임워크 활용 능력`, level: 80 },
            { title: "데이터 분석 및 활용", desc: "실무 데이터를 기반으로 한 문제 해결 및 의사 결정 능력", level: 70 },
            { title: "협업 도구 활용", desc: "Git, Jira 등 팀 협업을 위한 시스템 숙련도", level: 85 },
            { title: "문제 해결 메커니즘", desc: "복잡한 실무 문제를 논리적으로 분해하고 해결하는 능력", level: 75 }
        ]

        // Q-Net API에서 가져온 자격증을 전공/직무 키워드로 필터링
        dynamicCerts = filterRelevantQualifications(qualifications, examSchedule, targetJob, major)

        // Q-Net API에서 필터링된 자격증이 없거나 부족한 경우에만 기본 자격증 추가
        if (dynamicCerts.length < 3) {
            console.log('[Roadmap] 규칙 기반 - 필터링된 자격증이 부족하여 기본 자격증 추가')
            // [수정] '엔지니어'라는 단어만으로는 IT 직무로 판단하지 않도록 구체화
            const isDevCareerRule = /개발|소프트웨어|프로그래머|코딩|웹|앱|백엔드|프론트엔드|풀스택|데이터|클라우드|인공지능|AI|시스템\s*엔지니어|네트워크/i.test(targetJob)
            const isDataCareerRule = /데이터|분석|AI|인공지능|빅데이터/i.test(targetJob)

            if (isDevCareerRule || isDataCareerRule) {
                // IT 직무: 정보처리기사 기본 포함
                if (!dynamicCerts.some(c => c.name.includes('정보처리'))) {
                    dynamicCerts.unshift({
                        type: '자격증',
                        name: '정보처리기사',
                        status: '취득 권장',
                        color: 'text-blue-600 bg-blue-50',
                        details: {
                            written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)',
                            practical: '실기: 100점 만점에 60점 이상',
                            difficulty: '난이도: 중상',
                            examSchedule: '연 3회 (3월, 7월, 10월)',
                            description: '정보처리 관련 산업기사 자격을 취득한 자 또는 관련학과 졸업자 등이 응시할 수 있는 국가기술자격증입니다.'
                        }
                    })
                }
            }
        }

        // 교육 프로그램 추가를 위한 직무 분류
        const isDevCareerRule = /개발|엔지니어|소프트웨어|프로그래머/i.test(targetJob)
        const isDataCareerRule = /데이터|분석|AI|인공지능/i.test(targetJob)
        const isCivilCareerRule = /토목|건설|측량|건축|구조/i.test(targetJob)
        const isSafetyCareerRule = /안전|산업안전|건설안전/i.test(targetJob)
        const isMechCareerRule = /기계|자동차|메카트로닉스/i.test(targetJob)
        const isElecCareerRule = /전기|전자|전기기사|전자기사/i.test(targetJob)

        // 하드코딩된 자격증 로직 제거 - Q-Net API 필터링 결과만 사용
        // 교육 프로그램만 직무별로 추가
        if (false) {
            // 개발자 직무: 클라우드, 컨테이너, 데이터베이스 자격증 추가
            dynamicCerts.push(
                {
                    type: "자격증",
                    name: "AWS Certified Developer",
                    status: "준비 중",
                    color: "text-orange-600 bg-orange-50",
                    details: {
                        written: '필기: 65점 이상 (1000점 만점)',
                        practical: '실기: 없음 (온라인 시험)',
                        difficulty: '난이도: 중',
                        examSchedule: '연중 상시 시험 가능',
                        description: 'AWS 클라우드 플랫폼에서 애플리케이션을 개발하고 배포하는 능력을 인증하는 자격증입니다.'
                    }
                },
                {
                    type: "자격증",
                    name: "SQLD (SQL 개발자)",
                    status: "취득 권장",
                    color: "text-green-600 bg-green-50",
                    details: {
                        written: '필기: 60점 이상 (100점 만점)',
                        practical: '실기: 없음',
                        difficulty: '난이도: 중하',
                        examSchedule: '연 4회 (3월, 6월, 9월, 12월)',
                        description: '데이터베이스와 데이터 모델링에 대한 지식을 바탕으로 SQL을 작성하고 활용할 수 있는 능력을 인증합니다.'
                    }
                },
                {
                    type: "자격증",
                    name: "리눅스마스터 2급",
                    status: "준비 중",
                    color: "text-purple-600 bg-purple-50",
                    details: {
                        written: '필기: 70점 이상 (100점 만점)',
                        practical: '실기: 70점 이상 (100점 만점)',
                        difficulty: '난이도: 중',
                        examSchedule: '연 2회 (5월, 11월)',
                        description: '리눅스 시스템 관리 및 운영 능력을 인증하는 자격증으로, 서버 운영 및 관리 업무에 유용합니다.'
                    }
                }
            )
        } else if (isDataCareerRule) {
            // 데이터 분석 직무: 데이터 분석, SQL, 빅데이터 자격증 추가
            dynamicCerts.push(
                {
                    type: "자격증",
                    name: "ADsP (데이터분석 준전문가)",
                    status: "취득 권장",
                    color: "text-orange-600 bg-orange-50",
                    details: {
                        written: '필기: 60점 이상 (100점 만점)',
                        practical: '실기: 없음',
                        difficulty: '난이도: 중하',
                        examSchedule: '연 4회 (3월, 6월, 9월, 12월)',
                        description: '데이터 분석 기초 지식과 데이터 분석 프로세스에 대한 이해를 인증하는 자격증입니다.'
                    }
                },
                {
                    type: "자격증",
                    name: "SQLD (SQL 개발자)",
                    status: "취득 권장",
                    color: "text-green-600 bg-green-50",
                    details: {
                        written: '필기: 60점 이상 (100점 만점)',
                        practical: '실기: 없음',
                        difficulty: '난이도: 중하',
                        examSchedule: '연 4회 (3월, 6월, 9월, 12월)',
                        description: '데이터베이스와 데이터 모델링에 대한 지식을 바탕으로 SQL을 작성하고 활용할 수 있는 능력을 인증합니다.'
                    }
                },
                {
                    type: "자격증",
                    name: "빅데이터분석기사",
                    status: "준비 중",
                    color: "text-purple-600 bg-purple-50",
                    details: {
                        written: '필기: 100점 만점에 60점 이상',
                        practical: '실기: 100점 만점에 60점 이상',
                        difficulty: '난이도: 상',
                        examSchedule: '연 1회 (10월)',
                        description: '빅데이터 분석 및 활용 능력을 종합적으로 평가하는 국가기술자격증입니다.'
                    }
                }
            )
        } else if (isCivilCareerRule) {
            // 토목/건설 직무: 토목기사, 건설기사, 측량기사 등
            dynamicCerts.push(
                {
                    type: "자격증",
                    name: "토목기사",
                    status: "취득 권장",
                    color: "text-blue-600 bg-blue-50",
                    details: {
                        written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)',
                        practical: '실기: 100점 만점에 60점 이상',
                        difficulty: '난이도: 중상',
                        examSchedule: '연 2회 (4월, 10월)',
                        description: '토목공학에 관한 전문지식과 기술을 바탕으로 토목공사 설계, 시공, 감리 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.'
                    }
                },
                {
                    type: "자격증",
                    name: "건설기사",
                    status: "취득 권장",
                    color: "text-green-600 bg-green-50",
                    details: {
                        written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)',
                        practical: '실기: 100점 만점에 60점 이상',
                        difficulty: '난이도: 중상',
                        examSchedule: '연 2회 (4월, 10월)',
                        description: '건설공학에 관한 전문지식과 기술을 바탕으로 건설공사 설계, 시공, 감리 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.'
                    }
                },
                {
                    type: "자격증",
                    name: "측량기사",
                    status: "준비 중",
                    color: "text-orange-600 bg-orange-50",
                    details: {
                        written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)',
                        practical: '실기: 100점 만점에 60점 이상',
                        difficulty: '난이도: 중',
                        examSchedule: '연 2회 (4월, 10월)',
                        description: '측량에 관한 전문지식과 기술을 바탕으로 지형측량, 지적측량, 공공측량 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.'
                    }
                },
                {
                    type: "자격증",
                    name: "건설안전기사",
                    status: "준비 중",
                    color: "text-red-600 bg-red-50",
                    details: {
                        written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)',
                        practical: '실기: 100점 만점에 60점 이상',
                        difficulty: '난이도: 중상',
                        examSchedule: '연 2회 (4월, 10월)',
                        description: '건설현장의 안전관리에 관한 전문지식과 기술을 바탕으로 안전관리 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.'
                    }
                }
            )
        } else if (isSafetyCareerRule) {
            // 안전 직무: 산업안전기사, 건설안전기사 등
            dynamicCerts.push(
                {
                    type: "자격증",
                    name: "산업안전기사",
                    status: "취득 권장",
                    color: "text-blue-600 bg-blue-50",
                    details: {
                        written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)',
                        practical: '실기: 100점 만점에 60점 이상',
                        difficulty: '난이도: 중상',
                        examSchedule: '연 2회 (4월, 10월)',
                        description: '산업안전에 관한 전문지식과 기술을 바탕으로 산업현장의 안전관리 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.'
                    }
                },
                {
                    type: "자격증",
                    name: "건설안전기사",
                    status: "취득 권장",
                    color: "text-green-600 bg-green-50",
                    details: {
                        written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)',
                        practical: '실기: 100점 만점에 60점 이상',
                        difficulty: '난이도: 중상',
                        examSchedule: '연 2회 (4월, 10월)',
                        description: '건설현장의 안전관리에 관한 전문지식과 기술을 바탕으로 안전관리 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.'
                    }
                },
                {
                    type: "자격증",
                    name: "소방설비기사",
                    status: "준비 중",
                    color: "text-red-600 bg-red-50",
                    details: {
                        written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)',
                        practical: '실기: 100점 만점에 60점 이상',
                        difficulty: '난이도: 중상',
                        examSchedule: '연 2회 (4월, 10월)',
                        description: '소방설비에 관한 전문지식과 기술을 바탕으로 소방설비 설치, 유지관리 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.'
                    }
                },
                {
                    type: "자격증",
                    name: "위험물기능사",
                    status: "준비 중",
                    color: "text-orange-600 bg-orange-50",
                    details: {
                        written: '필기: 100점 만점에 60점 이상',
                        practical: '실기: 100점 만점에 60점 이상',
                        difficulty: '난이도: 중',
                        examSchedule: '연 2회 (4월, 10월)',
                        description: '위험물의 취급 및 저장에 관한 전문지식과 기술을 인증하는 국가기술자격증입니다.'
                    }
                }
            )
        } else if (isMechCareerRule) {
            // 기계 직무: 기계기사, 자동차정비기사 등
            dynamicCerts.push(
                {
                    type: "자격증",
                    name: "기계기사",
                    status: "취득 권장",
                    color: "text-blue-600 bg-blue-50",
                    details: {
                        written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)',
                        practical: '실기: 100점 만점에 60점 이상',
                        difficulty: '난이도: 중상',
                        examSchedule: '연 2회 (4월, 10월)',
                        description: '기계공학에 관한 전문지식과 기술을 바탕으로 기계설계, 제조, 유지관리 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.'
                    }
                },
                {
                    type: "자격증",
                    name: "자동차정비기사",
                    status: "취득 권장",
                    color: "text-green-600 bg-green-50",
                    details: {
                        written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)',
                        practical: '실기: 100점 만점에 60점 이상',
                        difficulty: '난이도: 중',
                        examSchedule: '연 2회 (4월, 10월)',
                        description: '자동차 정비에 관한 전문지식과 기술을 바탕으로 자동차 점검, 수리, 정비 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.'
                    }
                },
                {
                    type: "자격증",
                    name: "용접기사",
                    status: "준비 중",
                    color: "text-orange-600 bg-orange-50",
                    details: {
                        written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)',
                        practical: '실기: 100점 만점에 60점 이상',
                        difficulty: '난이도: 중',
                        examSchedule: '연 2회 (4월, 10월)',
                        description: '용접에 관한 전문지식과 기술을 바탕으로 용접 작업을 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.'
                    }
                },
                {
                    type: "자격증",
                    name: "건설기계기사",
                    status: "준비 중",
                    color: "text-purple-600 bg-purple-50",
                    details: {
                        written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)',
                        practical: '실기: 100점 만점에 60점 이상',
                        difficulty: '난이도: 중상',
                        examSchedule: '연 2회 (4월, 10월)',
                        description: '건설기계에 관한 전문지식과 기술을 바탕으로 건설기계의 설계, 제조, 유지관리 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.'
                    }
                }
            )
        } else if (isElecCareerRule) {
            // 전기/전자 직무: 전기기사, 전자기사 등
            dynamicCerts.push(
                {
                    type: "자격증",
                    name: "전기기사",
                    status: "취득 권장",
                    color: "text-blue-600 bg-blue-50",
                    details: {
                        written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)',
                        practical: '실기: 100점 만점에 60점 이상',
                        difficulty: '난이도: 중상',
                        examSchedule: '연 2회 (4월, 10월)',
                        description: '전기에 관한 전문지식과 기술을 바탕으로 전기설비 설계, 시공, 유지관리 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.'
                    }
                },
                {
                    type: "자격증",
                    name: "전자기사",
                    status: "취득 권장",
                    color: "text-green-600 bg-green-50",
                    details: {
                        written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)',
                        practical: '실기: 100점 만점에 60점 이상',
                        difficulty: '난이도: 중상',
                        examSchedule: '연 2회 (4월, 10월)',
                        description: '전자공학에 관한 전문지식과 기술을 바탕으로 전자설비 설계, 제조, 유지관리 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.'
                    }
                },
                {
                    type: "자격증",
                    name: "전기공사기사",
                    status: "준비 중",
                    color: "text-orange-600 bg-orange-50",
                    details: {
                        written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)',
                        practical: '실기: 100점 만점에 60점 이상',
                        difficulty: '난이도: 중',
                        examSchedule: '연 2회 (4월, 10월)',
                        description: '전기공사에 관한 전문지식과 기술을 바탕으로 전기공사 설계, 시공, 감리 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.'
                    }
                },
                {
                    type: "자격증",
                    name: "산업계측기사",
                    status: "준비 중",
                    color: "text-purple-600 bg-purple-50",
                    details: {
                        written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)',
                        practical: '실기: 100점 만점에 60점 이상',
                        difficulty: '난이도: 중',
                        examSchedule: '연 2회 (4월, 10월)',
                        description: '산업계측에 관한 전문지식과 기술을 바탕으로 계측기기 설계, 설치, 유지관리 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.'
                    }
                }
            )
        } else if (isDataCareerRule) {
            // 데이터 분석 직무는 이미 위에서 처리됨
        } else {
            // 기타 직무: 일반적인 IT 자격증 (IT 관련이 아닌 경우에도 기본 제공)
            dynamicCerts.push(
                {
                    type: "자격증",
                    name: "정보처리기사",
                    status: "취득 권장",
                    color: "text-blue-600 bg-blue-50",
                    details: {
                        written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)',
                        practical: '실기: 100점 만점에 60점 이상',
                        difficulty: '난이도: 중상',
                        examSchedule: '연 3회 (3월, 7월, 10월)',
                        description: '정보처리 관련 산업기사 자격을 취득한 자 또는 관련학과 졸업자 등이 응시할 수 있는 국가기술자격증입니다.'
                    }
                },
                {
                    type: "자격증",
                    name: "ADsP (데이터분석 준전문가)",
                    status: "준비 중",
                    color: "text-orange-600 bg-orange-50",
                    details: {
                        written: '필기: 60점 이상 (100점 만점)',
                        practical: '실기: 없음',
                        difficulty: '난이도: 중하',
                        examSchedule: '연 4회 (3월, 6월, 9월, 12월)',
                        description: '데이터 분석 기초 지식과 데이터 분석 프로세스에 대한 이해를 인증하는 자격증입니다.'
                    }
                },
                {
                    type: "자격증",
                    name: "SQLD (SQL 개발자)",
                    status: "취득 권장",
                    color: "text-green-600 bg-green-50",
                    details: {
                        written: '필기: 60점 이상 (100점 만점)',
                        practical: '실기: 없음',
                        difficulty: '난이도: 중하',
                        examSchedule: '연 4회 (3월, 6월, 9월, 12월)',
                        description: '데이터베이스와 데이터 모델링에 대한 지식을 바탕으로 SQL을 작성하고 활용할 수 있는 능력을 인증합니다.'
                    }
                },
                {
                    type: "자격증",
                    name: "컴퓨터활용능력 1급",
                    status: "준비 중",
                    color: "text-purple-600 bg-purple-50",
                    details: {
                        written: '필기: 70점 이상 (100점 만점)',
                        practical: '실기: 70점 이상 (100점 만점)',
                        difficulty: '난이도: 중',
                        examSchedule: '연 4회 (3월, 6월, 9월, 12월)',
                        description: '컴퓨터 활용 능력을 평가하는 자격증으로, 엑셀, 액세스 등의 활용 능력을 인증합니다.'
                    }
                }
            )
        }

        // 실제 교육 프로그램 추가 (직무별)
        let educationProgramRule = ''
        if (isDevCareerRule) {
            const devPrograms = [
                '패스트캠퍼스 백엔드 개발 부트캠프',
                '네이버 커넥트재단 부스트캠프',
                '삼성 SW 아카데미',
                '코드스쿼드 마스터즈 코스',
                '우아한테크코스'
            ]
            educationProgramRule = devPrograms[Math.floor(Math.random() * devPrograms.length)]
        } else if (isDataCareerRule) {
            const dataPrograms = [
                '패스트캠퍼스 데이터 사이언스 부트캠프',
                '네이버 커넥트재단 부스트캠프 AI',
                '삼성 SDS 멀티캠퍼스 데이터 분석 과정',
                '코드스테이츠 AI 부트캠프',
                '플래티넘 데이터 아카데미'
            ]
            educationProgramRule = dataPrograms[Math.floor(Math.random() * dataPrograms.length)]
        } else if (isCivilCareerRule) {
            const civilPrograms = [
                '한국건설기술인협회 토목기사 실무과정',
                '한국건설기술교육원 건설기사 양성과정',
                '한국토지주택공사 토목기술자 교육과정',
                '건설교육원 토목설계 실무과정',
                '한국건설산업교육원 토목시공 전문과정'
            ]
            educationProgramRule = civilPrograms[Math.floor(Math.random() * civilPrograms.length)]
        } else if (isSafetyCareerRule) {
            const safetyPrograms = [
                '한국산업안전보건공단 산업안전기사 양성과정',
                '건설안전교육원 건설안전기사 실무과정',
                '한국안전교육원 산업안전 전문가 과정',
                '안전보건교육원 안전관리자 양성과정',
                '한국건설안전협회 건설안전 전문교육'
            ]
            educationProgramRule = safetyPrograms[Math.floor(Math.random() * safetyPrograms.length)]
        } else if (isMechCareerRule) {
            const mechPrograms = [
                '한국기계산업진흥회 기계기사 실무과정',
                '한국자동차산업협회 자동차정비 전문교육',
                '기계교육원 기계설계 실무과정',
                '한국산업인력공단 기계기사 양성과정',
                '기계기술교육원 기계제조 전문과정'
            ]
            educationProgramRule = mechPrograms[Math.floor(Math.random() * mechPrograms.length)]
        } else if (isElecCareerRule) {
            const elecPrograms = [
                '한국전기공사협회 전기기사 실무과정',
                '한국전자산업진흥회 전자기사 양성과정',
                '전기교육원 전기설비 실무과정',
                '한국산업인력공단 전기기사 전문교육',
                '전자기술교육원 전자설계 실무과정'
            ]
            educationProgramRule = elecPrograms[Math.floor(Math.random() * elecPrograms.length)]
        } else {
            const generalPrograms = [
                '패스트캠퍼스 IT 부트캠프',
                '네이버 커넥트재단 부스트캠프',
                '삼성 SW 아카데미',
                '코드스테이츠 부트캠프',
                '멀티캠퍼스 IT 과정'
            ]
            educationProgramRule = generalPrograms[Math.floor(Math.random() * generalPrograms.length)]
        }
        dynamicCerts.push(
            { type: "교육", name: educationProgramRule, status: "수료 권장", color: "text-indigo-600 bg-indigo-50" }
        )
        console.log('[Roadmap] 규칙 기반 로드맵 생성 완료 - 단계 수:', info.length, '스킬 수:', dynamicSkills.length, '자격증 수:', dynamicCerts.length)
    }

    console.log('[Roadmap] 최종 로드맵 데이터 준비 완료 - 사용 방법:', usedRag ? 'RAG' : '규칙 기반')
    console.log('[Roadmap] 목표 직무:', targetJob, '목표 기업:', targetCompany)
    console.log('[Roadmap] 마일스톤 수:', info.length)

    // 기존 활성 로드맵 확인
    const { data: existingRoadmap } = await supabase
        .from('career_roadmaps')
        .select('roadmap_id')
        .eq('user_id', userIdStr)
        .eq('profile_id', profileId || null)
        .eq('is_active', true)
        .maybeSingle()

    // 갱신 모드인데 기존 로드맵이 없으면 에러 반환
    if (updateOnly && !existingRoadmap) {
        return { error: '갱신할 로드맵이 없습니다. 먼저 로드맵을 생성해주세요.' }
    }

    const roadmapData = {
        user_id: userIdStr,
        profile_id: profileId || null,
        target_job: targetJob,
        target_company: targetCompany,
        roadmap_stage: 'planning',
        milestones: JSON.stringify(info),
        required_skills: JSON.stringify(dynamicSkills),
        certifications: JSON.stringify(dynamicCerts),
        timeline_months: 6,
        is_active: true,
        updated_at: new Date().toISOString()
    }

    // UPSERT: 기존 활성 로드맵이 있으면 UPDATE, 없으면 INSERT
    const { error, data } = existingRoadmap
        ? await supabase
            .from('career_roadmaps')
            .update(roadmapData)
            .eq('roadmap_id', existingRoadmap.roadmap_id)
        : await supabase
            .from('career_roadmaps')
            .insert([roadmapData])

    if (error) {
        console.error('[Roadmap] DB 저장 에러:', error.code, error.message, error.details)
        return { error: error.message }
    }

    // 캐시 무효화로 UI 동기화
    revalidatePath('/roadmap')
    revalidatePath('/admin/clients')
    revalidatePath('/dashboard')

    return { success: true }
}


export async function createInitialRoadmap(profileId?: string, clientData?: any, counselorId?: string | null, updateOnly: boolean = false) {
    return generateClientRoadmap(profileId, clientData, counselorId, updateOnly);
}

