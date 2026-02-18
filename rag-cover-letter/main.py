# -*- coding: utf-8 -*-
"""
자기소개서 RAG API (로컬 실행).
Next 앱에서 RAG_COVER_LETTER_API_URL 로 이 서버의 /generate 를 호출하면 됨.
"""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# .env 로드
try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass


class GenerateRequest(BaseModel):
    client_name: str = ""
    major: str = ""
    target_job: str = ""
    insights: str = ""
    age_group: str | None = None
    education_level: str | None = None


class DraftItem(BaseModel):
    type: str
    title: str
    content: str


class GenerateResponse(BaseModel):
    drafts: list[DraftItem]


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 시작 시 RAG retriever 빌드 (PDF 있으면)
    try:
        from rag import _build_retriever
        _build_retriever()
    except Exception as e:
        print(f"[startup] RAG 초기화 경고: {e}")
    yield
    # shutdown 시 할 일 없음


app = FastAPI(title="자기소개서 RAG API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/generate", response_model=GenerateResponse)
def generate(req: GenerateRequest):
    """자기소개서 초안 3종 생성. Next 앱에서 이 엔드포인트를 호출합니다."""
    if not os.environ.get("OPENAI_API_KEY"):
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY가 설정되지 않았습니다.")
    try:
        from rag import generate_drafts
        drafts = generate_drafts(
            client_name=req.client_name,
            major=req.major,
            target_job=req.target_job,
            insights=req.insights,
            age_group=req.age_group,
            education_level=req.education_level,
        )
        return GenerateResponse(drafts=[DraftItem(**d) for d in drafts])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"생성 실패: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
