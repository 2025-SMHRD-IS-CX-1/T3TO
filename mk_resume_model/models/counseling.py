"""
상담 기반 자기소개서 생성을 위한 입력 모델.

- CounselingContent: 상담 원문/요약
- ExtractedBackground: 상담에서 뽑은 이름·학력·경험·강점·가치관
- AIAnalysisResult: AI 분석 결과(추천 직무 + 역량 + 추출 배경)
- SelfIntroRequest: 위를 묶은 "자기소개서 한 번 생성해줘" 요청 전체 (API/서비스 진입점)
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional


@dataclass
class CounselingContent:
    """
    상담사가 입력한 내담자의 상담 컨텐츠.
    자기소개서 초안 작성 시 배경 정보 추출·검증에 활용됩니다.
    """

    content: str  # 상담 기록 전문 또는 요약 (텍스트 전체)
    session_date: Optional[str] = None  # 상담 일자 (예: "2025-02-14")
    notes: Optional[str] = None  # 상담사 메모 등


@dataclass
class ExtractedBackground:
    """
    AI가 상담 컨텐츠에서 추출한 내담자 배경 정보.
    있으면 adapter에서 CandidateBackground로 넘겨 생성기에 전달합니다.
    """

    name: Optional[str] = None  # 지원자 이름
    education: Optional[str] = None  # 학력 요약 (예: "OO대 컴퓨터공학")
    experiences: Optional[List[str]] = None  # 경험 목록 (예: ["데이터 분석 인턴 6개월"])
    strengths: Optional[List[str]] = None  # 강점 (예: ["문제해결", "커뮤니케이션"])
    career_values: Optional[str] = None  # 상담에서 추출한 가치관 (예: "책임감, 소통, 성장")


@dataclass
class AIAnalysisResult:
    """
    상담 컨텐츠를 AI로 분석한 결과.
    직무역량(competencies)과 추천분야(roles)가 필수이고, 배경 추출 결과는 선택.
    """

    roles: List[str]  # 추천 직무/분야 (예: ["데이터 분석가", "마케팅 전략가"])
    competencies: List[str]  # 직무역량 (예: ["데이터 분석", "문제해결", "커뮤니케이션"])
    extracted_background: Optional[ExtractedBackground] = None  # AI가 상담에서 추출한 배경 (없으면 None)


@dataclass
class SelfIntroRequest:
    """
    자기소개서 생성을 위한 전체 요청.
    웹 서비스 API에서 사용하는 통합 입력 모델. adapter가 이걸 SelfIntroInput으로 바꿉니다.
    """

    counseling: CounselingContent  # 상담 원문/요약
    ai_analysis: AIAnalysisResult  # 추천 직무·역량·(선택)추출 배경
    language: str = "ko"  # 출력 언어: "ko" | "en"
    min_word_count: int = 600  # 목표 최소 글자 수 (템플릿 생성기는 참고용)
    focus: str = "strength"  # 작성 초점: "strength"(역량) | "experience"(경험) | "values"(가치관)

    def validate(self) -> None:
        """필수 필드 검증. roles, competencies 비어 있으면 ValueError."""
        if not self.ai_analysis.roles:
            raise ValueError("추천 직무(roles)가 비어있습니다.")
        if not self.ai_analysis.competencies:
            raise ValueError("직무역량(competencies)이 비어있습니다.")
