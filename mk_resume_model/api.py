"""
자기소개서 생성 웹 API.

- FastAPI 앱: POST /api/self-intro/generate 로 요청 받아 서비스 create_self_introduction 호출 후 응답 반환.
- 요청/응답은 Pydantic 스키마로 검증. 내부적으로는 models.counseling / models.output 의 dataclass 로 변환해 사용.
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from service import create_self_introduction
from models.counseling import (
    CounselingContent,
    AIAnalysisResult,
    ExtractedBackground,
)
from models.output import SelfIntroResponse


# --- Pydantic 스키마 (JSON 요청/응답 검증용. OpenAPI 문서에도 사용) ---

class CounselingContentSchema(BaseModel):
    """상담 컨텐츠 스키마 (요청 body.counseling)"""

    content: str = Field(..., description="상담 기록 전문 또는 요약")
    session_date: Optional[str] = Field(None, description="상담 일자")
    notes: Optional[str] = Field(None, description="상담사 메모")


class ExtractedBackgroundSchema(BaseModel):
    """AI 추출 배경 정보 스키마 (요청 body.ai_analysis.extracted_background)"""

    name: Optional[str] = None
    education: Optional[str] = None
    experiences: Optional[List[str]] = None
    strengths: Optional[List[str]] = None
    career_values: Optional[str] = Field(None, description="상담에서 추출한 가치관")


class AIAnalysisResultSchema(BaseModel):
    """AI 분석 결과 스키마 (요청 body.ai_analysis). roles, competencies 필수."""

    roles: List[str] = Field(..., description="추천 직무/분야 목록")
    competencies: List[str] = Field(..., description="직무역량 목록")
    extracted_background: Optional[ExtractedBackgroundSchema] = None


class SelfIntroRequestSchema(BaseModel):
    """자기소개서 생성 요청 스키마 (POST body 전체)"""

    counseling: CounselingContentSchema
    ai_analysis: AIAnalysisResultSchema
    language: str = Field("ko", description="출력 언어 (ko/en)")
    min_word_count: int = Field(600, ge=0, description="최소 글자 수")
    focus: Optional[str] = Field(
        "strength",
        description="작성 초점: strength(역량) / experience(경험) / values(가치관)",
    )


class SelfIntroResponseSchema(BaseModel):
    """자기소개서 생성 응답 스키마 (draft 본문 + 선택 reasoning + 글자 수)"""

    draft: str = Field(..., description="자기소개서 초안 본문")
    reasoning: Optional[str] = Field(None, description="추론 과정")
    word_count: int = Field(0, description="생성된 글자 수")


# --- FastAPI 앱 및 엔드포인트 ---

app = FastAPI(
    title="자기소개서 생성 API",
    description="상담 컨텐츠와 AI 분석 결과를 기반으로 자기소개서 초안을 생성합니다.",
    version="1.0.0",
)


def _to_counseling(c: CounselingContentSchema) -> CounselingContent:
    """Pydantic 스키마 → counseling 모델(dataclass) 변환."""
    return CounselingContent(
        content=c.content,
        session_date=c.session_date,
        notes=c.notes,
    )


def _to_extracted(e: Optional[ExtractedBackgroundSchema]) -> Optional[ExtractedBackground]:
    """Pydantic 스키마 → ExtractedBackground 변환. None이면 None 반환."""
    if e is None:
        return None
    return ExtractedBackground(
        name=e.name,
        education=e.education,
        experiences=e.experiences,
        strengths=e.strengths,
        career_values=e.career_values,
    )


def _to_ai_analysis(a: AIAnalysisResultSchema) -> AIAnalysisResult:
    """Pydantic 스키마 → AIAnalysisResult 변환."""
    return AIAnalysisResult(
        roles=a.roles,
        competencies=a.competencies,
        extracted_background=_to_extracted(a.extracted_background),
    )


@app.post(
    "/api/self-intro/generate",
    response_model=SelfIntroResponseSchema,
    summary="자기소개서 초안 생성",
    description="상담 컨텐츠와 AI 분석된 직무역량/추천분야를 바탕으로 자기소개서 초안을 생성합니다.",
)
def generate_self_intro(request: SelfIntroRequestSchema) -> SelfIntroResponseSchema:
    """요청 스키마 → SelfIntroRequest 변환 후 create_self_introduction 호출, 응답 스키마로 반환. 검증 실패 시 400."""
    from models.counseling import SelfIntroRequest

    req = SelfIntroRequest(
        counseling=_to_counseling(request.counseling),
        ai_analysis=_to_ai_analysis(request.ai_analysis),
        language=request.language,
        min_word_count=request.min_word_count,
        focus=(request.focus or "strength").strip().lower(),
    )
    try:
        result: SelfIntroResponse = create_self_introduction(req)
        return SelfIntroResponseSchema(
            draft=result.draft,
            reasoning=result.reasoning,
            word_count=result.word_count,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/health", summary="헬스 체크")
def health():
    """서비스 상태 확인."""
    return {"status": "ok", "service": "self-intro-generator"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
