# AI 진로 로드맵 (dashboard/roadmap과 동일 기능)

Next.js **dashboard/roadmap** 모듈과 **동일한 기능**으로 동작합니다.  
내담자 이름 입력 → Supabase RAG + **Tavily**(기업/직무/자격증 검색) + OpenAI로 로드맵 생성 후, 결과를 `career_roadmaps`에 저장할 수 있습니다.

## 기능 (Next.js roadmap과 동일)

- **RAG 컨텍스트**: Supabase `career_profiles`, `consultations`, `consultation_analysis`, `career_roadmaps` 조회
- **Tavily 검색**: 목표 기업 정보, 목표 직무 요구사항, **자격증 관련 검색**(Q-Net API 미사용)
- **로드맵 생성**: DB + 웹 검색 결과를 컨텍스트로 OpenAI가 단계별 plan 생성
- **자격증 추천**: Tavily 자격증 검색 결과를 RAG로 LLM 추천 (검색 결과에 등장한 자격증만)
- **역량 계산**: 프로필·상담 분석 기반 핵심 직무 역량·수준
- **출력 형식**: Next.js `RunRoadmapResult`와 동일 (`info`, `dynamicSkills`, `dynamicCerts`, `targetJob`, `targetCompany`)
- **DB 저장**: 선택 시 `career_roadmaps` 테이블 UPSERT

## 설정

1. 가상환경 및 패키지 설치
   ```bash
   cd rag-roadmap
   python -m venv .venv
   .venv\Scripts\activate   # Windows
   pip install -r requirements.txt
   ```

2. 환경 변수
   - `.env.example`을 복사해 `.env` 생성
   - 필수: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `OPENAI_API_KEY`
   - **Tavily**: `TAVILY_API_KEY` (없으면 웹 검색·자격증 검색 생략, DB+OpenAI만 사용)

3. 실행
   ```bash
   python career_roadmap_rag.py
   ```
   브라우저에서 표시되는 주소(예: http://127.0.0.1:7860)로 접속합니다.

## 주의

- API 키는 `.env`에만 두고 Git에 커밋하지 마세요.
- `career_roadmaps`는 `profile_id`(내담자), `user_id`(상담사) 기준으로 UPSERT됩니다.
