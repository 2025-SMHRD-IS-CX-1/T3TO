# -*- coding: utf-8 -*-
"""
로드맵 모델 Colab 테스트용 코드
- 이 파일 전체를 Google Colab에 복사 후, API 키 설정하고 셀 실행即可.
- pip: !pip install openai
"""

import json
import re
import os
from openai import OpenAI

# ========== 1. 설정 (Colab에서 API 키 입력) ==========
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "sk-...")  # Colab: from google.colab import userdata; OPENAI_API_KEY = userdata.get('OPENAI_API_KEY')
MODEL = os.environ.get("OPENAI_ROADMAP_MODEL", "gpt-4o-mini")

# ========== 2. 시스템 프롬프트 (서비스와 동일) ==========
SYSTEM_PROMPT = """너는 진로 상담 전문가야.
아래 **RAG 컨텍스트(DB 데이터 + 웹 검색 결과)**를 **종합 분석**해서 단계별 진로 로드맵을 작성해라.

[핵심 원칙 - RAG 기반 생성]
- **RAG 컨텍스트는 DB 데이터(진로프로필, 상담내역, 분석결과)와 웹 검색 결과를 모두 포함**한다.
- DB 데이터와 웹 검색 결과를 모두 함께 참고해서 종합적으로 로드맵을 작성해라.
- 진로프로필의 필드(전공, 학력, 경력, 연령대, 성향 등)를 그대로 나열하지 말고, 상담내역·분석결과와 함께 해석하여 내담자의 현재 상태와 강점을 파악해라.
- **웹 검색으로 가져온 실제 기업 채용 공고, 인재상, 기술 스택, 직무 요구사항 정보**를 RAG 컨텍스트의 일부로 활용해서 환각을 피하고 실제 시장 정보를 반영해라.
- 웹 검색 결과가 없어도 DB 데이터만으로 RAG 기반 로드맵을 생성해라.
- **주요 목표**는 반드시 "내담자가 목표로 하는 직무(희망 직무)"와 "목표로 하는 기업(희망 기업)"으로 설정해라.
- 모든 단계(Step1~StepN)는 "그 목표 직무·목표 기업에 도달하기 위한 역량·활동"으로 방향을 잡아라.

[RAG 컨텍스트 활용 방법 - DB 데이터 + 웹 검색 결과 종합]
1. **DB 데이터 활용 (RAG 필수 구성요소)**: 진로프로필의 전공, 학력, 경력, 연령대를 바탕으로 내담자의 현재 역량 수준 파악. 상담내역과 분석결과에서 드러난 강점, 가치관, 관심사 반영.
2. **웹 검색 결과 활용 (RAG 선택 구성요소 - 있으면 포함)**: 목표 직무의 실제 요구사항, 최신 트렌드, 필수 스킬 / 목표 기업의 실제 채용 공고, 인재상, 기술 스택.
3. **RAG 기반 종합 생성**: RAG 컨텍스트 = DB 데이터 + 웹 검색 결과(있으면)를 모두 함께 사용. 내담자의 현재 역량 수준에서 목표까지의 갭을 분석하고 단계별로 채워나가는 로드맵 작성.

[단계별 구성 - 분석 결과 기반 맞춤형 제목 및 전략 필수]
- 단계 제목: DB 필드 나열 금지. 상담·분석·웹 검색 결과를 종합 분석한 결과로 구체적 제목 생성.
- Step1 (단기 1~3개월): 목표 직무 달성을 위한 기초 역량 다지기.
- Step2 (중기 3~12개월): 목표 기업 맞춤형 역량 강화. 역량 필드에는 구체적 역량 개발 방법(경험/인턴/프로젝트/자격증) 제시.
- Step3 (장기 1년+): 목표 기업 최종 합격 및 안착. 면접 준비 구체적 사이트·방법(백준, 프로그래머스, STAR 기법 등) 제시.
- **목표 기업이 없는 경우**: 직무목표에 맞춰 Step2·Step3만 작성. 기업명 나열 금지.

[Constraints]
- "DB 데이터", "웹 검색", "종합" 같은 메타 표현을 출력에 포함하지 말고 자연스러운 문구로 작성해라.

[Citation 필수 - Context 활용도·Faithfulness 평가용]
- RAG 컨텍스트를 인용했을 때 **citations_used** 배열에 기록해라.
- 규칙: 웹 검색(목표 기업) → "[웹:기업] 활용 내용 한 줄", 웹 검색(목표 직무) → "[웹:직무] 활용 내용 한 줄", 진로프로필 → "[DB:프로필] 활용 내용 한 줄", 상담내역·분석 → "[DB:상담] 활용 내용 한 줄"
- 출력 JSON에 **citations_used** 필드를 포함하고, 활용한 출처별로 1줄씩 넣어라. (없으면 빈 배열 [])
- 컨텍스트에 없는 기업명·채용 정보를 지어내지 말 것 (환각 금지). 목표 기업은 RAG에 제공된 것만 사용할 것.

[Output Format]
반드시 아래 JSON만 출력해라. 다른 설명 없이 JSON만.
{
  "summary": "목표 직무·목표 기업을 명시한 한 줄 요약",
  "citations_used": ["[웹:기업] Step2 채용 공고 기술스택 반영", "[DB:프로필] Step1 전공·학력 반영"],
  "plan": [
    { "단계": "Step1 제목", "추천활동": ["활동1","활동2"], "직업군": ["직업1"], "역량": ["역량1"] },
    { "단계": "Step2 제목", "추천활동": ["활동1","활동2"], "직업군": ["직업1"], "역량": ["역량1"] },
    { "단계": "Step3 제목", "추천활동": ["활동1","활동2"], "직업군": ["직업1"], "역량": ["역량1"] }
  ]
}"""


def build_context(target_job: str, target_company: str, job_info_text: str, company_info_text: str, profile_json: str, counseling_json: str, analysis_json: str) -> str:
    """RAG 컨텍스트 문자열 생성 (서비스와 동일 형식)."""
    no_company_note = (
        '**목표 기업 없음**: 해당 프로필의 직무목표에 맞춰 중기(Step2)·장기(Step3) 목표를 설정해라. 기업명을 나열하지 말고 직무 역량 강화·취업·안착 중심으로 작성해라.'
        if (not target_company or target_company in ("없음", "미정")) else
        '위 목표 직무·기업을 달성하는 데 초점을 맞춰 단계를 구성해라.'
    )
    return f"""[RAG 컨텍스트 - DB 데이터 + 웹 검색 결과]

[내담자 목표 (로드맵의 핵심 방향)]
- 목표 직무(희망 직무): {target_job or '프로필·상담에서 추출'}
- 목표 기업(희망 기업): {target_company or '프로필·상담에서 추출'}
{no_company_note}

[RAG 컨텍스트 구성요소 1: 웹 검색 결과 - 실제 시장 정보 (환각 방지)]
{job_info_text or '(목표 직무 웹 검색 결과 없음 - RAG는 DB 데이터만 사용)'}

{company_info_text or '(목표 기업 웹 검색 결과 없음 - RAG는 DB 데이터만 사용)'}

[RAG 컨텍스트 구성요소 2: DB 데이터 - 내담자 현재 상태 및 상담 정보]
진로프로필 (전공, 학력, 경력, 연령대, 성향 등): {profile_json}
상담내역: {counseling_json}
상담내역 분석결과 (강점, 가치관, 관심사 등): {analysis_json}

[작성 지침]
- 위 RAG 컨텍스트의 DB 데이터와 웹 검색 결과를 함께 사용해 종합적으로 로드맵을 작성해라.
- 내담자의 현재 상태에서 목표까지의 갭을 분석하고 단계별로 현실적인 로드맵을 작성해라."""


def evaluate_roadmap_output(parsed: dict) -> dict:
    """정확성·품질 간이 평가 (구조 검사). 반환: score 0~100, checks 리스트."""
    checks = []
    plan = parsed.get("plan") or []
    has_plan = isinstance(plan, list) and len(plan) >= 3
    checks.append({"ok": has_plan, "label": "plan 3단계 이상"})
    summary = parsed.get("summary") or ""
    has_summary = isinstance(summary, str) and summary.strip()
    checks.append({"ok": bool(has_summary), "label": "summary 존재"})
    steps_valid = True
    if has_plan:
        for step in plan:
            if not isinstance(step, dict):
                steps_valid = False
                break
            title = step.get("단계") or ""
            activities = step.get("추천활동") or []
            if not (isinstance(title, str) and title.strip() and isinstance(activities, list) and len(activities) > 0):
                steps_valid = False
                break
    else:
        steps_valid = False
    checks.append({"ok": steps_valid, "label": "단계별 제목·추천활동 존재"})
    passed = sum(1 for c in checks if c["ok"])
    score = round((passed / len(checks)) * 100) if checks else 0
    return {"score": score, "checks": checks}


def evaluate_context_utilization(
    parsed: dict,
    has_company_web: bool,
    has_job_web: bool,
    allowed_company_names: list,
) -> dict:
    """Context 활용도·Faithfulness 평가. 반환: citationCount, citationIncluded, faithfulnessScore, details."""
    details = []
    citations = parsed.get("citations_used")
    if not isinstance(citations, list):
        citations = []
    citation_count = len(citations)
    citation_included = citation_count > 0
    details.append(f"citation 개수: {citation_count}")
    if citation_count > 0:
        details.append("citations_used: " + " | ".join(citations[:5]) + (" ..." if len(citations) > 5 else ""))

    allowed_set = set(n.strip().lower() for n in allowed_company_names if n and n.strip())
    full_parts = [parsed.get("summary") or ""]
    for step in parsed.get("plan") or []:
        if isinstance(step, dict):
            full_parts.append(step.get("단계") or "")
            for a in step.get("추천활동") or []:
                full_parts.append(str(a))
    full_text = " ".join(full_parts)

    company_pattern = re.compile(
        r"(네이버|카카오|삼성|삼성전자|현대|현대자동차|LG|SK|쿠팡|토스|라인|배달의민족|우아한형제들|엔씨소프트|크래프톤|펄어비스|하이브|CJ|한화|롯데|POSCO|포스코|두산|GS|KT|SK텔레콤)(?!\w)",
        re.IGNORECASE,
    )
    mentioned = list(dict.fromkeys(m.group(1).lower() for m in company_pattern.finditer(full_text)))
    allowed_norm = [n.strip().lower() for n in allowed_company_names if n and n.strip()]
    hallucinated = []
    if allowed_set:
        for name in mentioned:
            if not any(name in a or a in name for a in allowed_norm):
                hallucinated.append(name)
    faithfulness_score = 1.0 if not allowed_set else (1.0 if not hallucinated else max(0.0, 1.0 - len(hallucinated) * 0.35))
    if hallucinated:
        details.append(f"환각 가능 기업명(컨텍스트에 없음): {', '.join(hallucinated)}")
    details.append(f"Faithfulness score: {faithfulness_score*100:.0f}%")

    return {
        "citationCount": citation_count,
        "citationIncluded": citation_included,
        "faithfulnessScore": faithfulness_score,
        "details": details,
    }


def run_roadmap_test(
    target_job: str = "백엔드 개발자",
    target_company: str = "네이버, 카카오",
    job_info_text: str = "(목표 직무 웹 검색 결과 없음 - RAG는 DB 데이터만 사용)",
    company_info_text: str = "(목표 기업 웹 검색 결과 없음 - RAG는 DB 데이터만 사용)",
    profile_json: str = '{"major":"컴퓨터공학","education_level":"대학교 졸업","work_experience_years":0,"recommended_careers":"백엔드 개발자","target_company":"네이버, 카카오"}',
    counseling_json: str = "[]",
    analysis_json: str = "[]",
    model: str = None,
    api_key: str = None,
) -> dict:
    """
    로드맵 1회 생성 + 평가 실행.
    반환: { "parsed": parsed, "accuracy": evaluate_roadmap_output 결과, "context_eval": evaluate_context_utilization 결과 }
    """
    api_key = api_key or OPENAI_API_KEY
    model = model or MODEL
    if not api_key or api_key.startswith("sk-..."):
        return {"error": "OPENAI_API_KEY를 설정하세요."}

    client = OpenAI(api_key=api_key)
    context = build_context(
        target_job, target_company,
        job_info_text, company_info_text,
        profile_json, counseling_json, analysis_json,
    )

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": context},
        ],
        temperature=0,
    )
    text = (response.choices[0].message.content or "").strip()
    if text.startswith("```"):
        lines = text.split("\n")
        json_str = "\n".join(lines[1:-1]) if "json" in (lines[0] or "") else text
    else:
        json_str = text
    parsed = json.loads(json_str)

    accuracy = evaluate_roadmap_output(parsed)
    allowed = [s.strip() for s in (target_company or "").replace("，", ",").replace("、", ",").split(",") if s.strip()]
    context_eval = evaluate_context_utilization(
        parsed,
        has_company_web=bool(company_info_text and "(없음" not in company_info_text),
        has_job_web=bool(job_info_text and "(없음" not in job_info_text),
        allowed_company_names=allowed,
    )

    return {
        "parsed": parsed,
        "accuracy": accuracy,
        "context_eval": context_eval,
        "model": model,
    }


def print_test_result(result: dict) -> None:
    """run_roadmap_test 반환값을 읽기 쉽게 출력."""
    if result.get("error"):
        print("에러:", result["error"])
        return
    print("=" * 60)
    print("로드맵 모델 테스트 결과")
    print("=" * 60)
    print("모델:", result.get("model", ""))
    acc = result.get("accuracy") or {}
    print("\n[정확성 평가]", acc.get("score", 0), "점")
    for c in acc.get("checks", []):
        print("  ", "✓" if c.get("ok") else "✗", c.get("label", ""))
    ctx = result.get("context_eval") or {}
    print("\n[Context 활용도 평가]")
    print("  citation 수:", ctx.get("citationCount", 0), "| citation 포함:", ctx.get("citationIncluded", False))
    print("  Faithfulness:", f"{ctx.get('faithfulnessScore', 0)*100:.0f}%")
    for d in ctx.get("details", []):
        print("  ", d)
    p = result.get("parsed") or {}
    print("\n[출력 요약] summary:", (p.get("summary") or "")[:80], "...")
    print("  plan 단계 수:", len(p.get("plan") or []))
    print("  citations_used:", p.get("citations_used") or [])
    print("=" * 60)


# ========== Colab 실행 예시 ==========
# 아래 블록 전체를 Colab 셀에 붙여넣고 실행하면 됨.

COLAB_RUN_EXAMPLE = """
# 1) 패키지 설치 (한 번만)
!pip install openai -q

# 2) API 키 설정 (Colab 시크릿 사용 시: 열쇠 아이콘에서 OPENAI_API_KEY 추가 후)
import os
from roadmap_model_colab_test import run_roadmap_test, print_test_result

# API 키: 시크릿 또는 직접 입력
# os.environ["OPENAI_API_KEY"] = "sk-..."
from google.colab import userdata
os.environ["OPENAI_API_KEY"] = userdata.get("OPENAI_API_KEY")

# 3) 테스트 실행 (목표 직무·기업·RAG 텍스트는 인자로 변경 가능)
result = run_roadmap_test(
    target_job="백엔드 개발자",
    target_company="네이버",
    job_info_text="(목표 직무 웹 검색 결과 없음 - RAG는 DB 데이터만 사용)",
    company_info_text="(목표 기업 웹 검색 결과 없음 - RAG는 DB 데이터만 사용)",
    profile_json='{"major":"컴퓨터공학","education_level":"대학교 졸업","work_experience_years":0,"recommended_careers":"백엔드 개발자","target_company":"네이버"}',
    api_key=os.environ.get("OPENAI_API_KEY"),
    model="gpt-4o-mini",  # 또는 gpt-4o
)
print_test_result(result)

# 4) JSON 전체 보기
import json
print(json.dumps(result.get("parsed") or {}, ensure_ascii=False, indent=2))
"""

if __name__ == "__main__":
    if OPENAI_API_KEY and not OPENAI_API_KEY.startswith("sk-..."):
        result = run_roadmap_test(
            target_job="백엔드 개발자",
            target_company="네이버",
            api_key=OPENAI_API_KEY,
        )
        print_test_result(result)
    else:
        print("OPENAI_API_KEY를 설정한 뒤 다시 실행하세요.")
        print("Colab 사용 시 위 COLAB_RUN_EXAMPLE 문자열 내용을 셀에 붙여넣어 실행하면 됩니다.")
