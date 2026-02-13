
import OpenAI from 'openai';

// Remove top-level initialization
// const openai = new OpenAI({ ... });

export interface AIRoadmapResponse {
    success: boolean;
    error?: string;
    summary?: string;
    plan?: {
        step_name: string; // '단계'
        description: string; // '단계 설명'
        activities: string[]; // '추천활동'
        job_roles: string[]; // '직업군'
        competencies: string[]; // '역량'
        certifications: string[]; // '자격정보'
        education?: string[]; // '교육/훈련'
    }[];
}

export async function generateRoadmapWithAI(clientData: any, currentRoadmap: any): Promise<AIRoadmapResponse> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error("OPENAI_API_KEY is missing");
        return { success: false, error: "OpenAI API Key is missing on server" };
    }

    const openai = new OpenAI({
        apiKey: apiKey,
    });

    const systemPrompt = `
    너는 진로 상담 전문가야.
    아래 데이터(상담내역, 분석결과, 진로프로필, 기존 로드맵)를 종합해서
    단계별 진로 로드맵을 작성해라.
    
    [Constraints]
    - 단계별 조언 (Step1~Step4)
    - 각 단계별 추천 활동 포함
    - 관련 직업군 제안
    - 필요한 역량 및 학습 방향 제시
    
    4. 단계별 설명(description) 작성 시:
       - 추상적인 표현(예: '열심히 하세요')을 금지한다.
       - 사용자의 '전공', '학년/나이', '현재 상태'를 대명사 대신 명시적으로 언급하며 서술해라.
       - 예: "컴퓨터공학 전공을 살려...", "현재 4학년이므로..." 등 구체적인 맥락을 반영해라.

    *** [매우 중요] 콘텐츠 작성 원칙 ***
    1. 모든 단계의 제안은 사용자의 '전공', '목표 직무', '현재 학년/나이'와 직접적으로 연관되어야 한다.
    2. 사용자 프로필과 관련 없는 뜬금없는 조언(예: IT 전공자에게 조리 자격증 추천 등)은 절대 금지한다.
    3. 구체적인 기업명이나 프로젝트 예시를 들어라 (예: "삼성전자 DS부문 지원을 위해...", "스프링 부트 프로젝트 경험을 위해...").

    *** [중요] 자격증 및 교육 추천 규칙 ***
    1. 추천할 자격증/교육이 없으면 절대 '없음', 'None', '미정' 등의 텍스트를 넣지 말고 빈 배열 []을 반환해라.
    2. 한국산업인력공단의 '기사', '산업기사' 또는 기능사 등급의 표준 국가기술자격증을 우선 추천해라.
    3. 민간 자격증보다는 국가공인 자격증을 우선시해라.
    4. 반드시 1개 이상 추천하려고 노력해라.
    5. 정확한 자격증 명칭을 사용해라 (예: '정보처리기사', '의공기사', '전기기사' 등)

    *** [중요] 교육/훈련 추천 규칙 ***
    1. 해당 직무에 도움이 되는 구체적인 교육 과정을 추천해라 (예: '패스트캠퍼스 데이터 분석', 'K-Digital Training', 'Coursera 머신러닝' 등).
    2. 국비지원 교육이나 온라인 강의 등 접근 가능한 옵션을 포함해라.

    [Output Format]
    *** 중요: 결과는 반드시 JSON 형식으로 출력해라. ***
    {
      "summary": "전체적인 로드맵 요약 (한글)",
      "plan": [
        {
          "step_name": "Step1",
          "description": "사용자의 상황(전공, 학년 등)에 맞춘 구체적인 단계 설명",
          "activities": ["활동1","활동2"...],
          "job_roles": ["직업1","직업2"...],
          "competencies": ["역량1","역량2"...],
          "certifications": ["자격증명칭1","자격증명칭2"...],
          "education": ["교육과정명1","교육과정명2"...]
        }
      ]
    }
    `;

    const context = `
    이름: ${clientData?.client_name || '사용자'}
    나이/학년: ${clientData?.age_group || '미상'}
    전공: ${clientData?.major || '미상'}
    목표 직무: ${clientData?.recommended_careers || '미상'}
    
    상세 프로필: ${JSON.stringify(clientData)}
    기존 로드맵: ${JSON.stringify(currentRoadmap)}
    `;

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: context }
            ],
            temperature: 0.2,
            response_format: { type: "json_object" },
        }, { timeout: 60000 }); // 60 seconds timeout

        const outputText = response.choices[0].message.content;
        if (!outputText) return { success: false, error: "Empty response from OpenAI" };

        const result = JSON.parse(outputText);
        return { success: true, ...result };

    } catch (error: any) {
        console.error("AI Roadmap Generation Error:", error);
        return { success: false, error: error.message || "Unknown AI Generation Error" };
    }
}
