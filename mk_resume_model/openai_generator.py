import os
import json
from typing import List, Optional
from pydantic import BaseModel

class SelfIntroInput(BaseModel):
    roles: List[str]
    competencies: List[str]
    background: dict
    counseling_content: str
    language: str = "ko"
    focus: str = "strength"
    min_word_count: Optional[int] = 1000

class SelfIntroVersion(BaseModel):
    title: str
    draft: str
    scoring: dict  # {type_similarity: int, aptitude_fit: int, competency_reflection: int, average: float}

class SelfIntroOutput(BaseModel):
    reasoning: str
    versions: List[SelfIntroVersion]

def generate_with_openai(input_data: SelfIntroInput, api_key: str, model: str = "gpt-4o-mini") -> SelfIntroOutput:
    """
    OpenAI Chat Completion API를 호출하여 3가지 버전의 자기소개서를 생성합니다.
    """
    try:
        from openai import OpenAI
    except ImportError:
        raise ImportError("openai 패키지가 설치되어 있지 않습니다. 'pip install openai'를 실행하세요.")

    client = OpenAI(api_key=api_key)

    # 배경 정보 정리
    bg = input_data.background
    experiences_str = ", ".join(bg.get("experiences", [])) if bg.get("experiences") else "(데이터 없음 - 상담 원문 참고)"
    strengths_str = ", ".join(bg.get("strengths", [])) if bg.get("strengths") else "(데이터 없음 - 상담 원문 참고)"
    
    # 프롬프트 구성
    system_prompt = """당신은 전문적인 경력 개발 컨설턴트이자 자기소개서 작성 전문가입니다.
사용자의 직무, 역량, 배경 정보를 바탕으로 **[역량 중심], [경험 중심], [가치관 중심]** 총 3가지 버전의 자기소개서(Cover Letter) 초안을 작성하십시오.

**[작성 공통 규칙]**
1. **사실성 (Fact-Only)**: 제공된 '지원자 배경' 및 '상담 원문'에 명시되지 않은 허구의 사실을 절대 만들어내지 마십시오.
2. **자연스러운 흐름**: 인위적인 머리말([도입] 등)을 사용하지 말고 완성된 글 형태로 작성하십시오.
3. **분량**: 각 버전당 공백 포함 **900자~1000자 사이**로 작성하십시오. 900자 미만으로 너무 짧게 작성하지 않도록 내용을 충분히 상세하게 서술하십시오.
4. **구조**: 전체 글을 **3~4개의 핵심 문단**으로 구성하십시오. 너무 잦은 줄바꿈을 피하고 각 문단이 충분한 내용을 담도록 하십시오.
5. **문체**: 신뢰감을 주는 전문적인 비즈니스 한국어 문체(~합니다, ~입니다)를 사용하십시오.

**[버전별 특징]**
- **역량 중심**: 지원자의 핵심 직무 역량(Competency)과 전문성을 전면에 내세워 성과 창출 가능성을 강조.
- **경험 중심**: 실제 에피소드(Experience)를 STAR 기법으로 상세히 풀어내어 실무 적합성을 강조.
- **가치관 중심**: 지원자의 직업관(Values)과 태도를 기업 문화 및 직무 철학과 연결하여 조직 융화력을 강조.

**[적합도 스코어링 규칙]**
각 버전의 하단에 아래 3가지 기준(각 100점 만점)에 따른 점수와 그 평균(백분율)을 산출하여 포함하십시오.
1. **자기소개서 유형 유사도**: 해당 버전의 테마(역량/경험/가치관)가 본문에 얼마나 충실히 반영되었는지.
2. **적성 및 추천직무 적합도**: 지원자의 성향이 추천된 직무와 얼마나 잘 어울리는지.
3. **직무역량 반영도**: 추출된 핵심 역량이 본문 내에서 얼마나 구체적으로 증명되었는지.

출력 형식: 반드시 아래 JSON 형식을 엄격히 지켜서 답변하십시오.
{
  "reasoning": "3가지 버전의 구성 전략과 스코어링 산출 근거 요약",
  "versions": [
    {
      "title": "역량 중심",
      "draft": "자기소개서 본문...",
      "scoring": {
        "type_similarity": 95,
        "aptitude_fit": 90,
        "competency_reflection": 85,
        "average": 90.0
      }
    },
    ... (경험 중심, 가치관 중심 총 3개)
  ]
}
"""

    user_content = f"""
추천 직무: {", ".join(input_data.roles)}
核心 역량: {", ".join(input_data.competencies)}

지원자 배경 (Fact):
- 학력/전공: {bg.get("education") or "제공되지 않음"}
- 주요 경험: {experiences_str}
- 보유 강점: {strengths_str}
- 가치관: {bg.get("career_values") or "제공되지 않음"}

상담 원문 (추가 팩트 확인용):
\"\"\"
{input_data.counseling_content or "상담 내용 없음"}
\"\"\"

목표 분량: 버전당 공백 포함 900자 ~ 1000자 (엄격 준수)
"""

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content}
        ],
        temperature=0.3,
        response_format={"type": "json_object"}
    )

    result_json = json.loads(response.choices[0].message.content)
    
    return SelfIntroOutput(**result_json)
