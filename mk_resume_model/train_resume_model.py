# -*- coding: utf-8 -*-
"""
examples.jsonl 데이터로 자기소개서 생성 모델 fine-tuning.

- 입력: data/examples.jsonl (input, reference) 쌍
- 모델: Hugging Face 한국어 Causal LM (기본: skt/kogpt2-base-v2)
- 학습: prompt(직무/역량/배경) → reference(자기소개서 본문) 생성 학습

사용법:
  pip install -r requirements-train.txt
  python train_resume_model.py --data data/examples.jsonl --output_dir checkpoints/resume_lm
  python train_resume_model.py --epochs 3 --batch_size 2  # GPU 메모리 적을 때
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import torch
from datasets import Dataset
from transformers import (
    AutoConfig,
    AutoModelForCausalLM,
    AutoTokenizer,
    Trainer,
    TrainingArguments,
    default_data_collator,
)


SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_DATA = SCRIPT_DIR / "data" / "examples.jsonl"
DEFAULT_OUTPUT = SCRIPT_DIR / "checkpoints" / "resume_lm"
DEFAULT_MODEL = "skt/kogpt2-base-v2"

# 프롬프트/완성 구분자 (학습 시 loss는 완성 부분만)
PROMPT_PREFIX = "직무·역량·배경에 따른 자기소개서 초안을 작성하세요.\n\n"
INPUT_PREFIX = "[입력]\n"
OUTPUT_PREFIX = "\n[자기소개서]\n"
EOS = "<|endoftext|>"


def serialize_input(inp: dict) -> str:
    """모델 입력용 문자열로 변환."""
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


def load_examples(path: Path) -> list[dict]:
    examples = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            examples.append(json.loads(line))
    return examples


def build_texts(examples: list[dict], max_reference_len: int = 2048) -> list[str]:
    """각 예시를 'prompt + completion' 한 문자열로. 학습 시 completion 부분에만 loss."""
    texts = []
    for ex in examples:
        inp = ex.get("input") or {}
        ref = (ex.get("reference") or "").strip()
        if len(ref) < 50:
            continue
        if max_reference_len and len(ref) > max_reference_len:
            ref = ref[:max_reference_len] + "..."
        prompt_part = (
            PROMPT_PREFIX
            + INPUT_PREFIX
            + serialize_input(inp)
            + OUTPUT_PREFIX
        )
        full = prompt_part + ref + EOS
        texts.append(full)
    return texts


def tokenize_for_causal_lm(
    tokenizer,
    texts: list[str],
    max_length: int = 1024,
    prompt_prefix_len: int | None = None,
):
    """
    토큰화 후 input_ids, labels 반환.
    labels에서 prompt 부분은 -100으로 마스크해 loss 미계산.
    """
    out = tokenizer(
        texts,
        truncation=True,
        max_length=max_length,
        padding="max_length",
        return_tensors=None,
    )
    input_ids = out["input_ids"]
    attention_mask = out["attention_mask"]
    labels = [list(ids) for ids in input_ids]

    # prompt 구간은 -100으로 해서 loss 제외 (completion만 학습)
    if prompt_prefix_len is None:
        # 대략 첫 1/3을 prompt로 간주하거나, [자기소개서] 직후부터만 loss
        prompt_prefix_len = max_length // 3
    for i, ids in enumerate(input_ids):
        for j in range(min(prompt_prefix_len, len(ids))):
            labels[i][j] = -100
        # padding 위치도 -100
        for j in range(len(ids)):
            if attention_mask[i][j] == 0:
                labels[i][j] = -100

    return {
        "input_ids": input_ids,
        "attention_mask": attention_mask,
        "labels": labels,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=str, default=str(DEFAULT_DATA), help="examples.jsonl 경로")
    parser.add_argument("--output_dir", type=str, default=str(DEFAULT_OUTPUT), help="체크포인트 저장 경로")
    parser.add_argument("--model_name", type=str, default=DEFAULT_MODEL, help="pretrained 모델명")
    parser.add_argument("--epochs", type=int, default=5)
    parser.add_argument("--batch_size", type=int, default=4)
    parser.add_argument("--lr", type=float, default=5e-5)
    parser.add_argument("--max_length", type=int, default=1024)
    parser.add_argument("--max_reference_len", type=int, default=1536, help="reference 최대 글자 수")
    parser.add_argument("--prompt_token_len", type=int, default=180, help="prompt 구간 토큰 수 (이전은 loss 제외)")
    args = parser.parse_args()

    data_path = Path(args.data)
    if not data_path.exists():
        raise FileNotFoundError(f"데이터 파일 없음: {data_path}. 먼저 build_input_from_crawl.py로 examples.jsonl을 생성하세요.")

    examples = load_examples(data_path)
    texts = build_texts(examples, max_reference_len=args.max_reference_len)
    if not texts:
        raise ValueError("유효한 (input, reference) 쌍이 없습니다.")

    print(f"학습 샘플 수: {len(texts)}")
    tokenizer = AutoTokenizer.from_pretrained(args.model_name)
    # KoGPT2 일부는 pad_token 없음
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    tokenized = tokenize_for_causal_lm(
        tokenizer,
        texts,
        max_length=args.max_length,
        prompt_prefix_len=args.prompt_token_len,
    )
    dataset = Dataset.from_dict(tokenized)

    config = AutoConfig.from_pretrained(args.model_name)
    model = AutoModelForCausalLM.from_pretrained(args.model_name, config=config)

    training_args = TrainingArguments(
        output_dir=args.output_dir,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        learning_rate=args.lr,
        warmup_ratio=0.1,
        logging_steps=10,
        save_strategy="epoch",
        save_total_limit=2,
        fp16=torch.cuda.is_available(),
        report_to="none",
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=dataset,
        data_collator=default_data_collator,
    )

    trainer.train()
    trainer.save_model(args.output_dir)
    tokenizer.save_pretrained(args.output_dir)
    print(f"학습 완료. 모델·토크나이저 저장: {args.output_dir}")


if __name__ == "__main__":
    main()
