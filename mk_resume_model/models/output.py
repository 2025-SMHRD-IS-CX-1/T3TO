"""
자기소개서 생성 결과 모델.
"""

from dataclasses import dataclass
from typing import Optional


@dataclass
class SelfIntroResponse:
    """
    자기소개서 생성 API 응답.
    """

    draft: str  # 자기소개서 초안 본문
    reasoning: Optional[str] = None  # 추론 과정 (디버깅/검토용, 선택적)
    word_count: int = 0  # 생성된 글자 수
