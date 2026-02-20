"""
상담 기반 요청 → 자기소개서 생성 입력으로 변환하는 어댑터.

- 웹/API에서 받는 SelfIntroRequest(상담+AI분석+언어/글자수/초점)를
  self_intro_generator가 쓰는 SelfIntroInput(roles, competencies, background, language, focus)으로 바꿉니다.
- 배경 정보는 AI 추출 결과(ExtractedBackground)가 있으면 쓰고, 없으면 전부 None으로 둡니다.
"""

from __future__ import annotations

from typing import List, Literal, Optional

from models.counseling import AIAnalysisResult, CounselingContent, ExtractedBackground, SelfIntroRequest
from self_intro_generator import CandidateBackground, SelfIntroInput

# 출력 언어: "ko" | "en"
Language = Literal["ko", "en"]


def _to_candidate_background(
    counseling: CounselingContent,
    extracted: Optional[ExtractedBackground],
) -> CandidateBackground:
    """
    상담 컨텐츠와 AI 추출 배경을 CandidateBackground로 변환.
    - extracted 있음 → 그대로 name/education/experiences/strengths/career_values 매핑
    - 없음 → 전부 None (향후 상담 원문 NLP로 채울 수 있음, 현재는 기본값)
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
    API/서비스에서 받은 SelfIntroRequest를 생성기 입력 SelfIntroInput으로 변환.
    - validate()로 roles, competencies 비어 있으면 예외
    - language는 "ko" 아니면 "en", focus는 strength/experience/values 중 하나로 정규화
    """
    request.validate()

    background = _to_candidate_background(
        request.counseling,
        request.ai_analysis.extracted_background,
    )

    lang: Language = "ko" if request.language == "ko" else "en"

    # focus: 역량/경험/가치관 중 하나. 잘못된 값이면 "strength"로 폴백
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
