# -*- coding: utf-8 -*-
"""
파인튜닝된 resume_lm 체크포인트로 자기소개서 생성.
train_resume_model.py와 동일한 프롬프트 형식 사용.
"""
from __future__ import annotations

from pathlib import Path

# train_resume_model.py와 동일한 구분자
PROMPT_PREFIX = "직무·역량·배경에 따른 자기소개서 초안을 작성하세요.\n\n"
INPUT_PREFIX = "[입력]\n"
OUTPUT_PREFIX = "\n[자기소개서]\n"
EOS = "<|endoftext|>"


def _serialize_input(inp: dict) -> str:
    """모델 입력용 문자열로 변환 (train_resume_model.serialize_input과 동일)."""
    roles = inp.get("roles") or []
    comps = inp.get("competencies") or []
    bg = inp.get("background") or {}
    parts = [
        "직무: " + ", ".join(roles),
        "역량: " + ", ".join(comps),
        "학력: " + (bg.get("education") or "-"),
        "경험: " + ", ".join(bg.get("experiences") or []),
        "강점: " + ", ".join(bg.get("strengths") or []),
    ]
    return "\n".join(parts)


def load_model(checkpoint_path: str | Path, *, use_cpu: bool = False):
    """체크포인트에서 토크나이저와 모델 로드."""
    from transformers import AutoModelForCausalLM, AutoTokenizer

    path = Path(checkpoint_path)
    if not path.exists():
        raise FileNotFoundError(f"체크포인트 없음: {path}")

    tokenizer = AutoTokenizer.from_pretrained(path)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(path)
    if use_cpu:
        model = model.to("cpu")
    else:
        import torch
        model = model.to("cuda" if torch.cuda.is_available() else "cpu")

    return tokenizer, model


def generate(
    input_dict: dict,
    tokenizer,
    model,
    *,
    max_new_tokens: int = 512,
    do_sample: bool = True,
    temperature: float = 0.8,
    top_p: float = 0.95,
    pad_token_id: int | None = None,
) -> str:
    """
    input_dict(roles, competencies, background)로 프롬프트를 만들고
    [자기소개서] 뒤부터 EOS 전까지 생성해 반환.
    """
    import torch

    prompt_part = (
        PROMPT_PREFIX
        + INPUT_PREFIX
        + _serialize_input(input_dict)
        + OUTPUT_PREFIX
    )
    if pad_token_id is None:
        pad_token_id = tokenizer.pad_token_id or tokenizer.eos_token_id

    inputs = tokenizer(
        prompt_part,
        return_tensors="pt",
        truncation=True,
        max_length=1024,
    )
    device = next(model.parameters()).device
    inputs = {k: v.to(device) for k, v in inputs.items()}

    with torch.no_grad():
        out = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            do_sample=do_sample,
            temperature=temperature,
            top_p=top_p,
            pad_token_id=pad_token_id,
            eos_token_id=tokenizer.eos_token_id,
        )

    full = tokenizer.decode(out[0], skip_special_tokens=False)
    # [자기소개서] 뒤만 추출, EOS 전까지
    if OUTPUT_PREFIX in full:
        text = full.split(OUTPUT_PREFIX, 1)[1]
    else:
        text = full
    if EOS in text:
        text = text.split(EOS)[0]
    return text.strip()
