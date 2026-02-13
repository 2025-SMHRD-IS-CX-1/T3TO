"""
AI 진로 로드맵 생성 (Supabase + RAG + Q-Net)
내담자 이름으로 프로필/상담/로드맵을 조회해 GPT로 단계별 로드맵 생성 및 시각화
"""
import os
import json
import time
import pandas as pd
import plotly.express as px
import requests
import xmltodict
import gradio as gr
from dotenv import load_dotenv
from openai import OpenAI
from supabase import create_client, Client

load_dotenv()

# -----------------------------
# Supabase 연결
# -----------------------------
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY", "")
if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("SUPABASE_URL, SUPABASE_ANON_KEY를 .env에 설정하세요.")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# -----------------------------
# OpenAI 연결
# -----------------------------
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
if not OPENAI_API_KEY:
    raise ValueError("OPENAI_API_KEY를 .env에 설정하세요.")
client = OpenAI(api_key=OPENAI_API_KEY)

# -----------------------------
# Q-Net 공공데이터 API 키
# -----------------------------
QNET_SERVICE_KEY = os.getenv("QNET_SERVICE_KEY", "")

# -----------------------------
# 공공데이터 API 호출 (재시도)
# -----------------------------
def fetch_xml(url, params=None, retries=3):
    if params is None:
        params = {}
    params["serviceKey"] = QNET_SERVICE_KEY

    for attempt in range(retries):
        try:
            response = requests.get(url, params=params, timeout=10)
            if response.status_code == 200:
                return xmltodict.parse(response.text)
            print(f"Error {response.status_code}: {response.text[:200]}")
            return None
        except requests.exceptions.Timeout:
            print(f"Timeout, {attempt + 1}번째 재시도...")
            time.sleep(2)
        except Exception as e:
            print(f"에러: {e}")
            return None
    return None


def get_qualification_list():
    url = "https://openapi.q-net.or.kr/api/service/rest/InquiryListNationalQualifcationSVC/getList"
    return fetch_xml(url, params={"pageNo": 1, "numOfRows": 10})


def get_exam_schedule():
    url = "https://apis.data.go.kr/B490007/qualExamSchd/getQualExamSchdList"
    return fetch_xml(url, params={"implYmd": "20260101"})


def get_job_competency():
    url = "https://apis.data.go.kr/B490007/jobCompetency/getJobCompetencyList"
    return fetch_xml(url, params={"pageNo": 1, "numOfRows": 10})


# -----------------------------
# Supabase DB 조회 (profile_id / user_id 구분)
# -----------------------------
def get_user_data_by_name(client_name):
    # 내담자 이름으로 프로필 조회 (profile_id, user_id=상담사)
    profile_resp = (
        supabase.table("career_profiles")
        .select("profile_id, user_id, client_name, age_group, education_level, career_orientation, recommended_careers, major, target_company")
        .eq("client_name", client_name)
        .execute()
    )
    if not profile_resp.data or len(profile_resp.data) == 0:
        return None

    row = profile_resp.data[0]
    profile_id = row["profile_id"]
    counselor_user_id = row["user_id"]

    # 상담 내역: profile_id(내담자) 기준
    counseling = (
        supabase.table("consultations")
        .select("*")
        .eq("profile_id", profile_id)
        .execute()
    )

    # 상담 분석: consultation_id로 연결 (해당 상담들의 analysis)
    consultation_ids = [c["consultation_id"] for c in (counseling.data or [])]
    analysis = []
    if consultation_ids:
        for cid in consultation_ids[:5]:  # 최대 5개
            r = supabase.table("consultation_analysis").select("*").eq("consultation_id", cid).execute()
            if r.data:
                analysis.extend(r.data)

    # 로드맵: profile_id(내담자) 기준
    roadmap = (
        supabase.table("career_roadmaps")
        .select("*")
        .eq("profile_id", profile_id)
        .execute()
    )

    return {
        "counseling": counseling.data or [],
        "analysis": analysis,
        "profile": profile_resp.data,
        "roadmap": roadmap.data or [],
        "counselor_user_id": counselor_user_id,
    }


# -----------------------------
# AI 로드맵 생성 (RAG)
# -----------------------------
def generate_career_roadmap_rag(user_data):
    system_prompt = """
너는 진로 상담 전문가야.
아래 데이터(상담내역, 분석결과, 진로프로필, 기존 로드맵)를 종합해서
단계별 진로 로드맵을 작성해라.

[Constraints]
- 단계별 조언 (Step1~StepN)
- 각 단계별 추천 활동 포함
- 관련 직업군 제안
- 필요한 역량 및 학습 방향 제시

[Output Format]
반드시 아래 JSON만 출력해라. 다른 설명 없이 JSON만.
{
  "summary": "한 줄 요약",
  "plan": [
    {
      "단계": "Step1",
      "추천활동": ["활동1","활동2"],
      "직업군": ["직업1","직업2"],
      "역량": ["역량1","역량2"]
    }
  ]
}
"""

    context = f"""
상담내역: {user_data['counseling']}
상담내역 분석결과: {user_data['analysis']}
진로프로필: {user_data['profile']}
기존 로드맵: {user_data['roadmap']}
"""

    response = client.chat.completions.create(
        model=os.getenv("OPENAI_ROADMAP_MODEL", "gpt-4o-mini"),
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": context},
        ],
        temperature=0,
    )

    output_text = response.choices[0].message.content.strip()
    # JSON 블록만 추출 (```json ... ``` 감싸인 경우 대비)
    if output_text.startswith("```"):
        lines = output_text.split("\n")
        output_text = "\n".join(lines[1:-1]) if lines[0].strip().startswith("```") else output_text
    return json.loads(output_text)


# -----------------------------
# 로드맵 생성 + 시각화
# -----------------------------
def career_roadmap_from_name(client_name):
    user_data = get_user_data_by_name(client_name)
    if not user_data:
        return {"error": f"'{client_name}'에 해당하는 진로 프로필을 찾을 수 없습니다."}, None

    roadmap = generate_career_roadmap_rag(user_data)

    if roadmap.get("error"):
        return roadmap, None

    qualifications = get_qualification_list() if QNET_SERVICE_KEY else None
    exam_schedule = get_exam_schedule() if QNET_SERVICE_KEY else None
    job_competency = get_job_competency() if QNET_SERVICE_KEY else None

    plan = roadmap.get("plan") or []
    if plan and (qualifications or exam_schedule or job_competency):
        try:
            step0 = plan[0]
            if qualifications and "response" in qualifications and "body" in qualifications["response"]:
                items = qualifications["response"]["body"].get("items", {})
                step0["자격정보"] = (items.get("item") or [])[:3] if isinstance(items.get("item"), list) else []
            else:
                step0["자격정보"] = []
            if exam_schedule and "response" in exam_schedule and "body" in exam_schedule["response"]:
                items = exam_schedule["response"]["body"].get("items", {})
                step0["시험일정"] = (items.get("item") or [])[:3] if isinstance(items.get("item"), list) else []
            else:
                step0["시험일정"] = []
            step0["교육과정"] = ["데이터 분석 과정", "AI 엔지니어링 부트캠프", "산업안전 교육"]
            step0["산업분야/대표기업"] = ["삼성전자", "현대자동차", "네이버"]
            if job_competency and "response" in job_competency and "body" in job_competency["response"]:
                items = job_competency["response"]["body"].get("items", {})
                step0["직무역량"] = (items.get("item") or [])[:3] if isinstance(items.get("item"), list) else []
            else:
                step0["직무역량"] = []
        except Exception as e:
            print(f"Error attaching API data: {e}")

    # 시각화
    milestones = []
    for step in plan:
        qual_list = step.get("자격정보") or []
        sched_list = step.get("시험일정") or []
        qual = qual_list[0].get("qualName", "자격증") if qual_list and isinstance(qual_list[0], dict) else "자격증"
        date = sched_list[0].get("implYmd", "날짜 미정") if sched_list and isinstance(sched_list[0], dict) else "날짜 미정"
        comp_list = step.get("직무역량") or []
        comp_str = ", ".join([c.get("compName", "") for c in comp_list if isinstance(c, dict)]) or "-"
        milestones.append({
            "단계": step.get("단계", ""),
            "자격증": qual,
            "날짜": date,
            "교육과정": ", ".join(step.get("교육과정", [])),
            "산업분야/대표기업": ", ".join(step.get("산업분야/대표기업", [])),
            "직무역량": comp_str,
        })

    if milestones:
        df = pd.DataFrame(milestones)
        fig = px.timeline(df, x_start="날짜", x_end="날짜", y="단계", text="자격증")
        fig.update_yaxes(autorange="reversed")
    else:
        fig = None

    return roadmap, fig


# -----------------------------
# Gradio 인터페이스
# -----------------------------
iface = gr.Interface(
    fn=career_roadmap_from_name,
    inputs=[gr.Textbox(label="내담자 이름 (CLIENT_NAME)")],
    outputs=[
        gr.JSON(label="진로 로드맵 데이터"),
        gr.Plot(label="로드맵 마일스톤 시각화"),
    ],
    title="AI 진로 상담 플래너 (Supabase + RAG + Q-Net)",
    description="내담자 이름을 입력하면 Supabase DB와 Q-Net 데이터를 결합해 새로운 진로 로드맵을 생성하고 시각화합니다.",
)

if __name__ == "__main__":
    iface.launch(debug=True)
