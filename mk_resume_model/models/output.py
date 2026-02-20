"""
자기소개서 생성 결과 모델.

- API/서비스 레이어에서 자기소개서 생성 완료 후 클라이언트에 돌려줄 때 사용하는 데이터 구조.
- draft: 실제 자기소개서 본문, reasoning: 왜 이렇게 썼는지 설명(선택), word_count: 글자 수.
"""

from dataclasses import dataclass
from typing import Optional


@dataclass
class SelfIntroResponse:
    """
    자기소개서 생성 API 응답.
    생성기가 만든 초안과 메타정보를 담아 호출자에게 반환할 때 쓰는 모델.
    """

    draft: str  # 자기소개서 초안 본문 (최종 사용자가 보는 글 전체)
    reasoning: Optional[str] = None  # 추론 과정 (디버깅/검토용, 선택적. 학습된 LM 사용 시 "(학습된 모델로 생성)" 등)
    word_count: int = 0  # 생성된 글자 수 (공백·줄바꿈 제외, 한글 기준)
