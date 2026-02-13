'use server'

import { createClient, getEffectiveUserId } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { EXAM_SCHEDULES } from '@/lib/roadmap-data'
import { getIntegratedExamSchedules } from '@/lib/qnet'
import { generateRoadmapWithAI } from '@/lib/ai-roadmap'

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

    // Generate personalized milestones based on client data
    const rawTargetJob = clientData?.recommended_careers || ''
    const rawTargetCompany = clientData?.target_company || ''

    // Filter out "없음", "미정" or empty strings for clean labels
    const targetJob = (rawTargetJob && rawTargetJob !== '없음' && rawTargetJob !== '미정') ? rawTargetJob : '희망 직무'
    const targetCompany = (rawTargetCompany && rawTargetCompany !== '없음' && rawTargetCompany !== '미정') ? rawTargetCompany : ''

    const educationLevel = clientData?.education_level || '정보 없음'
    const major = clientData?.major || '전공 분야'
    const experience = clientData?.work_experience || ''

    let phase1Title = `1단계: ${major} 심화 및 실무 전환`
    let phase1Desc = `${educationLevel} 및 전공 지식을 실무 역량으로 구체화합니다.`
    let phase2Title = `2단계: ${targetJob} 포트폴리오 강화`
    let phase2Desc = `${targetJob} 시장에서 경쟁력을 가질 수 있는 실무 결과물을 도출합니다.`

    // Adjust weighting based on target company
    if (targetCompany) {
        phase2Title = `2단계: ${targetCompany} 타겟 맞춤형 역량 강화`
        phase2Desc = `${targetCompany}의 인재상과 기술 스택에 맞춘 프로젝트 및 포트폴리오를 준비합니다.`
    }

    // Adjust based on education level
    if (educationLevel === '고등학교 졸업' || educationLevel === '전문대 졸업' || educationLevel === '대학교 재학') {
        phase1Title = `1단계: ${major} 기초 및 이론 정립`
        phase1Desc = `직무 수행을 위한 기초 이론과 원리를 체계적으로 학습합니다.`
    } else if (experience && experience.length > 20) {
        phase1Title = `1단계: 기존 경력 기반 전문성 고도화`
        phase1Desc = `보유하신 경력을 바탕으로 ${targetJob} 직무의 차별화된 전략을 수립합니다.`
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

    const info = [
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
                targetCompany ? { title: `${targetCompany} 채용 분석 리포트`, url: "#", type: "document" } : { title: "직무 기술 가이드", url: "#", type: "document" }
            ],
            actionItems: phase2Actions,
        },
        {
            id: "step-3",
            title: targetCompany ? `${targetCompany} 최종 합격 및 안착` : "최종 목표 일자리 진입",
            description: `${targetCompany || '목표 기업'} 최적화 이력서와 면접 준비를 통해 최종 합격합니다.`,
            status: "locked",
            resources: [],
            actionItems: phase3Actions,
        }
    ]

    // Dynamic Competencies and Certifications based on Job
    const dynamicSkills = [
        { title: `${targetJob} 숙련도`, desc: `${targetJob} 수행을 위한 핵심 도구 및 프레임워크 활용 능력`, level: 80 },
        { title: "데이터 분석 및 활용", desc: "실무 데이터를 기반으로 한 문제 해결 및 의사 결정 능력", level: 70 },
        { title: "협업 도구 활용", desc: "Git, Jira 등 팀 협업을 위한 시스템 숙련도", level: 85 },
        { title: "문제 해결 메커니즘", desc: "복잡한 실무 문제를 논리적으로 분해하고 해결하는 능력", level: 75 }
    ]

    const dynamicCerts = [
        { type: "자격증", name: "정보처리기사", status: "취득 권장", color: "text-blue-600 bg-blue-50" },
        { type: "자격증", name: targetJob.includes('개발') ? "AWS Certified Developer" : "ADsP (데이터분석 준전문가)", status: "준비 중", color: "text-orange-600 bg-orange-50" },
        { type: "교육", name: `${targetJob} 전문가 마스터 클래스`, status: "수료 권장", color: "text-purple-600 bg-purple-50" }
    ]

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

export async function getExamSchedules() {
    // 1. Try to fetch real data from Q-Net
    try {
        const targetQuals = ["정보처리기사", "의공기사"];
        const dynamicSchedules = await getIntegratedExamSchedules(targetQuals);

        if (dynamicSchedules.length > 0) {
            return dynamicSchedules;
        }
    } catch (e) {
        console.error("Failed to fetch Q-Net data:", e);
    }

    // 2. Fallback to static data if API fails or returns empty
    return EXAM_SCHEDULES
}

export async function generateAIRoadmap(clientId?: string, counselorId?: string | null) {
    const supabase = await createClient()
    const userIdStr = await getEffectiveUserId(counselorId)
    console.log(`[generateAIRoadmap] Start for user: ${userIdStr}, client: ${clientId}`);

    if (!userIdStr) return { error: 'Unauthorized' }

    let profileData = null;

    if (clientId) {
        profileData = await getClientProfile(clientId, counselorId)
    } else {
        const { data } = await supabase
            .from('career_profiles')
            .select('*')
            .eq('user_id', userIdStr)
            .limit(1) // Removed .single() to avoid error if multiple/none, handled below
            // Actually .single() is fine if we expect one. Let's use maybeSingle()
            .maybeSingle()
        profileData = data;
    }

    if (!profileData) {
        console.error("[generateAIRoadmap] Profile not found");
        return { error: 'Profile not found' }
    }
    console.log("[generateAIRoadmap] Profile found:", profileData.client_name);

    const existingRoadmap = await getRoadmap(clientId, counselorId)

    const aiResult = await generateRoadmapWithAI(profileData, existingRoadmap)

    if (!aiResult.success || !aiResult.plan) {
        console.error(`[generateAIRoadmap] AI generation failed: ${aiResult.error || 'Plan is undefined'}`);
        return { error: aiResult.error || 'Failed to generate roadmap with AI' }
    }
    console.log("[generateAIRoadmap] AI generated successfully, processing certs...");

    const allCerts = new Set<string>();
    const allEducation = new Set<string>();

    const invalidValues = ['없음', '해당없음', '미정', 'TBD', 'None', 'N/A', 'null', 'undefined', '', '-'];

    // Helper to check if a value is valid
    const isValidItem = (item: string) => {
        if (!item || typeof item !== 'string') return false;
        const cleanItem = item.trim();
        return cleanItem.length > 1 && !invalidValues.includes(cleanItem) && !/^[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]*$/.test(cleanItem);
    };

    aiResult.plan.forEach((step: any) => {
        if (step.certifications && Array.isArray(step.certifications)) {
            step.certifications.forEach((cert: string) => {
                if (isValidItem(cert)) allCerts.add(cert.trim());
            });
        }
        if (step.education && Array.isArray(step.education)) {
            step.education.forEach((edu: string) => {
                if (isValidItem(edu)) allEducation.add(edu.trim());
            });
        }
    });

    if (allCerts.size === 0) {
        // Only add default if absolutely nothing was found and user is likely IT/Engineering
        // But for now, let's leave it empty if AI didn't suggest anything, or keep the fallback if strictly needed.
        // allCerts.add('정보처리기사'); // Removed forced default to respect AI's decision if it returns nothing
    }

    const certArray = Array.from(allCerts);
    const eduArray = Array.from(allEducation);

    // Fetch exam schedules with a timeout to prevent blocking
    let examSchedules: any[] = [];
    try {
        const schedulePromise = getIntegratedExamSchedules(certArray);
        const timeoutPromise = new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 5000));
        examSchedules = await Promise.race([schedulePromise, timeoutPromise]);
    } catch (e) {
        console.error("Exam schedule fetch failed or timed out", e);
        examSchedules = [];
    }

    const milestones = aiResult.plan.map((step: any, idx: number) => ({
        id: `step-${idx + 1}`,
        title: `${step.step_name}: ${step.job_roles.join(', ')} 준비`,
        description: step.description || `추천 활동: ${step.activities.join(', ')}`,
        status: idx === 0 ? 'in-progress' : 'locked',
        date: '',
        quizScore: 0,
        resources: [],
        actionItems: [
            ...step.activities,
            ...(step.certifications || []).map((c: string) => `${c} 자격증 취득 준비`),
            ...(step.education || []).map((e: string) => `${e} 수강 및 이수`)
        ],
    }));

    const skills = [
        { title: "AI 추천 역량", desc: "AI가 분석한 주요 필요 역량", level: 80 },
        ...new Set(aiResult.plan.flatMap((p: any) => p.competencies)).values()
    ].map((skill: any, i: number) => {
        if (typeof skill === 'string') return { title: skill, desc: "AI 추천 역량", level: 70 + (i * 2) % 20 };
        return skill;
    }).slice(0, 5);

    const certItems = certArray.map(name => ({
        type: "자격증",
        name: name,
        status: "준비 권장",
        color: "text-blue-600 bg-blue-50"
    }));

    const eduItems = eduArray.map(name => ({
        type: "교육",
        name: name,
        status: "수강 권장",
        color: "text-green-600 bg-green-50"
    }));

    const certifications = [...certItems, ...eduItems];

    const roadmapData = {
        user_id: userIdStr,
        profile_id: profileData.profile_id,
        target_job: profileData.recommended_careers || 'AI 추천 직무',
        target_company: profileData.target_company || '',
        roadmap_stage: 'planning',
        milestones: JSON.stringify(milestones),
        required_skills: JSON.stringify(skills),
        certifications: JSON.stringify(certifications),
        timeline_months: 6,
        is_active: true,
        updated_at: new Date().toISOString()
    }

    let result;
    if (existingRoadmap && existingRoadmap.roadmap_id) {
        result = await supabase
            .from('career_roadmaps')
            .update(roadmapData)
            .eq('roadmap_id', existingRoadmap.roadmap_id)
    } else {
        result = await supabase
            .from('career_roadmaps')
            .insert([roadmapData])
    }

    if (result.error) {
        console.error("DB Save Error:", result.error)
        return { error: result.error.message }
    }

    revalidatePath('/roadmap')
    return { success: true, examSchedules }
}
