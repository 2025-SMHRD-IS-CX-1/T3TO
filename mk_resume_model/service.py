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
from self_intro_generator import SelfIntroInput as DataclassSelfIntroInput, generate_self_introduction
from openai_generator import generate_with_openai, SelfIntroInput as OpenAISelfIntroInput

_SERVICE_DIR = Path(__file__).resolve().parent
_DEFAULT_CHECKPOINT = _SERVICE_DIR / "checkpoints" / "resume_lm"
# LM 로드 후 재사용 (전역 캐시)
_RESUME_LM_MODEL = None
_RESUME_LM_TOKENIZER = None


def _self_intro_input_to_dict(input_data: DataclassSelfIntroInput) -> dict:
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


def _try_create_with_resume_lm(input_data: DataclassSelfIntroInput) -> str | None:
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

        # transformers 등이 설치되지 않았거나 로드 중 문제가 있으면
        # 전체 요청을 실패시키지 않고 LM 단계만 건너뛴다.
        if _RESUME_LM_MODEL is None:
            _RESUME_LM_TOKENIZER, _RESUME_LM_MODEL = load_model(path, use_cpu=True)
        input_dict = _self_intro_input_to_dict(input_data)
        return generate(input_dict, _RESUME_LM_TOKENIZER, _RESUME_LM_MODEL)
    except ModuleNotFoundError as e:
        # 예: transformers 미설치 → LM 없이 OpenAI/템플릿만 사용
        print(f"[resume_lm] transformers not available, skipping fine-tuned LM: {e}")
        return None
    except Exception as e:
        print(f"[resume_lm] failed to use fine-tuned LM, fallback to other generators: {e}")
        return None


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

    # 1. 템플릿 기반 생성기로 항상 안전한 기본 초안을 만든다.
    template_result = generate_self_introduction(input_data)
    template_draft = template_result.draft
    template_word_count = len(template_draft.replace(" ", "").replace("\n", "")) if template_draft else 0

    # 2. 파인튜닝된 로컬 LM이 있으면 동일 입력으로 한 번 더 생성해 본다.
    #    (없으면 None 반환되어 이후 단계에서 템플릿 초안만 사용)
    lm_draft = _try_create_with_resume_lm(input_data)

    # 3. OpenAI가 있으면 위 두 결과를 "참고 초안"으로 넘겨 재작성 + 스코어링을 수행한다.
    api_key = os.environ.get("OPENAI_API_KEY")
    if api_key:
        try:
            model = os.environ.get("OPENAI_RESUME_MODEL", "gpt-4o-mini")

            base_blocks: list[str] = []
            if lm_draft:
                base_blocks.append("[로컬 LM 기반 초안]\n" + lm_draft)
            if template_draft:
                base_blocks.append("[템플릿 기반 초안]\n" + template_draft)
            base_draft = "\n\n".join(base_blocks) if base_blocks else ""

            # OpenAI 생성을 위한 입력 (Dataclass -> Pydantic)
            openai_input = OpenAISelfIntroInput(
                roles=input_data.roles,
                competencies=input_data.competencies,
                background={
                    "name": input_data.background.name,
                    "education": input_data.background.education,
                    "experiences": input_data.background.experiences or [],
                    "strengths": input_data.background.strengths or [],
                    "career_values": input_data.background.career_values,
                },
                counseling_content=request.counseling.content,
                language=input_data.language,
                focus=input_data.focus,
                min_word_count=request.min_word_count,
                base_draft=base_draft or None,
            )

            result = generate_with_openai(openai_input, api_key, model=model)

            # 요청된 focus(strength / experience / values)에 대응하는 버전을 우선 선택
            target_focus = input_data.focus
            focus_map = {
                "strength": "역량 중심",
                "experience": "경험 중심",
                "values": "가치관 중심",
            }
            target_title = focus_map.get(target_focus)

            selected_version = None
            if target_title:
                for v in result.versions:
                    if target_title in (v.title or ""):
                        selected_version = v
                        break

            # 매칭되는 타이틀이 없으면 scoring.average 기준으로 최고 점수를 선택
            if selected_version is None and result.versions:
                def _avg_score(ver) -> float:
                    scoring = getattr(ver, "scoring", None) or {}
                    try:
                        return float(scoring.get("average") or 0)
                    except (TypeError, ValueError):
                        return 0.0

                selected_version = max(result.versions, key=_avg_score)

            if selected_version is not None:
                reasoning = result.reasoning or ""
                prefix = "(OpenAI 재작성 + 템플릿/로컬 LM 기반)"
                if prefix not in reasoning:
                    reasoning = f"{prefix} {reasoning}".strip()

                word_count = len(selected_version.draft.replace(" ", "").replace("\n", ""))
                return SelfIntroResponse(
                    draft=selected_version.draft,
                    reasoning=reasoning,
                    word_count=word_count,
                    scoring=getattr(selected_version, "scoring", None),
                )
        except Exception as e:
            # 실패 시 아래 로컬 LM/템플릿 결과로 폴백
            print(f"OpenAI 생성 실패: {e}")

    # 4. OpenAI를 사용하지 못한 경우: 로컬 LM이 있으면 그 결과를,
    #    없으면 템플릿 기반 초안을 그대로 반환한다.
    if lm_draft:
        word_count = len(lm_draft.replace(" ", "").replace("\n", ""))
        return SelfIntroResponse(
            draft=lm_draft,
            reasoning="(학습된 모델로 생성)",
            word_count=word_count,
        )

    return SelfIntroResponse(
        draft=template_draft,
        reasoning=template_result.reasoning,
        word_count=template_word_count,
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
