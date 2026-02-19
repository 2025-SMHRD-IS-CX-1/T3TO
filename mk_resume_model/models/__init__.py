"""
입력/출력 데이터 모델 정의.
상담 컨텐츠, AI 분석 결과, 자기소개서 생성 입력/출력을 포함합니다.
"""

from .counseling import (
    CounselingContent,
    AIAnalysisResult,
    ExtractedBackground,
    SelfIntroRequest,
)
from .output import SelfIntroResponse

__all__ = [
    "CounselingContent",
    "AIAnalysisResult",
    "ExtractedBackground",
    "SelfIntroRequest",
    "SelfIntroResponse",
]
