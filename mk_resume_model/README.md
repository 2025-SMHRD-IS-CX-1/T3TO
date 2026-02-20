# 자기소개서 생성 모델 (상담 기반)

상담사가 입력한 내담자의 상담 컨텐츠와 AI 분석된 직무역량/추천분야를 바탕으로 자기소개서 초안을 생성하는 모듈입니다.

## 구조

```
mk_resume_model/
├── self_intro_generator.py   # 자기소개서 생성 핵심 로직 (기존 형식 유지)
├── models/                   # 입력/출력 데이터 모델
│   ├── counseling.py         # 상담 컨텐츠, AI 분석 결과
│   └── output.py             # 생성 결과
├── adapter.py                # 상담 요청 → 생성기 입력 변환
├── service.py                # 서비스 레이어 (모듈화된 진입점)
├── api.py                    # FastAPI 웹 서비스
├── requirements.txt
└── README.md
```

## 흐름

1. **상담 컨텐츠** (`CounselingContent`): 상담사가 입력한 내담자 상담 기록
2. **AI 분석 결과** (`AIAnalysisResult`): 직무역량(`competencies`), 추천분야(`roles`), (선택) 추출된 배경 정보
3. **어댑터** (`adapter.to_self_intro_input`): 위 데이터를 `SelfIntroInput`으로 변환
4. **생성기** (`self_intro_generator.generate_self_introduction`): 기존 형식의 자기소개서 초안 생성
5. **응답**: 자기소개서 본문, 추론 과정, 글자 수

## 사용법

### 1. Python 코드에서 직접 호출

```python
from models.counseling import (
    CounselingContent,
    AIAnalysisResult,
    ExtractedBackground,
    SelfIntroRequest,
)
from service import create_self_introduction

counseling = CounselingContent(
    content="내담자는 데이터 분석에 관심이 많고, 팀 프로젝트에서 리더 역할을 수행한 경험이 있습니다."
)
ai_analysis = AIAnalysisResult(
    roles=["데이터 분석가"],
    competencies=["데이터 분석", "문제해결", "커뮤니케이션"],
    extracted_background=ExtractedBackground(
        name="홍길동",
        education="컴퓨터공학 전공",
        experiences=["데이터 분석 인턴 6개월", "동아리 회장 1년"],
        strengths=["문제해결", "커뮤니케이션"],
    ),
)
request = SelfIntroRequest(
    counseling=counseling,
    ai_analysis=ai_analysis,
    language="ko",
)
result = create_self_introduction(request)
print(result.draft)
```

### 2. 간단한 호출 (함수만 사용)

```python
from service import create_self_introduction_simple

result = create_self_introduction_simple(
    counseling_content="상담 내용...",
    roles=["데이터 분석가", "마케팅 전략가"],
    competencies=["데이터 분석", "문제해결"],
    name="홍길동",
    education="경영학 전공",
    experiences=["인턴 6개월"],
)
print(result.draft)
```

### 3. 웹 API 서버 실행

```bash
pip install -r requirements.txt
uvicorn api:app --host 0.0.0.0 --port 8000
```

### 4. API 호출 예시

```bash
curl -X POST http://localhost:8000/api/self-intro/generate \
  -H "Content-Type: application/json" \
  -d '{
    "counseling": {
      "content": "내담자는 데이터 분석에 관심이 있습니다."
    },
    "ai_analysis": {
      "roles": ["데이터 분석가"],
      "competencies": ["데이터 분석", "문제해결", "커뮤니케이션"],
      "extracted_background": {
        "name": "홍길동",
        "education": "컴퓨터공학 전공",
        "experiences": ["인턴 6개월"],
        "strengths": ["문제해결"]
      }
    },
    "language": "ko"
  }'
```

## 웹 서비스 연동

- **엔드포인트**: `POST /api/self-intro/generate`
- **헬스 체크**: `GET /health`
- **Swagger 문서**: `http://localhost:8000/docs`
- 다른 웹 서비스에서는 `api:app`을 ASGI 서브앱으로 마운트하거나, 이 서비스를 별도 마이크로서비스로 배포할 수 있습니다.

### T3TO(Next.js) 자기소개서 페이지 연동

- 프로젝트 루트의 `.env.local`에 다음을 설정하면, **AI 생성(3버전)** 시 이 모델이 우선 사용됩니다.
- `MK_RESUME_MODEL_API_URL=http://localhost:8000` (서버 실행 주소)
- 서버 실행: `cd mk_resume_model && pip install -r requirements.txt && uvicorn api:app --host 0.0.0.0 --port 8000`
- 미설정 또는 호출 실패 시 기존 RAG API / 템플릿으로 폴백됩니다.

## 모델 학습 (Fine-tuning)

`data/examples.jsonl`(input·reference 쌍)이 있으면 **학습 가능한 생성 모델**을 fine-tuning할 수 있습니다.

### 1. 데이터 준비

- 크롤링 txt가 있으면: `python build_input_from_crawl.py` → `data/examples.jsonl` 생성
- 없으면 `build_input_from_crawl.py` 상단 docstring 참고

### 2. 학습 실행

```bash
cd mk_resume_model
pip install -r requirements-train.txt
python train_resume_model.py --data data/examples.jsonl --output_dir checkpoints/resume_lm
```

- **GPU**: 있으면 자동 사용. 없으면 CPU로도 동작하지만 느림.
- **메모리 부족 시**: `--batch_size 2 --max_length 512`
- **에폭/학습률**: `--epochs 3 --lr 3e-5`

### 3. 학습 후

- 체크포인트: `checkpoints/resume_lm/` (config, pytorch_model.bin, tokenizer)
- 이 모델을 사용하는 추론 스크립트/API는 별도 연동 필요 (현재 api는 템플릿 생성기 사용)
