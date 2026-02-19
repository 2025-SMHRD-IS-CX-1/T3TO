# 자기소개서 RAG·LangChain 연동 가이드

현재 자기소개서 "AI 초안 생성"은 **템플릿 기반**입니다.  
Colab에서 만든 RAG + LangChain 모델을 붙이려면 아래 순서로 진행하면 됩니다.

---

## 1. Colab 코드 모듈화 (필수)

### 1-1. 입력/출력 정하기

**입력 (Next 앱에서 넘길 값)**  
- `client_name`, `major`, `target_job` (로드맵 목표 직무)  
- 상담 분석 요약: `strengths`, `career_values` (있으면)  
- (선택) 회사명, 공고 문구 등 RAG에 넣고 싶은 것

**출력**  
- 초안 **3개** 문자열 (역량/경험/가치관 등)  
  - 예: `{ "drafts": [ { "type": "Version 1", "title": "...", "content": "..." }, ... ] }`

### 1-2. Colab에서 할 일

1. **RAG 파이프라인을 함수 하나로 묶기**
   - 예: `def generate_cover_letter_drafts(profile: dict, target_job: str) -> list[dict]:`
   - 내부: 임베딩/검색 → 프롬프트 구성 → LLM 호출 → 3개 초안 반환

2. **의존성 정리**
   - `requirements.txt` 만들기 (langchain, openai 등 사용한 패키지)

3. **로컬/서버에서 실행 가능하게**
   - Colab이 아닌 **일반 Python 스크립트**로 저장 (`.py` 또는 노트북 export)

---

## 2. RAG 서비스 노출 (둘 중 하나 선택)

### 방법 A: FastAPI 등 별도 API 서버 (추천)

- 모듈화한 코드를 **FastAPI**로 감싸기  
  - 예: `POST /generate`  
  - Body: `{ "client_name": "...", "major": "...", "target_job": "...", "insights": "..." }`  
  - Response: `{ "drafts": [ { "type": "...", "title": "...", "content": "..." }, ... ] }`
- 서버 위치
  - 로컬: `http://localhost:8000` (개발 시)
  - 배포: GCP Run, AWS Lambda + API Gateway, Railway 등

### 방법 B: Vercel Serverless (Python)

- RAG를 **Vercel Python Function**으로 배포  
- Next와 같은 프로젝트에 `api/rag-generate/` 형태로 두고, Next Server Action에서 `fetch`로 호출

---

## 3. Next 앱에서 RAG API 호출

- **자기소개서 생성**은 `src/app/(dashboard)/cover-letter/actions.ts`의 `generateAIDrafts(clientId)`에서 처리됩니다.
- 여기서 지금처럼 **프로필/로드맵/상담 분석**을 Supabase에서 가져온 뒤,  
  **RAG API URL**로 `POST` 요청해서 `drafts` 배열을 받고,  
  그 결과를 그대로 `resume_drafts` 테이블에 insert하면 됩니다.

환경 변수:

- `.env.local`에 `RAG_COVER_LETTER_API_URL=https://your-rag-api/generate` 추가 (설정 안 하면 기존 템플릿 사용)

Next 앱에서 RAG API로 보내는 요청 Body (참고해서 FastAPI 등에서 받으면 됨):

```json
{
  "client_name": "홍길동",
  "major": "컴퓨터공학",
  "target_job": "프론트엔드 개발자",
  "insights": "강점: ...\n가치관: ...",
  "age_group": "20대",
  "education_level": "대졸"
}
```

---

## 4. 연동 순서 요약

| 단계 | 할 일 |
|------|--------|
| 1 | Colab RAG를 `generate_cover_letter_drafts(profile, target_job)` 형태로 모듈화 |
| 2 | FastAPI(또는 Flask 등)로 `POST /generate` API 구현 |
| 3 | `.env`에 `RAG_COVER_LETTER_API_URL` 추가 |
| 4 | `cover-letter/actions.ts`의 `generateAIDrafts`에서 RAG API 호출하도록 수정 |
| 5 | (선택) RAG API 실패 시 기존 템플릿으로 fallback |

---

## 5. RAG API 응답 형식 (권장)

Next 쪽에서 그대로 쓰기 쉽게 아래 형식을 맞추면 됩니다.

```json
{
  "drafts": [
    { "type": "Version 1", "title": "직무명 - 역량 중심", "content": "초안 전문..." },
    { "type": "Version 2", "title": "직무명 - 경험 중심", "content": "초안 전문..." },
    { "type": "Version 3", "title": "직무명 - 가치관 중심", "content": "초안 전문..." }
  ]
}
```

이 형식이면 `actions.ts`에서 받은 `drafts`를 그대로 `resume_drafts`에 넣을 수 있습니다.
