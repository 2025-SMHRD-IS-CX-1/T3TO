"""
AI 진로 로드맵 생성 — Next.js dashboard/roadmap 모듈과 동일한 기능
Supabase RAG + Tavily(기업/직무/자격증 검색) + OpenAI. Q-Net API 미사용.
"""
import os
import json
import re
from datetime import datetime
import requests
import gradio as gr
from dotenv import load_dotenv
from openai import OpenAI
from supabase import create_client, Client

load_dotenv()

# -----------------------------
# 환경 변수
# -----------------------------
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY", "")
if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("SUPABASE_URL, SUPABASE_ANON_KEY를 .env에 설정하세요.")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
if not OPENAI_API_KEY:
    raise ValueError("OPENAI_API_KEY를 .env에 설정하세요.")
client = OpenAI(api_key=OPENAI_API_KEY)

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")
OPENAI_ROADMAP_MODEL = os.getenv("OPENAI_ROADMAP_MODEL", "gpt-4o-mini")

# -----------------------------
# Tavily API (Next.js web-search와 동일 역할)
# -----------------------------
def tavily_search(query: str, max_results: int = 5) -> list:
    if not TAVILY_API_KEY:
        return []
    try:
        r = requests.post(
            "https://api.tavily.com/search",
            json={
                "api_key": TAVILY_API_KEY,
                "query": query,
                "search_depth": "basic",
                "include_answer": True,
                "max_results": max_results,
            },
            timeout=15,
        )
        if r.status_code != 200:
            return []
        data = r.json()
        results = []
        for item in (data.get("results") or []):
            results.append({
                "title": item.get("title", ""),
                "url": item.get("url", ""),
                "content": item.get("content", ""),
            })
        if data.get("answer"):
            results.insert(0, {"title": "검색 요약", "url": "", "content": data["answer"]})
        return results
    except Exception as e:
        print(f"[Tavily] 검색 에러: {e}")
        return []


def search_company_info(company_names: list) -> list:
    if not company_names or not TAVILY_API_KEY:
        return []
    out = []
    for company in company_names[:3]:
        all_content = []
        for q in [f"{company} 채용 공고 인재상", f"{company} 기술 스택 개발 환경"]:
            for res in tavily_search(q, 3):
                all_content.append(res.get("content", ""))
        text = "\n\n".join(c for c in all_content if c)[:1000]
        out.append({
            "companyName": company,
            "recruitmentInfo": text,
            "talentProfile": text,
            "techStack": text,
        })
    return out


def search_job_info(job_title: str) -> dict | None:
    if not job_title or not TAVILY_API_KEY:
        return None
    all_content = []
    for q in [
        f"{job_title} 채용 요구사항 역량",
        f"{job_title} 필수 스킬 기술",
        f"{job_title} 필수 자격증 요구사항",
    ]:
        for res in tavily_search(q, 3):
            all_content.append(res.get("content", ""))
    text = "\n\n".join(c for c in all_content if c)[:1000]
    return {
        "jobTitle": job_title,
        "requirements": text,
        "skills": text,
        "certifications": text,
    }


def search_certification_info(target_job: str, major: str = "") -> dict:
    if not TAVILY_API_KEY:
        return {"summary": "", "results": []}
    queries = []
    if target_job and target_job not in ("희망 직무", "없음", "미정"):
        queries.append(f"{target_job} 관련 자격증 국가기술자격 추천")
    if major and major not in ("정보 없음", "전공 분야"):
        queries.append(f"{major} 전공 관련 자격증 한국산업인력공단")
    if not queries:
        queries.append("한국 국가기술자격증 정보처리기사 빅데이터분석기사 추천")
    queries.append("한국산업인력공단 Q-Net 시험일정 2025")
    all_results = []
    for q in queries[:4]:
        all_results.extend(tavily_search(q, 3))
    summary_parts = [r["content"] for r in all_results if r.get("content") and len(r["content"]) > 50][:8]
    summary = "\n\n".join(summary_parts)[:3000]
    return {"summary": summary, "results": all_results[:15]}


# -----------------------------
# Supabase DB 조회 (Next.js getRoadmapRagContext와 동일)
# -----------------------------
def get_user_data_by_name(client_name: str) -> dict | None:
    profile_resp = (
        supabase.table("career_profiles")
        .select("profile_id, user_id, client_name, age_group, education_level, career_orientation, recommended_careers, major, target_company, work_experience_years")
        .eq("client_name", client_name)
        .execute()
    )
    if not profile_resp.data or len(profile_resp.data) == 0:
        return None
    row = profile_resp.data[0]
    profile_id = row["profile_id"]
    counseling = (
        supabase.table("consultations")
        .select("*")
        .eq("profile_id", profile_id)
        .execute()
    )
    consultation_ids = [c["consultation_id"] for c in (counseling.data or [])]
    analysis = []
    for cid in (consultation_ids or [])[:5]:
        r = supabase.table("consultation_analysis").select("*").eq("consultation_id", cid).execute()
        if r.data:
            analysis.extend(r.data)
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
        "profile_id": profile_id,
        "counselor_user_id": row["user_id"],
    }


# -----------------------------
# 로드맵 시스템 프롬프트 (Next.js ROADMAP_SYSTEM_PROMPT와 동일 방향)
# -----------------------------
ROADMAP_SYSTEM_PROMPT = """너는 진로 상담 전문가야.
아래 RAG 컨텍스트(DB 데이터 + 웹 검색 결과)를 종합 분석해서 단계별 진로 로드맵을 작성해라.

[핵심 원칙]
- RAG 컨텍스트 = DB 데이터(진로프로필, 상담내역, 분석결과) + 웹 검색 결과(기업/직무 정보). 모두 함께 참고해라.
- 목표는 "목표 직무"와 "목표 기업" 달성. 단계 제목에 기업명·"목표 기업" 넣지 말고, 구체적 실행 방안만 제시해라.
- Step1: 기초 역량 다지기. Step2: 역량 강화(경험/인턴/프로젝트/자격증 구체적 방법). Step3: 면접 준비(프로그래머스·백준·원티드·STAR 기법 등 구체적 사이트·방법).

[Output Format]
반드시 아래 JSON만 출력해라. 다른 설명 없이 JSON만.
{
  "summary": "목표 직무·목표 기업을 명시한 한 줄 요약",
  "citations_used": [],
  "plan": [
    { "단계": "Step1 구체적 제목", "추천활동": ["활동1","활동2"], "직업군": [], "역량": [] },
    { "단계": "Step2 구체적 제목", "추천활동": [], "직업군": [], "역량": [] },
    { "단계": "Step3 구체적 제목", "추천활동": [], "직업군": [], "역량": [] }
  ]
}"""


def build_roadmap_user_context(target_job: str, target_company: str, job_info_text: str, company_info_text: str, user_data: dict) -> str:
    no_company = not target_company or target_company in ("없음", "미정")
    return f"""[RAG 컨텍스트 - DB 데이터 + 웹 검색 결과]

[내담자 목표]
- 목표 직무: {target_job or '프로필에서 추출'}
- 목표 기업: {target_company or '프로필에서 추출'}
{"**목표 기업 없음**: 직무목표에 맞춰 Step2·Step3를 직무 역량·취업 중심으로 작성해라." if no_company else ""}

[RAG 구성요소 1: 웹 검색 결과]
{job_info_text or "(직무 웹 검색 없음)"}
{company_info_text or "(기업 웹 검색 없음)"}

[RAG 구성요소 2: DB 데이터]
진로프로필: {json.dumps(user_data.get("profile", []), ensure_ascii=False)}
상담내역: {json.dumps(user_data.get("counseling", []), ensure_ascii=False)}
상담분석: {json.dumps(user_data.get("analysis", []), ensure_ascii=False)}
기존 로드맵: {json.dumps(user_data.get("roadmap", []), ensure_ascii=False)}

[작성 지침]
위 RAG를 종합해 내담자 맞춤형 단계별 로드맵을 작성해라. 웹 검색이 없어도 DB만으로 작성해라."""


# -----------------------------
# 로드맵 RAG 생성 (Next.js generateRoadmapWithRag와 동일 흐름)
# -----------------------------
def generate_career_roadmap_rag(user_data: dict, company_info_text: str, job_info_text: str) -> dict:
    profile = (user_data.get("profile") or [{}])[0]
    target_job = profile.get("recommended_careers") or profile.get("target_job") or ""
    target_company = profile.get("target_company") or ""
    context = build_roadmap_user_context(
        target_job, target_company, job_info_text, company_info_text, user_data
    )
    response = client.chat.completions.create(
        model=OPENAI_ROADMAP_MODEL,
        messages=[
            {"role": "system", "content": ROADMAP_SYSTEM_PROMPT},
            {"role": "user", "content": context},
        ],
        temperature=0,
    )
    text = response.choices[0].message.content.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1]) if lines else text
    return json.loads(text)


# -----------------------------
# 자격증 추천 (Next.js getCertificationsFromTavilyContext와 동일)
# -----------------------------
CERT_TAVILY_SYSTEM = """너는 한국 국가기술자격·자격증 추천 전문가야.
아래 [웹 검색 결과]에 등장한 자격증만 추천해라. 검색 결과에 없는 자격증은 만들지 말 것 (환각 금지).
JSON만 출력.
{
  "recommended": [
    { "qualName": "검색 결과에 등장한 자격증명", "relevanceScore": 8, "reason": "추천 이유" }
  ]
}"""


def get_certifications_from_tavily(tavily_cert: dict, target_job: str, major: str, analysis_list: list, job_info_from_tavily: dict | None) -> list:
    if not tavily_cert.get("summary") and not tavily_cert.get("results"):
        return []
    analysis_text = " ".join(
        str(a.get("strengths", "")) + " " + str(a.get("interest_keywords", "")) + " " + str(a.get("career_values", ""))
        for a in (analysis_list or [])
    )
    web_context = tavily_cert.get("summary") or "\n".join(
        r.get("content", "")[:500] for r in tavily_cert.get("results", [])
    )[:3500]
    user_prompt = f"""[내담자]
- 목표 직무: {target_job or '없음'}
- 전공: {major or '없음'}
- 상담 분석: {analysis_text or '없음'}
{f'- Tavily 직무 자격증 요구: {job_info_from_tavily.get("certifications", "")}' if job_info_from_tavily else ''}

[웹 검색 결과 - 자격증]
{web_context}

위 검색 결과에 실제로 언급된 자격증만 3~5개 골라 추천해라. JSON만 출력."""
    try:
        resp = client.chat.completions.create(
            model=OPENAI_ROADMAP_MODEL,
            messages=[
                {"role": "system", "content": CERT_TAVILY_SYSTEM},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
        )
        text = resp.choices[0].message.content.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1]) if lines else text
        parsed = json.loads(text)
        recs = parsed.get("recommended") or []
        colors = ["text-blue-600 bg-blue-50", "text-green-600 bg-green-50", "text-orange-600 bg-orange-50", "text-purple-600 bg-purple-50", "text-red-600 bg-red-50"]
        statuses = ["취득 권장", "취득 추천", "관심 분야"]
        return [
            {
                "type": "자격증",
                "name": r.get("qualName", ""),
                "status": statuses[0] if (r.get("relevanceScore", 0) >= 8) else statuses[1] if (r.get("relevanceScore", 0) >= 6) else statuses[2],
                "color": colors[i % len(colors)],
                "details": {
                    "description": r.get("reason", ""),
                    "examScheduleWritten": "",
                    "examSchedulePractical": "",
                    "difficulty": "난이도: 중",
                },
            }
            for i, r in enumerate(recs[:5])
        ]
    except Exception as e:
        print(f"[자격증 Tavily RAG] 에러: {e}")
        return []


# -----------------------------
# 역량 계산 (Next.js computeCompetenciesFromProfile 간소화)
# -----------------------------
def compute_competencies(profile: dict, analysis_list: list, target_job: str, target_company: str, job_requirements_text: str = "") -> list:
    major = (profile.get("major") or "").strip()
    education = (profile.get("education_level") or "").strip()
    work_years = profile.get("work_experience_years") or 0
    analysis_text = " ".join(
        str(a.get("strengths", "")) + " " + str(a.get("interest_keywords", "")) + " " + str(a.get("career_values", ""))
        for a in (analysis_list or [])
    ).lower()
    education_score = 12 if re.search(r"대학교\s*졸업|대졸|4년제", education) else 8 if re.search(r"재학|전문대", education) else 3 if re.search(r"고등|고졸", education) else 5
    experience_score = 20 if work_years >= 3 else 12 if work_years >= 1 else 5 if work_years > 0 else 0
    job_level = min(95, max(25, 45 + min(education_score, 15) + min(experience_score, 15)))
    if target_company and target_company not in ("없음", "미정"):
        job_level = min(95, job_level + 5)
    if any(k in analysis_text for k in ["기술", "개발", "코딩", "문제해결", "분석"]):
        job_level = min(95, job_level + 10)
    competencies = [
        {"title": "목표 직무 역량", "desc": job_requirements_text[:200] if job_requirements_text else f"{target_job} 핵심 역량", "level": round(job_level)},
        {"title": "실무 역량", "desc": "목표 직무 실무 수행 능력", "level": round(job_level * 0.9)},
        {"title": "협업·소통", "desc": "팀 협업·소통 역량", "level": round(50 + min(experience_score, 25))},
        {"title": "문제 해결", "desc": "논리적 문제 분해·해결", "level": round(50 + min(experience_score, 20))},
    ]
    return competencies


# -----------------------------
# plan → 마일스톤 변환 (Next.js ragPlanToMilestones와 동일 형식)
# -----------------------------
def plan_to_milestones(plan: list, target_job: str, target_company: str, company_infos: list) -> list:
    info = []
    for i, step in enumerate(plan or []):
        title = (step.get("단계") or f"Step{i+1}").strip()
        raw_actions = step.get("추천활동") or []
        action_items = [str(a).strip() for a in raw_actions]
        desc = step.get("역량") and step["역량"][0] if isinstance(step.get("역량"), list) else (action_items[0] if action_items else "단계별 목표를 진행합니다.")
        if isinstance(desc, list):
            desc = " ".join(desc) if desc else "단계별 목표를 진행합니다."
        info.append({
            "id": f"step-{i+1}",
            "title": title,
            "description": desc or "단계별 목표를 진행합니다.",
            "status": "in-progress" if i == 0 else "locked",
            "date": datetime.now().strftime("%Y-%m-%d") if i == 0 else "",
            "quizScore": 0,
            "resources": [{"title": "진로 가이드", "url": "#", "type": "article"}],
            "actionItems": action_items,
        })
    if not info:
        info.append({
            "id": "step-1",
            "title": "1단계: 목표 설정",
            "description": "상담 및 프로필을 바탕으로 목표를 구체화합니다.",
            "status": "in-progress",
            "date": datetime.now().strftime("%Y-%m-%d"),
            "quizScore": 0,
            "resources": [{"title": "진로 가이드", "url": "#", "type": "article"}],
            "actionItems": ["목표 직무·기업 조사", "역량 갭 분석"],
        })
    return info


# -----------------------------
# DB 저장 (Next.js career_roadmaps UPSERT와 동일)
# -----------------------------
def save_roadmap_to_db(profile_id: str, user_id: str, result: dict) -> bool:
    try:
        existing = (
            supabase.table("career_roadmaps")
            .select("roadmap_id")
            .eq("user_id", user_id)
            .eq("profile_id", profile_id)
            .eq("is_active", True)
            .execute()
        )
        payload = {
            "user_id": user_id,
            "profile_id": profile_id,
            "target_job": result.get("targetJob", ""),
            "target_company": result.get("targetCompany", ""),
            "roadmap_stage": "planning",
            "milestones": json.dumps(result.get("info", []), ensure_ascii=False),
            "required_skills": json.dumps(result.get("dynamicSkills", []), ensure_ascii=False),
            "certifications": json.dumps(result.get("dynamicCerts", []), ensure_ascii=False),
            "timeline_months": 6,
            "is_active": True,
        }
        if existing.data and len(existing.data) > 0:
            supabase.table("career_roadmaps").update(payload).eq("roadmap_id", existing.data[0]["roadmap_id"]).execute()
        else:
            supabase.table("career_roadmaps").insert(payload).execute()
        return True
    except Exception as e:
        print(f"[DB 저장] 에러: {e}")
        return False


# -----------------------------
# 전체 흐름 (Next.js runRoadmap + actions.createInitialRoadmap와 동일)
# -----------------------------
def career_roadmap_from_name(client_name: str, save_to_db: bool = True) -> dict | tuple:
    user_data = get_user_data_by_name(client_name)
    if not user_data:
        return {"error": f"'{client_name}'에 해당하는 진로 프로필을 찾을 수 없습니다."}

    profile = (user_data.get("profile") or [{}])[0]
    profile_id = user_data.get("profile_id", "")
    counselor_user_id = user_data.get("counselor_user_id", "")
    target_job = profile.get("recommended_careers") or profile.get("target_job") or "희망 직무"
    target_company = profile.get("target_company") or ""
    major = profile.get("major") or ""
    analysis_list = user_data.get("analysis") or []

    # 1) Tavily: 기업 + 직무 검색
    company_names = [c.strip() for c in (target_company or "").replace("，", ",").replace("、", ",").split(",") if c.strip()]
    company_infos = search_company_info(company_names) if TAVILY_API_KEY else []
    job_info = search_job_info(target_job) if TAVILY_API_KEY and target_job else None

    company_info_text = "\n\n".join(
        f"[{c['companyName']}]\n인재상: {c.get('talentProfile','')}\n채용: {c.get('recruitmentInfo','')}\n기술스택: {c.get('techStack','')}"
        for c in company_infos
    )
    job_info_text = ""
    if job_info:
        job_info_text = " ".join(filter(None, [job_info.get("requirements"), job_info.get("skills"), job_info.get("certifications")]))

    # 2) 로드맵 RAG 생성
    roadmap = generate_career_roadmap_rag(user_data, company_info_text, job_info_text)
    if roadmap.get("error"):
        return roadmap

    plan = roadmap.get("plan") or []

    # 3) Tavily 자격증 검색 → LLM 추천
    tavily_cert = search_certification_info(target_job, major) if TAVILY_API_KEY else {"summary": "", "results": []}
    dynamic_certs = get_certifications_from_tavily(
        tavily_cert, target_job, major, analysis_list,
        job_info,
    )

    # 4) 역량 계산
    profile_for_comp = {
        "major": major,
        "education_level": profile.get("education_level"),
        "work_experience_years": profile.get("work_experience_years") or 0,
    }
    dynamic_skills = compute_competencies(
        profile_for_comp, analysis_list, target_job, target_company, job_info_text[:400] if job_info_text else ""
    )

    # 5) plan → 마일스톤
    target_job_final = target_job if target_job not in ("없음", "미정") else "희망 직무"
    target_company_final = target_company if target_company not in ("없음", "미정") else ""
    info = plan_to_milestones(plan, target_job_final, target_company_final, company_infos)

    result = {
        "info": info,
        "dynamicSkills": dynamic_skills,
        "dynamicCerts": dynamic_certs,
        "targetJob": target_job_final,
        "targetCompany": target_company_final,
    }

    if save_to_db and profile_id and counselor_user_id:
        save_roadmap_to_db(profile_id, counselor_user_id, result)

    return result


# -----------------------------
# Gradio 인터페이스 (출력: Next.js RunRoadmapResult 형식 JSON)
# -----------------------------
def run_roadmap(client_name: str, save_to_db: bool) -> tuple[str, dict]:
    if not client_name or not client_name.strip():
        return "내담자 이름을 입력하세요.", {}
    try:
        result = career_roadmap_from_name(client_name.strip(), save_to_db=save_to_db)
        if isinstance(result, dict) and result.get("error"):
            return result["error"], {}
        return "", result
    except Exception as e:
        return str(e), {}


iface = gr.Interface(
    fn=lambda name, save: run_roadmap(name, save),
    inputs=[
        gr.Textbox(label="내담자 이름 (CLIENT_NAME)", placeholder="예: 홍길동"),
        gr.Checkbox(label="DB에 로드맵 저장 (career_roadmaps)", value=True),
    ],
    outputs=[
        gr.Textbox(label="에러 메시지 (없으면 비움)"),
        gr.JSON(label="로드맵 결과 (info, dynamicSkills, dynamicCerts, targetJob, targetCompany)"),
    ],
    title="AI 진로 로드맵 (dashboard/roadmap 동일 기능)",
    description="내담자 이름 입력 → Supabase RAG + Tavily(기업/직무/자격증 검색) + OpenAI로 로드맵 생성. Q-Net 미사용. 결과는 Next.js roadmap 모듈과 동일한 info/dynamicSkills/dynamicCerts/targetJob/targetCompany 형식입니다.",
)

if __name__ == "__main__":
    iface.launch(debug=True)
