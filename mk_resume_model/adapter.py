"""
상담 기반 요청 → 자기소개서 생성 입력으로 변환하는 어댑터.
웹 서비스에서 받은 SelfIntroRequest를 self_intro_generator가 사용하는
SelfIntroInput 형식으로 변환합니다.
"""

from __future__ import annotations

from typing import List, Literal, Optional

from models.counseling import AIAnalysisResult, CounselingContent, ExtractedBackground, SelfIntroRequest
from self_intro_generator import CandidateBackground, SelfIntroInput

Language = Literal["ko", "en"]


def _to_candidate_background(
    counseling: CounselingContent,
    extracted: Optional[ExtractedBackground],
) -> CandidateBackground:
    """
    상담 컨텐츠와 AI 추출 배경을 CandidateBackground로 변환합니다.
    AI 추출 배경이 있으면 우선 사용하고, 없으면 상담 내용에서 기본값을 사용합니다.
    """
    if extracted:
        return CandidateBackground(
            name=extracted.name,
            education=extracted.education,
            experiences=extracted.experiences,
            strengths=extracted.strengths,
            career_values=extracted.career_values,
        )

    # AI 추출 배경이 없을 때: 상담 내용은 향후 NLP로 추출 가능하며, 현재는 기본값 사용
    return CandidateBackground(
        name=None,
        education=None,
        experiences=None,
        strengths=None,
        career_values=None,
    )


def to_self_intro_input(request: SelfIntroRequest) -> SelfIntroInput:
    """
    SelfIntroRequest를 SelfIntroInput으로 변환합니다.
    """
    request.validate()

    background = _to_candidate_background(
        request.counseling,
        request.ai_analysis.extracted_background,
    )

    lang: Language = "ko" if request.language == "ko" else "en"

    focus = (request.focus or "strength").strip().lower()
    if focus not in ("strength", "experience", "values"):
        focus = "strength"

    return SelfIntroInput(
        roles=request.ai_analysis.roles,
        competencies=request.ai_analysis.competencies,
        background=background,
        language=lang,
        min_word_count=request.min_word_count,
        focus=focus,
    )
