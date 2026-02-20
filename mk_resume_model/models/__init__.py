"""
입력/출력 데이터 모델 정의 (자기소개서 파이프라인용).

- counseling: 상담 원문(CounselingContent), AI 분석 결과(AIAnalysisResult), 추출 배경(ExtractedBackground),
  그리고 이걸 묶은 API 요청(SelfIntroRequest).
- output: 생성 결과(SelfIntroResponse = draft, reasoning, word_count).
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
