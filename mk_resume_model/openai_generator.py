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
    rag_context: Optional[str] = None

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
    
    # 프롬프트 구성 (RAG 기반·환각 방지·종합 출력, 700~800자)
    system_prompt = """당신은 **합격자 자기소개서 데이터를 바탕으로 학습된** 채용 자기소개서 전문가입니다.
**현재 작동 방식**: 제공된 RAG 컨텍스트(상담 원문, 로드맵·직무역량, DB 프로필, 그리고 OpenAI 등으로 찾아온 정보)만 사용하여, **환각을 방지**하고 그 내용을 **종합적으로** 자기소개서로 출력합니다. 컨텍스트에 없는 경험이나 사실은 절대 만들지 마십시오.

**[RAG 기반 · 환각 방지]**
- **RAG 컨텍스트 = 상담 원문 + 로드맵(직무·역량) + DB(프로필) + (제공된) 찾아온 정보**만 참조하십시오.
- 위 컨텍스트에 명시되지 않은 회사명·수치·경험·자격은 지어내지 마십시오. 있는 내용만 골라 STAR/CAR/SOAR로 풀어 쓰십시오.
- 상담·로드맵·프로필에 나온 강점, 경험, 가치관, 희망 직무/기업을 **종합**하여 한 편의 완결된 초안으로 작성하십시오.

**[합격자 스타일 · 구체적 반영]**
- 구체적 에피소드, 상황-행동-결과를 포함하되, **반드시 제공된 자료에 나온 내용만** 사용하십시오.
- 추상적 일반론만 나열하지 말고, 문단마다 구체 사례가 드러나도록 하십시오.

**[강점 제시 후 예시 추가 (필수)]**
- 본문에서 **각 강점(역량/경험/가치관)을 제시한 뒤**, 그다음에 **실제 합격자 자기소개서 검색 결과를 참고한 예시**를 이어서 작성하십시오.
- RAG 컨텍스트에 "[실제 합격자 자기소개서 검색 결과]"가 포함되어 있으면, 그 문장 스타일·구조(상황-행동-결과, STAR 등)를 참고하여 **내담자 사실에 맞는 예시 문단**을 추가하십시오. 검색 결과에 없는 내용을 지어내지 말고, 검색 예시의 톤과 구조만 참고하십시오.
- 강점만 나열하지 말고, "강점 제시 → 그에 대한 구체적 예시(검색 결과 스타일 참고)" 순으로 서술하십시오.

**[작성 공통 규칙]**
1. **사실성**: 지원자 배경·상담 원문·RAG 컨텍스트에만 있는 내용으로 작성. 없는 것은 만들지 말 것.
2. **분량**: 각 버전당 공백 포함 **700자 이상 800자 이하**(한글 기준). 700자 미만이거나 800자를 초과하지 말 것.
3. **자연스러운 흐름**: [도입] 등 소제목 없이 완성된 글 형태. 3~4개 문단 구성.
4. **문체**: 비즈니스 한국어(~합니다, ~입니다).

**[버전별 특징]**
- **역량 중심**: 로드맵·상담에 나온 구체 사례로 직무 역량 증명.
- **경험 중심**: 상담/프로필 경험을 STAR로 서술.
- **가치관 중심**: 상담에서 드러난 가치관을 에피소드와 연결.

**[적합도 스코어링 - 반드시 본문을 평가해 산출]**
- 각 버전의 **실제 작성된 draft 본문**을 읽고, 아래 기준으로 **내담자·직무마다 다르게** 점수를 부여하시오. 모든 버전에 동일한 점수(예: 85)를 주지 말 것.
- type_similarity(자소서 유형 유사도): 해당 버전 테마(역량/경험/가치관)가 본문에 얼마나 충실히 반영되었는지 0~100.
- aptitude_fit(적성·직무 적합도): 내담자 성향·경험이 추천 직무와 얼마나 맞는지 0~100.
- competency_reflection(직무역량 반영도): 핵심 역량이 본문에서 구체적으로 증명되었는지 0~100.
- average: 위 세 항목의 산술 평균(소수 가능). 버전마다·내담자마다 달라야 함.
- 점수는 본문 품질·RAG 반영도에 따라 70~98 범위에서 차이 나게 산출하시오.

출력 형식: 아래 JSON만 출력.
{
  "reasoning": "RAG 반영 방식 및 각 버전별 스코어 산출 근거(왜 그 점수인지) 요약",
  "versions": [
    { "title": "역량 중심", "draft": "본문(700~800자)", "scoring": { "type_similarity": 92, "aptitude_fit": 88, "competency_reflection": 90, "average": 90.0 } },
    { "title": "경험 중심", "draft": "본문(700~800자)", "scoring": { "type_similarity": 88, "aptitude_fit": 91, "competency_reflection": 85, "average": 88.0 } },
    { "title": "가치관 중심", "draft": "본문(700~800자)", "scoring": { "type_similarity": 90, "aptitude_fit": 86, "competency_reflection": 88, "average": 88.0 } }
  ]
}
"""

    user_content = f"""
[추천 직무] {", ".join(input_data.roles)}
[직무 역량] {", ".join(input_data.competencies)}

[지원자 배경 - DB/프로필]
- 학력/전공: {bg.get("education") or "제공되지 않음"}
- 주요 경험: {experiences_str}
- 보유 강점: {strengths_str}
- 가치관: {bg.get("career_values") or "제공되지 않음"}

[상담 원문 - 반드시 위 내용에서 구체 에피소드·경험·어려움·성과를 추출해 자기소개서에 반영하세요]
\"\"\"
{input_data.counseling_content or "상담 내용 없음"}
\"\"\"
"""
    if input_data.rag_context and input_data.rag_context.strip():
        user_content += f"""

[로드맵·DB 종합 컨텍스트 - 상담 분석, 학력/경력/희망기업 등 위와 함께 최대한 반영]
\"\"\"
{input_data.rag_context.strip()}
\"\"\"
"""
    user_content += """

[작성 지침 - RAG 기반 환각 방지·종합 출력]
- 위 상담 원문·로드맵·DB(및 제공된 찾아온 정보)만 사용하여 작성하세요. 없는 내용은 만들지 마세요.
- **각 강점 제시 후**: RAG에 "[실제 합격자 자기소개서 검색 결과]"가 있으면 그 스타일을 참고해 구체적 예시를 이어서 작성하세요. 강점 → 예시 순으로 출력하세요.
- 목표 분량: 버전당 **700자 이상 800자 이하**(공백 포함). 700 미만·800 초과 금지.
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
