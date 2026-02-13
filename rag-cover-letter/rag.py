# -*- coding: utf-8 -*-
"""
RAG 파이프라인 + 자기소개서 초안 3종 생성 (로컬용).
구글 드라이브 마운트/체인지디렉토리 제거, 환경변수 기반.
"""

import os
import re
from typing import Optional

from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

# .env 로드 (FastAPI에서 실행할 때도 로드되도록)
try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

# ---------- 설정 ----------
PDF_PATH = os.environ.get("PDF_PATH", "./자소서.pdf")
CHROMA_PERSIST_DIR = os.environ.get("CHROMA_PERSIST_DIR", "./chroma_db")
# 품질: 검색 청크 수(많을수록 context 풍부), MMR로 다양성 확보
RAG_TOP_K = int(os.environ.get("RAG_TOP_K", "6"))
RAG_USE_MMR = os.environ.get("RAG_USE_MMR", "true").lower() in ("1", "true", "yes")
# 모델: gpt-4o-mini / gpt-4o 등 (고품질은 gpt-4o 권장)
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_MAX_TOKENS = int(os.environ.get("OPENAI_MAX_TOKENS", "4096"))

_retriever = None
_llm = None


def _get_llm():
    global _llm
    if _llm is None:
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY 환경변수가 필요합니다.")
        _llm = ChatOpenAI(
            model=OPENAI_MODEL,
            temperature=0,
            max_tokens=OPENAI_MAX_TOKENS,
        )
    return _llm


def _build_retriever():
    """PDF 로드 → 청크 → Chroma → retriever. PDF 없으면 None 반환."""
    global _retriever
    if _retriever is not None:
        return _retriever

    if not os.path.isfile(PDF_PATH):
        print(f"[RAG] PDF 없음: {PDF_PATH} — context 없이 생성합니다.")
        _retriever = None
        return _retriever

    loader = PyPDFLoader(PDF_PATH)
    documents = loader.load()
    if not documents:
        _retriever = None
        return _retriever

    splitter = RecursiveCharacterTextSplitter(chunk_size=600, chunk_overlap=80)
    chunks = splitter.split_documents(documents)
    embeddings = OpenAIEmbeddings()
    vectorstore = Chroma.from_documents(
        documents=chunks,
        embedding=embeddings,
        persist_directory=CHROMA_PERSIST_DIR,
    )
    try:
        if RAG_USE_MMR:
            _retriever = vectorstore.as_retriever(
                search_type="mmr",
                search_kwargs={"k": RAG_TOP_K, "fetch_k": min(20, max(RAG_TOP_K * 3, 10))},
            )
        else:
            _retriever = vectorstore.as_retriever(search_kwargs={"k": RAG_TOP_K})
    except Exception:
        _retriever = vectorstore.as_retriever(search_kwargs={"k": RAG_TOP_K})
    return _retriever


def _get_context(target_job: str) -> str:
    """RAG 검색: 여러 질의로 context 수집 후 합쳐서 반환."""
    retriever = _build_retriever()
    if retriever is None:
        return ""
    queries = [
        f"{target_job} 직무 요건, 자격요건, 담당업무",
        f"{target_job} 채용 우대사항, 역량",
        "회사 소개, 기업 문화, 인재상",
    ]
    seen = set()
    parts = []
    for q in queries:
        for doc in retriever.invoke(q):
            text = doc.page_content.strip()
            if text and text not in seen:
                seen.add(text)
                parts.append(text)
    return "\n\n".join(parts[: 12])  # 상위 12개 청크까지


def _get_context_single(query: str) -> str:
    """단일 질의 RAG (하위 호환)."""
    retriever = _build_retriever()
    if retriever is None:
        return ""
    docs = retriever.invoke(query)
    return "\n\n".join(d.page_content for d in docs)


# ---------- 자기소개서 초안 3종 생성 ----------
DRAFT_SYSTEM = """당신은 국가 공인 자격을 보유한 전문 진로·취업 상담사이자 자기소개서 첨삭 전문가입니다.
- 상담 현장에서 쓰는 신뢰감 있는 톤으로, 내담자 한 명 한 명에 맞춘 자기소개서 초안을 작성합니다.
- 제공된 [참고 자료]에 직무 요건·우대역량·회사 정보가 있으면, 그 키워드와 표현을 자연스럽게 녹여서 작성합니다. 없으면 일반적인 톤으로 작성합니다.
- 과장·추상적 표현은 쓰지 않고, 구체적 에피소드·숫자·경험이 들어가도록 문장을 만듭니다.
- 각 초안은 400자 이상 700자 이내로, 구조는 (인사/지원동기 → 핵심 역량/경험/가치 → 마무리)를 유지합니다."""

DRAFT_USER_TEMPLATE = """다음 내담자 정보를 바탕으로 **자기소개서 초안 3종**을 작성해주세요.

## 내담자 정보
- 이름: {client_name}
- 전공: {major}
- 희망 직무: {target_job}
- 상담 분석 요약: {insights}

## 참고 자료 (채용 공고·직무 자료 — 있으면 반드시 반영)
{context}

## 작성 요청
- **Version 1 (역량 중심)**: 해당 직무에서 요구하는 역량·스킬을 강조. 전공/경험을 구체적으로 연결.
- **Version 2 (경험 중심)**: 프로젝트·실습·대외활동 등 한두 가지 에피소드를 중심으로 성과와 배운 점을 서술.
- **Version 3 (가치관 중심)**: 지원 동기·일하는 태도·가치관을 짧은 경험과 연결해 설득력 있게 서술.

아래 형식으로 **정확히 3개**만 작성하고, 각 초안은 400자 이상 700자 이내로 써주세요. 형식 외 설명은 하지 마세요.

---
## Version 1
제목: [직무명] - 역량 중심
내용:
(역량 중심 초안 전문)

## Version 2
제목: [직무명] - 경험 중심
내용:
(경험 중심 초안 전문)

## Version 3
제목: [직무명] - 가치관 중심
내용:
(가치관 중심 초안 전문)
---"""


def _parse_three_drafts(raw: str, target_job: str) -> list[dict]:
    """LLM 출력에서 Version 1/2/3 블록을 파싱해 drafts 리스트 반환."""
    drafts = []
    # ## Version N ... ## Version N+1 또는 끝까지
    pattern = re.compile(
        r"## Version (\d+)\s*\n제목:\s*(.+?)\n내용:\s*\n(.*?)(?=\n## Version \d+|\Z)",
        re.DOTALL,
    )
    for m in pattern.finditer(raw):
        num, title, content = m.group(1), m.group(2).strip(), m.group(3).strip()
        content = content.strip()
        if not content:
            continue
        drafts.append({
            "type": f"Version {num}",
            "title": title.replace("[직무명]", target_job).strip(),
            "content": content,
        })
    if len(drafts) >= 3:
        return drafts[:3]
    # 폴백: Version 1/2/3 단순 구분자로 나누기
    for i, part in enumerate(re.split(r"\n## Version \d+", raw, maxsplit=3)):
        if i == 0:
            continue
        part = part.strip()
        if not part or len(part) < 50:
            continue
        # 첫 줄을 제목으로, 나머지를 내용으로
        lines = part.split("\n", 2)
        title = lines[0].replace("제목:", "").strip() if lines else f"{target_job} - 초안 {i}"
        content = lines[2].strip() if len(lines) > 2 else part
        drafts.append({
            "type": f"Version {i}",
            "title": title[: 200],
            "content": content[: 10000],
        })
    return drafts[:3]


def generate_drafts(
    client_name: str,
    major: str,
    target_job: str,
    insights: str = "",
    age_group: Optional[str] = None,
    education_level: Optional[str] = None,
) -> list[dict]:
    """
    내담자 정보 + RAG context로 자기소개서 초안 3종 생성.
    반환: [ {"type": "Version 1", "title": "...", "content": "..."}, ... ]
    """
    context = _get_context(target_job or "직무")
    if not context.strip():
        context = "(참고 자료 없음. 일반적인 톤으로 작성합니다.)"

    prompt = ChatPromptTemplate.from_messages([
        ("system", DRAFT_SYSTEM),
        ("human", DRAFT_USER_TEMPLATE),
    ])
    chain = prompt | _get_llm() | StrOutputParser()
    inp = {
        "client_name": client_name,
        "major": major or "-",
        "target_job": target_job or "직무",
        "insights": insights or "(상담 분석 없음)",
        "context": context[: 8000],
    }
    raw = chain.invoke(inp)
    drafts = _parse_three_drafts(raw, target_job or "직무")

    # 3개 미만이면 부족한 만큼 플레이스홀더 추가
    default_titles = [
        f"{target_job} - 역량 중심",
        f"{target_job} - 경험 중심",
        f"{target_job} - 가치관 중심",
    ]
    while len(drafts) < 3:
        i = len(drafts) + 1
        drafts.append({
            "type": f"Version {i}",
            "title": default_titles[len(drafts)] if len(drafts) < 3 else f"{target_job} - 초안 {i}",
            "content": f"[{client_name}님 맞춤 초안 {i} 생성 실패. 다시 시도해 주세요.]",
        })
    return drafts[:3]
