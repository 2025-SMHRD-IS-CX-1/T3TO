# -*- coding: utf-8 -*-
"""
크롤링한 자기소개서 텍스트 파일을 파싱해서 (input, reference) 쌍으로 만듭니다.

1) 메타데이터만 사용: 회사/직무/학교/전공 라인에서 roles, background 일부 추출
2) OpenAI 사용 시: 본문에서 competencies, background 상세 역추출 (OPENAI_API_KEY 필요)

사용법:
  python build_input_from_crawl.py [크롤링파일경로] [--output 출력.jsonl] [--use-llm]
  예: python build_input_from_crawl.py "C:\\Users\\SMHRD\\Desktop\\자기소개서크롤링100.txt" --output data/examples.jsonl
  예: python build_input_from_crawl.py "C:\\Users\\SMHRD\\Desktop\\자기소개서크롤링100.txt" --use-llm --output data/examples.jsonl
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

# 프로젝트 루트 기준 상대 경로
SCRIPT_DIR = Path(__file__).resolve().parent
def _default_crawl_path() -> Path:
    if os.environ.get("CRAWL_TXT_PATH"):
        return Path(os.environ["CRAWL_TXT_PATH"]).expanduser()
    # 바탕화면
    p = Path.home() / "Desktop" / "자기소개서크롤링100.txt"
    if p.exists():
        return p
    # 프로젝트 data 폴더에 복사해 둔 경우
    p = SCRIPT_DIR / "data" / "자기소개서크롤링100.txt"
    if p.exists():
        return p
    return Path.home() / "Desktop" / "자기소개서크롤링100.txt"


DEFAULT_OUTPUT = SCRIPT_DIR / "data" / "examples.jsonl"

# 엔트리 시작 라인 패턴: "회사명 / 직무 / 2023 상반기" 형태
ENTRY_HEADER_RE = re.compile(r"^([^/\n]+)\s*/\s*([^/]+)\s*/\s*(\d{4}\s*[상하]반기)\s*$")


def parse_crawl_file(path: str | Path) -> list[dict]:
    """
    크롤링 txt 파일을 읽어서 엔트리 리스트로 반환.
    각 엔트리: {"header_line", "meta_line", "body_text", "company", "job", "period"}
    """
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"파일 없음: {path}")

    text = path.read_text(encoding="utf-8")
    lines = text.split("\n")

    entries: list[dict] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        m = ENTRY_HEADER_RE.match(line.strip())
        if m:
            company, job, period = m.group(1).strip(), m.group(2).strip(), m.group(3).strip()
            meta_line = ""
            if i + 1 < len(lines):
                meta_line = lines[i + 1].strip()
                i += 1
            # 본문 수집: 다음 엔트리 헤더가 나오기 전까지
            body_lines: list[str] = []
            i += 1
            while i < len(lines):
                if ENTRY_HEADER_RE.match(lines[i].strip()):
                    break
                body_lines.append(lines[i])
                i += 1
            body_text = "\n".join(body_lines).strip()
            # 본문이 너무 짧으면 스킵 (헤더만 있는 경우)
            if len(body_text) < 100:
                i += 1
                continue
            entries.append({
                "company": company,
                "job": job,
                "period": period,
                "header_line": line.strip(),
                "meta_line": meta_line,
                "body_text": body_text,
            })
            continue
        i += 1
    return entries


def parse_meta_line(meta_line: str) -> dict:
    """메타 라인에서 학교, 전공, 학점 등 추출. 형식: 학교 / 학과 / 학점 4.1/4.5 / ..."""
    parts = [p.strip() for p in meta_line.split("/")]
    school = parts[0] if parts else ""
    major = parts[1] if len(parts) > 1 else ""
    education = f"{school} {major}".strip() or "관련 전공"
    # 나머지에서 인턴/경험 키워드 추출
    rest = " ".join(parts[2:]) if len(parts) > 2 else ""
    experiences: list[str] = []
    if "인턴" in rest:
        experiences.append("인턴 경험")
    if "공모전" in rest:
        experiences.append("공모전 수상")
    return {"education": education, "experiences": experiences, "raw": meta_line}


def job_to_roles_and_competencies(job: str) -> tuple[list[str], list[str]]:
    """직무 문자열에서 roles 후보, competencies 후보 매핑 (간단 규칙)."""
    role = job.split("(")[0].split("_")[0].strip()
    if not role:
        role = "일반직"
    roles = [role]

    comp_map = {
        "마케팅": ["마케팅", "데이터 분석", "커뮤니케이션"],
        "기획": ["기획", "커뮤니케이션", "문제해결"],
        "영업": ["영업", "커뮤니케이션", "협업"],
        "디지털": ["디지털", "데이터 분석", "커뮤니케이션"],
        "PD": ["기획", "커뮤니케이션", "협업"],
        "엔지니어": ["문제해결", "기술", "협업"],
        "반도체": ["기술", "문제해결", "협업"],
        "금융": ["분석", "커뮤니케이션", "문제해결"],
        "재무": ["재무", "분석", "문제해결"],
        "품질": ["품질관리", "문제해결", "협업"],
        "IT": ["기술", "문제해결", "협업"],
    }
    competencies = ["커뮤니케이션", "문제해결"]
    for key, comps in comp_map.items():
        if key in job or key in role:
            competencies = comps
            break
    return roles, competencies


def build_input_from_metadata(entry: dict) -> dict:
    """엔트리에서 메타데이터만으로 input dict 생성 (모델 입력 형식)."""
    meta = parse_meta_line(entry.get("meta_line", ""))
    roles, competencies = job_to_roles_and_competencies(entry.get("job", ""))
    return {
        "roles": roles,
        "competencies": competencies,
        "background": {
            "name": None,
            "education": meta.get("education") or "관련 전공",
            "experiences": meta.get("experiences") or [],
            "strengths": competencies[:2],
            "career_values": None,
        },
        "language": "ko",
        "focus": "strength",
    }


def extract_input_with_openai(entry: dict) -> dict | None:
    """OpenAI API로 본문에서 roles, competencies, background 역추출. 실패 시 None."""
    try:
        from openai import OpenAI
    except ImportError:
        return None
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return None

    body = (entry.get("body_text") or "")[:6000]
    if not body:
        return None

    client = OpenAI(api_key=api_key)
    prompt = """다음은 채용 자기소개서 본문입니다. 아래 JSON 형식으로만 답하세요. 다른 설명 금지.
- roles: 지원 직무 1~2개 (한글, 예: ["마케팅", "기획"])
- competencies: 직무 역량 3~5개 (한글, 예: ["마케팅", "데이터 분석", "커뮤니케이션"])
- background: { "name": null, "education": "전공/학교 요약", "experiences": ["경험1","경험2"], "strengths": ["강점1","강점2"], "career_values": "가치관 한 줄 또는 null" }

자기소개서 본문:
"""
    try:
        resp = client.chat.completions.create(
            model=os.environ.get("OPENAI_EXTRACT_MODEL", "gpt-4o-mini"),
            messages=[{"role": "user", "content": prompt + body}],
            temperature=0,
        )
        text = (resp.choices[0].message.content or "").strip()
        # JSON 블록만 추출
        if "```" in text:
            for part in text.split("```"):
                part = part.strip()
                if part.startswith("json"):
                    part = part[4:].strip()
                if part.startswith("{"):
                    data = json.loads(part)
                    break
        else:
            data = json.loads(text)
        # 우리 input 형식으로
        roles = data.get("roles") or [entry.get("job", "일반직").split("(")[0].strip()]
        competencies = data.get("competencies") or ["커뮤니케이션", "문제해결"]
        bg = data.get("background") or {}
        return {
            "roles": roles if isinstance(roles, list) else [roles],
            "competencies": competencies if isinstance(competencies, list) else [competencies],
            "background": {
                "name": bg.get("name"),
                "education": bg.get("education") or "관련 전공",
                "experiences": bg.get("experiences") or [],
                "strengths": bg.get("strengths") or competencies[:2],
                "career_values": bg.get("career_values"),
            },
            "language": "ko",
            "focus": "strength",
        }
    except Exception:
        return None


def main():
    parser = argparse.ArgumentParser(description="크롤링 txt → (input, reference) JSONL 생성")
    parser.add_argument(
        "crawl_path",
        nargs="?",
        default="",
        help="크롤링한 자기소개서 txt 파일 경로 (비우면 바탕화면 또는 data/ 자동 탐색)",
    )
    parser.add_argument(
        "--output", "-o",
        default=str(DEFAULT_OUTPUT),
        help="출력 JSONL 파일 경로",
    )
    parser.add_argument(
        "--use-llm",
        action="store_true",
        help="OpenAI로 본문에서 input 역추출 (OPENAI_API_KEY 필요)",
    )
    parser.add_argument(
        "--max-entries",
        type=int,
        default=0,
        help="처리할 최대 엔트리 수 (0=전체)",
    )
    args = parser.parse_args()

    crawl_path = Path(args.crawl_path).expanduser() if args.crawl_path else _default_crawl_path()
    if not crawl_path.exists():
        print(f"오류: 파일을 찾을 수 없습니다. {crawl_path}", file=sys.stderr)
        print("사용 예: python build_input_from_crawl.py \"C:\\Users\\SMHRD\\Desktop\\자기소개서크롤링100.txt\" -o data/examples.jsonl", file=sys.stderr)
        sys.exit(1)

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    entries = parse_crawl_file(crawl_path)
    if args.max_entries:
        entries = entries[: args.max_entries]
    print(f"총 {len(entries)}개 엔트리 파싱됨. 출력: {out_path}")

    use_llm = args.use_llm and os.environ.get("OPENAI_API_KEY")
    if args.use_llm and not os.environ.get("OPENAI_API_KEY"):
        print("경고: OPENAI_API_KEY 없음. 메타데이터만 사용합니다.", file=sys.stderr)

    written = 0
    with open(out_path, "w", encoding="utf-8") as f:
        for i, entry in enumerate(entries):
            if use_llm:
                inp = extract_input_with_openai(entry)
                if inp is None:
                    inp = build_input_from_metadata(entry)
            else:
                inp = build_input_from_metadata(entry)
            ref = entry.get("body_text", "")
            if len(ref) < 50:
                continue
            record = {"input": inp, "reference": ref}
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
            written += 1
            if (i + 1) % 20 == 0:
                print(f"  {i + 1}/{len(entries)} 처리됨")

    print(f"완료: {written}개 (input, reference) 쌍 저장 → {out_path}")


if __name__ == "__main__":
    main()
