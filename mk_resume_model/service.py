"""
자기소개서 생성 서비스 레이어.
상담 기반 요청을 받아 자기소개서 초안을 생성합니다.
웹 API와 직접 호출 모두에서 사용할 수 있도록 모듈화되어 있습니다.
"""

from __future__ import annotations

from models.counseling import AIAnalysisResult, CounselingContent, ExtractedBackground, SelfIntroRequest
from models.output import SelfIntroResponse
from adapter import to_self_intro_input
from self_intro_generator import generate_self_introduction


def create_self_introduction(request: SelfIntroRequest) -> SelfIntroResponse:
    """
    상담 기반 요청을 받아 자기소개서 초안을 생성합니다.

    Args:
        request: 상담 컨텐츠, AI 분석 결과, 언어 등이 포함된 요청

    Returns:
        SelfIntroResponse: 생성된 자기소개서 초안 및 메타데이터
    """
    input_data = to_self_intro_input(request)
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
