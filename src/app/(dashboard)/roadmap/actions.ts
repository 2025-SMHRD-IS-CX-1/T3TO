'use server'

import { createClient, getEffectiveUserId } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import OpenAI from 'openai'
import { getRoadmapModel } from '@/lib/ai-models'
import {
    getQualificationList,
    getExamSchedule,
    getJobCompetencyList,
} from '@/lib/qnet-api'
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

// --- LLM 진로 로드맵 생성 (RAG) ---
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
    if (!apiKey) return null

    const model = getRoadmapModel()
    const client = new OpenAI({ apiKey })

    const profile = (userData.profile?.[0] || {}) as Record<string, unknown>
    const targetJobFromProfile = (profile.recommended_careers ?? profile.target_job ?? '') as string
    const targetCompanyFromProfile = (profile.target_company ?? '') as string

    // 웹 검색으로 실제 데이터 수집 (환각 방지)
    let companyInfoText = ''
    let jobInfoText = ''

    if (targetCompanyFromProfile && targetCompanyFromProfile !== '없음' && targetCompanyFromProfile !== '미정') {
        const companies = targetCompanyFromProfile.split(/[,，、]/).map((c) => c.trim()).filter(Boolean)
        if (companies.length > 0) {
            const companyInfos = await searchCompanyInfo(companies)
            if (companyInfos.length > 0) {
                companyInfoText = `\n\n[목표 기업 실제 정보 (웹 검색 결과)]\n`
                companyInfos.forEach((info) => {
                    companyInfoText += `\n${info.companyName}:\n`
                    if (info.recruitmentInfo) companyInfoText += `- 채용 공고/인재상: ${info.recruitmentInfo.slice(0, 500)}\n`
                    if (info.techStack) companyInfoText += `- 기술 스택: ${info.techStack.slice(0, 500)}\n`
                    if (info.talentProfile) companyInfoText += `- 인재상/문화: ${info.talentProfile.slice(0, 500)}\n`
                })
            }
        }
    }

    if (targetJobFromProfile && targetJobFromProfile !== '없음' && targetJobFromProfile !== '미정') {
        const jobInfo = await searchJobInfo(targetJobFromProfile)
        if (jobInfo) {
            jobInfoText = `\n\n[목표 직무 실제 정보 (웹 검색 결과)]\n`
            if (jobInfo.requirements) jobInfoText += `- 채용 요구사항/역량: ${jobInfo.requirements.slice(0, 500)}\n`
            if (jobInfo.trends) jobInfoText += `- 최신 트렌드: ${jobInfo.trends.slice(0, 500)}\n`
            if (jobInfo.skills) jobInfoText += `- 필수 스킬/기술: ${jobInfo.skills.slice(0, 500)}\n`
        }
    }

    const systemPrompt = `너는 진로 상담 전문가야.
아래 데이터를 **종합 분석**해서 단계별 진로 로드맵을 작성해라.

[핵심 원칙]
- **DB 데이터(진로프로필, 상담내역, 분석결과)와 웹 검색 결과를 모두 참고**해서 종합적으로 로드맵을 작성해라.
- 진로프로필의 필드(전공, 학력, 경력, 연령대, 성향 등)를 그대로 나열하지 말고, 상담내역·분석결과와 함께 해석하여 내담자의 현재 상태와 강점을 파악해라.
- **웹 검색으로 가져온 실제 기업 채용 공고, 인재상, 기술 스택, 직무 요구사항 정보**를 활용해서 환각을 피하고 실제 시장 정보를 반영해라.
- **주요 목표**는 반드시 "내담자가 목표로 하는 직무(희망 직무)"와 "목표로 하는 기업(희망 기업)"으로 설정해라.
- 모든 단계(Step1~StepN)는 "그 목표 직무·목표 기업에 도달하기 위한 역량·활동"으로 방향을 잡아라.

[데이터 활용 방법]
1. **DB 데이터 활용**:
   - 진로프로필의 전공, 학력, 경력, 연령대를 바탕으로 내담자의 현재 역량 수준 파악
   - 상담내역과 분석결과에서 드러난 강점, 가치관, 관심사 반영
   - 내담자의 현재 상태에 맞는 단계별 난이도 조절

2. **웹 검색 결과 활용**:
   - 목표 직무의 실제 요구사항, 최신 트렌드, 필수 스킬 정보 반영
   - 목표 기업의 실제 채용 공고, 인재상, 기술 스택 정보 반영
   - 시장 동향과 실제 채용 요구사항에 맞춘 구체적 활동 제시

3. **종합**:
   - DB 데이터(내담자 현재 상태) + 웹 검색 결과(목표 달성 요구사항)를 결합
   - 내담자의 현재 역량 수준에서 목표까지의 갭을 분석하고, 단계별로 채워나가는 로드맵 작성

[단계별 구성]
- Step1 (단기 1~3개월): 목표 직무 달성을 위한 **기초 역량 다지기**
  - DB 데이터(전공, 학력)를 참고해 내담자의 현재 기초를 파악하고
  - 웹 검색 결과의 직무 요구사항·필수 스킬과 비교해 부족한 부분을 보완하는 활동 제시
  
- Step2 (중기 3~12개월): 목표 기업 맞춤형 **역량 강화**
  - DB 데이터(상담 분석 결과의 강점, 가치관)를 참고해 내담자의 차별화 포인트 파악하고
  - 웹 검색 결과의 기업 채용 공고·인재상·기술 스택을 반영해 맞춤 준비 활동 제시
  
- Step3 (장기 1년+): 목표 기업 **최종 합격 및 안착**
  - DB 데이터(경력, 성향)와 웹 검색 결과(실제 채용 프로세스)를 종합해
  - 면접 준비·온보딩을 고려한 활동 제시

[Constraints]
- 단계 제목과 추천활동은 목표 직무·목표 기업 달성을 위한 구체적 행동으로 작성.
- DB 데이터의 내담자 정보(전공, 학력, 경력, 강점)와 웹 검색 결과의 실제 정보를 모두 반영해라.
- 내담자의 현재 상태(DB)와 목표 달성 요구사항(웹 검색)의 갭을 고려해 현실적인 활동 제시.
- 추천활동은 목표 직무 역량 강화, 목표 기업 맞춤 준비에 초점.
- 직업군·역량은 목표 직무와 연결된 항목으로 제안.

[Output Format]
반드시 아래 JSON만 출력해라. 다른 설명 없이 JSON만.
{
  "summary": "목표 직무·목표 기업을 명시한 한 줄 요약 (예: OOO 직무 및 OOO 기업 입사를 목표로 ~)",
  "plan": [
    {
      "단계": "Step1 제목 (목표 직무 기초 역량 다지기 - DB 데이터와 웹 검색 결과 종합)",
      "추천활동": ["DB 데이터(전공/학력) 기반 + 웹 검색(요구사항) 반영한 구체적 활동1","활동2"],
      "직업군": ["목표와 연관 직업1","직업2"],
      "역량": ["목표 달성에 필요한 역량1","역량2"]
    },
    {
      "단계": "Step2 제목 (목표 기업 맞춤형 역량 강화 - DB 데이터와 웹 검색 결과 종합)",
      "추천활동": ["DB 데이터(강점/가치관) + 웹 검색(기업 정보) 기반 맞춤 활동1","활동2"],
      "직업군": ["목표와 연관 직업1","직업2"],
      "역량": ["목표 달성에 필요한 역량1","역량2"]
    },
    {
      "단계": "Step3 제목 (목표 기업 최종 합격 및 안착 - DB 데이터와 웹 검색 결과 종합)",
      "추천활동": ["DB 데이터(경력/성향) + 웹 검색(채용 프로세스) 반영한 활동1","활동2"],
      "직업군": ["목표와 연관 직업1","직업2"],
      "역량": ["목표 달성에 필요한 역량1","역량2"]
    }
  ]
}`

    const context = `[내담자 목표 (로드맵의 핵심 방향)]
- 목표 직무(희망 직무): ${targetJobFromProfile || '프로필·상담에서 추출'}
- 목표 기업(희망 기업): ${targetCompanyFromProfile || '프로필·상담에서 추출'}
위 목표 직무·기업을 달성하는 데 초점을 맞춰 단계를 구성해라.

[웹 검색 결과 - 실제 시장 정보 (환각 방지)]
${jobInfoText || '(목표 직무 웹 검색 결과 없음)'}

${companyInfoText || '(목표 기업 웹 검색 결과 없음)'}

[DB 데이터 - 내담자 현재 상태 및 상담 정보]
진로프로필 (전공, 학력, 경력, 연령대, 성향 등): ${JSON.stringify(userData.profile)}
상담내역: ${JSON.stringify(userData.counseling)}
상담내역 분석결과 (강점, 가치관, 관심사 등): ${JSON.stringify(userData.analysis)}
기존 로드맵: ${JSON.stringify(userData.roadmap)}

[작성 지침]
- 위 DB 데이터를 참고해 내담자의 현재 상태(전공, 학력, 경력, 강점, 가치관)를 파악하고
- 웹 검색 결과의 실제 시장 정보(직무 요구사항, 기업 채용 공고, 인재상, 기술 스택)를 활용해서
- 내담자의 현재 상태에서 목표까지의 갭을 분석하고, 단계별로 현실적인 로드맵을 작성해라.
- DB 데이터와 웹 검색 결과를 모두 종합해서 활용해라.`

    try {
        const res = await client.chat.completions.create({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: context },
            ],
            temperature: 0,
        })
        const text = res.choices[0]?.message?.content?.trim() || ''
        let jsonStr = text
        if (text.startsWith('```')) {
            const lines = text.split('\n')
            jsonStr = lines[0].includes('json') ? lines.slice(1, -1).join('\n') : text
        }
        return JSON.parse(jsonStr) as RagRoadmapResult
    } catch (e) {
        console.error('RAG roadmap LLM error:', e)
        return null
    }
}

// RAG plan + Q-Net API 데이터를 기존 마일스톤/스킬/자격 형식으로 변환
function ragPlanToMilestones(
    rag: RagRoadmapResult,
    clientData: { recommended_careers?: string; target_company?: string; education_level?: string; major?: string }
): {
    info: Array<{ id: string; title: string; description: string; status: string; date: string; quizScore: number; resources: { title: string; url: string; type: 'video' | 'article' | 'quiz' }[]; actionItems: string[] }>
    dynamicSkills: Array<{ title: string; desc: string; level: number }>
    dynamicCerts: Array<{ type: string; name: string; status: string; color: string }>
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
    const dynamicCerts = [
        { type: '자격증', name: '정보처리기사', status: '취득 권장', color: 'text-blue-600 bg-blue-50' },
        { type: '자격증', name: targetJob.includes('개발') ? 'AWS Certified Developer' : 'ADsP', status: '준비 중', color: 'text-orange-600 bg-orange-50' },
        { type: '교육', name: `${targetJob} 전문 과정`, status: '수료 권장', color: 'text-purple-600 bg-purple-50' },
    ]

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

        return {
            id: `step-${i + 1}`,
            title: step.단계 || `Step${i + 1}`,
            description: summary && isFirst ? summary : (step.역량?.join(', ') || '단계별 목표를 진행합니다.'),
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

export async function createInitialRoadmap(profileId?: string, clientData?: any, counselorId?: string | null) {
    const supabase = await createClient()
    const userIdStr = await getEffectiveUserId(counselorId)
    if (!userIdStr) return { error: 'Unauthorized' }

    let info!: Array<{ id: string; title: string; description: string; status: string; date: string; quizScore: number; resources: { title: string; url: string; type: 'video' | 'article' | 'quiz' }[]; actionItems: string[] }>
    let dynamicSkills!: Array<{ title: string; desc: string; level: number }>
    let dynamicCerts!: Array<{ type: string; name: string; status: string; color: string }>
    let targetJob!: string
    let targetCompany!: string
    let usedRag = false

    // RAG + LLM 경로: OPENAI_API_KEY 있고 profileId 있을 때
    if (process.env.OPENAI_API_KEY && profileId) {
        const ragContext = await getRoadmapRagContext(supabase, profileId, userIdStr)
        if (ragContext) {
            const ragResult = await generateRoadmapWithRag(ragContext)
            if (ragResult?.plan?.length) {
                const [qualifications, examSchedule, jobCompetency] = await Promise.all([
                    getQualificationList(),
                    getExamSchedule(),
                    getJobCompetencyList(),
                ])
                const first = ragResult.plan[0] as RagPlanStep
                first.자격정보 = qualifications.slice(0, 3)
                first.시험일정 = examSchedule.slice(0, 3)
                first.교육과정 = first.교육과정 || ['데이터 분석 과정', 'AI 엔지니어링 부트캠프', '산업안전 교육']
                first['산업분야/대표기업'] = first['산업분야/대표기업'] || ['삼성전자', '현대자동차', '네이버']
                first.직무역량 = jobCompetency.slice(0, 3)

                const mapped = ragPlanToMilestones(ragResult, clientData || {})
                info = mapped.info
                dynamicSkills = mapped.dynamicSkills
                dynamicCerts = mapped.dynamicCerts
                targetJob = mapped.targetJob
                targetCompany = mapped.targetCompany
                usedRag = true
            }
        }
    }

    // RAG 미사용 시 기존 규칙 기반
    if (!usedRag) {
        const rawTargetJob = clientData?.recommended_careers || ''
    const rawTargetCompany = clientData?.target_company || ''

    // Filter out "없음", "미정" or empty strings for clean labels
    targetJob = (rawTargetJob && rawTargetJob !== '없음' && rawTargetJob !== '미정') ? rawTargetJob : '희망 직무'
    targetCompany = (rawTargetCompany && rawTargetCompany !== '없음' && rawTargetCompany !== '미정') ? rawTargetCompany : ''

    const educationLevel = clientData?.education_level || '정보 없음'
    const major = clientData?.major || '전공 분야'
    const experience = clientData?.work_experience || ''

    // 방향: 목표 직무·목표 기업 달성에 맞춘 단계 제목·설명 (DB 필드 나열이 아닌 목표 중심)
    let phase1Title = `1단계: ${targetJob} 달성을 위한 기초 역량 다지기`
    let phase1Desc = `목표 직무(${targetJob})에 맞춰 전공·학력을 실무 역량으로 구체화합니다.${targetCompany ? ` 목표 기업 ${targetCompany} 입사를 염두에 두고 준비합니다.` : ''}`

    let phase2Title = `2단계: ${targetJob} 포트폴리오 및 역량 강화`
    let phase2Desc = `${targetJob} 시장에서 경쟁력을 보여줄 실무 결과물을 만듭니다.`

    if (targetCompany) {
        phase2Title = `2단계: ${targetCompany} 맞춤형 역량 강화`
        phase2Desc = `${targetCompany} 인재상·기술 스택에 맞춘 프로젝트와 포트폴리오를 준비합니다.`
    }

    if (educationLevel === '고등학교 졸업' || educationLevel === '전문대 졸업' || educationLevel === '대학교 재학') {
        phase1Title = `1단계: ${targetJob}를 위한 기초·이론 정립`
        phase1Desc = `목표 직무(${targetJob})에 도달하기 위해 필요한 기초 이론과 원리를 체계적으로 학습합니다.${targetCompany ? ` 목표 기업: ${targetCompany}.` : ''}`
    } else if (experience && experience.length > 20) {
        phase1Title = `1단계: 경력 기반 ${targetJob} 전문성 고도화`
        phase1Desc = `보유 경력을 살려 ${targetJob} 직무에서 차별화된 전략을 수립합니다.${targetCompany ? ` ${targetCompany} 입사 목표에 맞춥니다.` : ''}`
    }

    // 사용자(전공·목표직무·목표기업)에 맞춘 구체적 실행 방안
    const isDevCareer = /개발|엔지니어|의료AI|소프트웨어/i.test(targetJob)
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

    const phase2Actions = targetCompany
        ? [
            `${targetCompany} 인재상·채용 공고 분석 후 맞춤형 역량 매트릭스 작성`,
            `${targetCompany} 기술 스택에 맞춘 포트폴리오 프로젝트 1~2개 완성 (배포·README 정리)`,
            isDevCareer ? `AWS Certified Developer 준비: 실습 환경 구축 및 샘플 프로젝트 배포` : `목표 직무 관련 자격증(ADsP 등) 또는 실무 교육 수료`,
            `${targetCompany} 관련 네트워킹·설명회 참석 및 지원 시기·절차 파악`,
        ]
        : [
            `${targetJob} 직무 기술서 기반 역량 갭 분석 및 보완 학습 계획 수립`,
            `포트폴리오용 실무 결과물 1~2개 완성 (Git, 문서화)`,
            isDevCareer ? `AWS 또는 직무 핵심 도구 활용 프로젝트 1건 추가` : `데이터 분석/리포트 실무 사례 1건 정리`,
            `희망 기업 리스트업 및 채용 사이클·지원 전략 정리`,
        ]

    const phase3Actions = targetCompany
        ? [
            `${targetCompany} 맞춤 이력서·자기소개서 초안 작성 후 피드백 2회 이상 반영`,
            `면접 예상 질문(역량·기술·가치관) 리스트 작성 및 스토리텔링 연습`,
            `최종 지원 일정 수립 (공채/수시 채용 일정 반영) 및 서류·면접 체크리스트 관리`,
            `입사 후 3개월 목표(온보딩·팀 적응) 정리`,
        ]
        : [
            `목표 기업별 이력서·자기소개서 버전 관리 및 맞춤 수정`,
            `역량 기반 면접 스토리 및 기술 질문 대비 자료 정리`,
            `지원 일정·합격/불합격 피드백 기록으로 전략 보완`,
            `입사 후 단기 목표 설정`,
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
            title: targetCompany ? `${targetCompany} 최종 합격 및 안착` : "최종 목표 일자리 진입",
            description: `${targetCompany || '목표 기업'} 최적화 이력서와 면접 준비를 통해 최종 합격합니다.`,
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

    dynamicCerts = [
        { type: "자격증", name: "정보처리기사", status: "취득 권장", color: "text-blue-600 bg-blue-50" },
        { type: "자격증", name: targetJob.includes('개발') ? "AWS Certified Developer" : "ADsP (데이터분석 준전문가)", status: "준비 중", color: "text-orange-600 bg-orange-50" },
        { type: "교육", name: `${targetJob} 전문가 마스터 클래스`, status: "수료 권장", color: "text-purple-600 bg-purple-50" }
    ]
    }

    const { data: existingRoadmap } = await supabase
        .from('career_roadmaps')
        .select('roadmap_id')
        .eq('user_id', userIdStr)
        .eq('profile_id', profileId || null)
        .eq('is_active', true)
        .maybeSingle()

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

    let result;
    if (existingRoadmap) {
        // Update existing active roadmap
        result = await supabase
            .from('career_roadmaps')
            .update(roadmapData)
            .eq('roadmap_id', existingRoadmap.roadmap_id)
    } else {
        // Create new roadmap if none exists
        result = await supabase
            .from('career_roadmaps')
            .insert([roadmapData])
    }

    const { error } = result;

    if (error) {
        console.error('Error creating roadmap:', error)
        return { error: error.message }
    }

    revalidatePath('/roadmap')
    return { success: true }
}
