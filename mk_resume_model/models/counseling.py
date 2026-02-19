"""
상담 기반 자기소개서 생성을 위한 입력 모델.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional


@dataclass
class CounselingContent:
    """
    상담사가 입력한 내담자의 상담 컨텐츠.
    - 자기소개서 초안 작성 시 배경 정보 추출에 활용됩니다.
    """

    content: str  # 상담 기록 전문 또는 요약
    session_date: Optional[str] = None  # 상담 일자 (예: "2025-02-14")
    notes: Optional[str] = None  # 상담사 메모 등


@dataclass
class ExtractedBackground:
    """
    AI가 상담 컨텐츠에서 추출한 내담자 배경 정보.
    """

    name: Optional[str] = None
    education: Optional[str] = None
    experiences: Optional[List[str]] = None
    strengths: Optional[List[str]] = None
    career_values: Optional[str] = None  # 상담에서 추출한 가치관 (예: "책임감, 소통, 성장")


@dataclass
class AIAnalysisResult:
    """
    상담 컨텐츠를 AI로 분석한 결과.
    - 직무역량(competencies)과 추천분야(roles)를 포함합니다.
    """

    roles: List[str]  # 추천 직무/분야 (예: ["데이터 분석가", "마케팅 전략가"])
    competencies: List[str]  # 직무역량 (예: ["데이터 분석", "문제해결", "커뮤니케이션"])
    extracted_background: Optional[ExtractedBackground] = None  # AI가 상담에서 추출한 배경 정보


@dataclass
class SelfIntroRequest:
    """
    자기소개서 생성을 위한 요청 (파인튜닝 모델용).
    """

    counseling: CounselingContent
    ai_analysis: AIAnalysisResult
    language: str = "ko"

    def validate(self) -> None:
        """필수 필드 검증."""
        if not self.ai_analysis.roles:
            raise ValueError("추천 직무(roles)가 비어있습니다.")
        if not self.ai_analysis.competencies:
            raise ValueError("직무역량(competencies)이 비어있습니다.")
