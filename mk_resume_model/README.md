# 자기소개서 생성 (파인튜닝 모델)

직무·역량·배경을 입력하면 파인튜닝된 KoGPT2 기반 모델로 자기소개서 초안을 생성합니다.

## 구조

```
mk_resume_model/
├── service.py              # 서비스 레이어 (요청 → 모델 호출)
├── inference_resume_lm.py  # 모델 로드 및 생성
├── api.py                  # FastAPI 웹 서비스
├── models/
│   ├── counseling.py       # 요청 모델 (roles, competencies, background)
│   └── output.py           # 응답 모델
├── requirements.txt
├── build_input_from_crawl.py  # 학습 데이터 준비 (크롤링 → examples.jsonl)
├── train_resume_model.py      # 파인튜닝 스크립트
└── README.md
```

## 흐름

1. **요청**: `counseling` + `ai_analysis`(roles, competencies, extracted_background)
2. **서비스**: 요청을 모델 입력 dict로 변환 후 `inference_resume_lm.generate()` 호출
3. **응답**: 자기소개서 본문(draft), 글자 수

모델이 없으면(체크포인트 미설정) API는 400 에러를 반환합니다.

## 사용법

### 1. Python에서 직접 호출

```python
from models.counseling import (
    CounselingContent,
    AIAnalysisResult,
    ExtractedBackground,
    SelfIntroRequest,
)
from service import create_self_introduction

request = SelfIntroRequest(
    counseling=CounselingContent(content="상담 요약..."),
    ai_analysis=AIAnalysisResult(
        roles=["데이터 분석가"],
        competencies=["데이터 분석", "문제해결", "커뮤니케이션"],
        extracted_background=ExtractedBackground(
            name="홍길동",
            education="컴퓨터공학 전공",
            experiences=["인턴 6개월"],
            strengths=["문제해결"],
        ),
    ),
    language="ko",
)
result = create_self_introduction(request)
print(result.draft)
```

### 2. 간단 호출

```python
from service import create_self_introduction_simple

result = create_self_introduction_simple(
    counseling_content="상담 내용...",
    roles=["데이터 분석가"],
    competencies=["데이터 분석", "문제해결"],
    name="홍길동",
    education="경영학 전공",
    experiences=["인턴 6개월"],
)
print(result.draft)
```

### 3. API 서버

```bash
pip install -r requirements.txt
# 추론용: transformers, torch 등 (requirements.txt에 포함 또는 별도 설치)
uvicorn api:app --host 0.0.0.0 --port 8000
```

모델 경로: `RESUME_LM_CHECKPOINT` 환경변수, 또는 `mk_resume_model/checkpoints/resume_lm`, 또는 프로젝트 루트 `resume_lm/`.

### 4. API 호출 예시

```bash
curl -X POST http://localhost:8000/api/self-intro/generate \
  -H "Content-Type: application/json" \
  -d '{
    "counseling": { "content": "상담 요약" },
    "ai_analysis": {
      "roles": ["데이터 분석가"],
      "competencies": ["데이터 분석", "문제해결"],
      "extracted_background": {
        "name": "홍길동",
        "education": "컴퓨터공학",
        "experiences": ["인턴 6개월"],
        "strengths": ["문제해결"]
      }
    },
    "language": "ko"
  }'
```

## T3TO(Next.js) 연동

- `.env.local`에 `MK_RESUME_MODEL_API_URL=http://localhost:8000` 설정
- 자기소개서 생성 시 이 API를 1회 호출해 초안을 받고, 동일 내용으로 3종 버전(역량/경험/가치관)으로 저장
- API 미설정 시 생성 버튼 사용 불가(에러 메시지 표시)

## 모델 학습 (Fine-tuning)

1. **데이터**: `python build_input_from_crawl.py [크롤링.txt] -o data/examples.jsonl`
2. **학습**: `pip install -r requirements-train.txt` 후  
   `python train_resume_model.py --data data/examples.jsonl --output_dir checkpoints/resume_lm`
3. 학습된 체크포인트를 `checkpoints/resume_lm/` 또는 프로젝트 루트 `resume_lm/`에 두면 API가 자동 사용
