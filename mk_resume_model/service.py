"""
자기소개서 생성 서비스 레이어.

- 진입점: create_self_introduction(request) — 상담 기반 요청을 받아 자기소개서 초안을 반환.
- 동작: (1) adapter로 SelfIntroRequest → SelfIntroInput 변환
        (2) checkpoints/resume_lm 있으면 파인튜닝 LM으로 생성
        (3) 없으면 self_intro_generator(템플릿 기반)로 생성
- create_self_introduction_simple: 인자만 넣어서 빠르게 호출할 때 사용.
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
# LM 로드 후 재사용 (전역 캐시)
_RESUME_LM_MODEL = None
_RESUME_LM_TOKENIZER = None


def _self_intro_input_to_dict(input_data: SelfIntroInput) -> dict:
    """생성기 입력을 inference_resume_lm.generate()에 넘길 때 쓰는 dict 형식으로 변환."""
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
    """파인튜닝된 resume_lm 체크포인트 경로. RESUME_LM_CHECKPOINT 환경변수 우선, 없으면 checkpoints/resume_lm."""
    path = os.environ.get("RESUME_LM_CHECKPOINT")
    if path and Path(path).exists():
        return Path(path)
    if _DEFAULT_CHECKPOINT.exists():
        return _DEFAULT_CHECKPOINT
    return None


def _try_create_with_resume_lm(input_data: SelfIntroInput) -> str | None:
    """
    파인튜닝 LM으로 자기소개서 본문 생성 시도.
    체크포인트 없거나 inference_resume_lm 임포트 실패 시 None 반환.
    성공 시 생성된 텍스트(본문만) 반환.
    """
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
    1) to_self_intro_input으로 SelfIntroInput 변환
    2) resume_lm 체크포인트 있으면 LM 생성, 없으면 템플릿 생성기 사용
    3) draft + reasoning + word_count 로 SelfIntroResponse 반환

    Args:
        request: 상담 컨텐츠, AI 분석 결과, 언어/글자수/초점 포함

    Returns:
        SelfIntroResponse: draft(본문), reasoning(선택), word_count
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
    CounselingContent / AIAnalysisResult / SelfIntroRequest 를 내부에서 조립한 뒤 create_self_introduction 호출.
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
