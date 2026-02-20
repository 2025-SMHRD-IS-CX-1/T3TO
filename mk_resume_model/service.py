"""
자기소개서 생성 서비스 레이어.
상담 기반 요청을 받아 자기소개서 초안을 생성합니다.
checkpoints/resume_lm 이 있으면 학습된 모델로 생성, 없으면 템플릿 생성기 사용.
"""

from __future__ import annotations

import os
from pathlib import Path

from models.counseling import AIAnalysisResult, CounselingContent, ExtractedBackground, SelfIntroRequest
from models.output import SelfIntroResponse
from adapter import to_self_intro_input
from self_intro_generator import SelfIntroInput, generate_self_introduction

_SERVICE_DIR = Path(__file__).resolve().parent
_DEFAULT_CHECKPOINT = _SERVICE_DIR / "checkpoints" / "resume_lm"
_RESUME_LM_MODEL = None
_RESUME_LM_TOKENIZER = None


def _self_intro_input_to_dict(input_data: SelfIntroInput) -> dict:
    bg = input_data.background
    return {
        "roles": list(input_data.roles),
        "competencies": list(input_data.competencies),
        "background": {
            "name": bg.name,
            "education": bg.education,
            "experiences": list(bg.experiences or []),
            "strengths": list(bg.strengths or []),
            "career_values": bg.career_values,
        },
    }


def _get_resume_lm_checkpoint() -> Path | None:
    """학습된 모델 경로. 환경변수 우선, 없으면 checkpoints/resume_lm 자동 사용."""
    path = os.environ.get("RESUME_LM_CHECKPOINT")
    if path and Path(path).exists():
        return Path(path)
    if _DEFAULT_CHECKPOINT.exists():
        return _DEFAULT_CHECKPOINT
    return None


def _try_create_with_resume_lm(input_data: SelfIntroInput) -> str | None:
    global _RESUME_LM_MODEL, _RESUME_LM_TOKENIZER
    path = _get_resume_lm_checkpoint()
    if path is None:
        return None
    try:
        from inference_resume_lm import load_model, generate
    except ImportError:
        return None
    if _RESUME_LM_MODEL is None:
        _RESUME_LM_TOKENIZER, _RESUME_LM_MODEL = load_model(path, use_cpu=True)
    input_dict = _self_intro_input_to_dict(input_data)
    return generate(input_dict, _RESUME_LM_TOKENIZER, _RESUME_LM_MODEL)


def create_self_introduction(request: SelfIntroRequest) -> SelfIntroResponse:
    """
    상담 기반 요청을 받아 자기소개서 초안을 생성합니다.

    Args:
        request: 상담 컨텐츠, AI 분석 결과, 언어 등이 포함된 요청

    Returns:
        SelfIntroResponse: 생성된 자기소개서 초안 및 메타데이터
    """
    input_data = to_self_intro_input(request)
    draft_from_lm = _try_create_with_resume_lm(input_data)
    if draft_from_lm is not None:
        word_count = len(draft_from_lm.replace(" ", "").replace("\n", ""))
        return SelfIntroResponse(
            draft=draft_from_lm,
            reasoning="(학습된 모델로 생성)",
            word_count=word_count,
        )
    result = generate_self_introduction(input_data)
    word_count = len(result.draft.replace(" ", "").replace("\n", ""))  # 한글 기준 글자 수
    return SelfIntroResponse(
        draft=result.draft,
        reasoning=result.reasoning,
        word_count=word_count,
    )


def create_self_introduction_simple(
    counseling_content: str,
    roles: list[str],
    competencies: list[str],
    *,
    name: str | None = None,
    education: str | None = None,
    experiences: list[str] | None = None,
    strengths: list[str] | None = None,
    language: str = "ko",
) -> SelfIntroResponse:
    """
    간단한 인자만으로 자기소개서를 생성합니다.
    웹 폼이나 스크립트에서 빠르게 호출할 때 유용합니다.
    """
    counseling = CounselingContent(content=counseling_content)
    extracted = ExtractedBackground(
        name=name,
        education=education,
        experiences=experiences,
        strengths=strengths,
    ) if any([name, education, experiences, strengths]) else None

    ai_analysis = AIAnalysisResult(
        roles=roles,
        competencies=competencies,
        extracted_background=extracted,
    )
    request = SelfIntroRequest(
        counseling=counseling,
        ai_analysis=ai_analysis,
        language=language,
    )
    return create_self_introduction(request)
