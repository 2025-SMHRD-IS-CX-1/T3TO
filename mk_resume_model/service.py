"""
자기소개서 생성 서비스 (파인튜닝 모델 전용).
요청(직무·역량·배경)을 받아 resume_lm으로 초안을 생성합니다.
"""

from __future__ import annotations

import os
from pathlib import Path

from models.counseling import AIAnalysisResult, CounselingContent, ExtractedBackground, SelfIntroRequest
from models.output import SelfIntroResponse

_SERVICE_DIR = Path(__file__).resolve().parent
_DEFAULT_CHECKPOINT = _SERVICE_DIR / "checkpoints" / "resume_lm"
_RESUME_LM_MODEL = None
_RESUME_LM_TOKENIZER = None


def _get_resume_lm_checkpoint() -> Path | None:
    """학습된 모델 경로. 환경변수 → checkpoints/resume_lm → 프로젝트 루트 resume_lm."""
    path = os.environ.get("RESUME_LM_CHECKPOINT")
    if path and Path(path).exists():
        return Path(path)
    if _DEFAULT_CHECKPOINT.exists():
        return _DEFAULT_CHECKPOINT
    root_resume_lm = _SERVICE_DIR.parent / "resume_lm"
    if root_resume_lm.exists():
        return root_resume_lm
    return None


def _request_to_input_dict(request: SelfIntroRequest) -> dict:
    """API 요청을 모델 입력 dict로 변환."""
    request.validate()
    bg = request.ai_analysis.extracted_background
    return {
        "roles": list(request.ai_analysis.roles),
        "competencies": list(request.ai_analysis.competencies),
        "background": {
            "name": bg.name if bg else None,
            "education": (bg.education or "-") if bg else "-",
            "experiences": list(bg.experiences or []) if bg else [],
            "strengths": list(bg.strengths or []) if bg else [],
        },
    }


def create_self_introduction(request: SelfIntroRequest) -> SelfIntroResponse:
    """
    직무·역량·배경을 받아 파인튜닝 모델로 자기소개서 초안을 생성합니다.
    모델이 없으면 ValueError를 발생시킵니다.
    """
    path = _get_resume_lm_checkpoint()
    if path is None:
        raise ValueError(
            "파인튜닝 모델을 사용할 수 없습니다. "
            "RESUME_LM_CHECKPOINT 또는 mk_resume_model/checkpoints/resume_lm(또는 프로젝트 루트 resume_lm)을 확인하세요."
        )

    try:
        from inference_resume_lm import load_model, generate
    except ImportError as e:
        raise ValueError("inference_resume_lm 로드 실패. transformers 등 의존성을 설치했는지 확인하세요.") from e

    global _RESUME_LM_MODEL, _RESUME_LM_TOKENIZER
    if _RESUME_LM_MODEL is None:
        _RESUME_LM_TOKENIZER, _RESUME_LM_MODEL = load_model(path, use_cpu=True)

    input_dict = _request_to_input_dict(request)
    draft = generate(input_dict, _RESUME_LM_TOKENIZER, _RESUME_LM_MODEL)
    word_count = len(draft.replace(" ", "").replace("\n", ""))
    return SelfIntroResponse(
        draft=draft,
        reasoning="(파인튜닝 모델로 생성)",
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
    """간단 인자로 자기소개서 생성 (스크립트/폼용)."""
    counseling = CounselingContent(content=counseling_content)
    extracted = (
        ExtractedBackground(name=name, education=education, experiences=experiences, strengths=strengths)
        if any([name, education, experiences, strengths])
        else None
    )
    request = SelfIntroRequest(
        counseling=counseling,
        ai_analysis=AIAnalysisResult(roles=roles, competencies=competencies, extracted_background=extracted),
        language=language,
    )
    return create_self_introduction(request)
