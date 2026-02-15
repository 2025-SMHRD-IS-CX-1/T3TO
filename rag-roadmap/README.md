# AI 진로 로드맵 (Supabase + RAG + Q-Net)

내담자 이름을 입력하면 Supabase DB(프로필·상담·로드맵)와 Q-Net 공공데이터를 결합해 GPT로 단계별 진로 로드맵을 생성하고 시각화합니다.

## 설정

1. 가상환경 생성 및 패키지 설치
   ```bash
   cd rag-roadmap
   python -m venv .venv
   .venv\Scripts\activate   # Windows
   pip install -r requirements.txt
   ```

2. 환경 변수
   - `.env.example`을 복사해 `.env` 생성
   - 다음 값을 채워 넣기:
     - `SUPABASE_URL`: Supabase 프로젝트 URL
     - `SUPABASE_ANON_KEY`: Supabase anon key
     - `OPENAI_API_KEY`: OpenAI API 키
     - `QNET_SERVICE_KEY`: Q-Net 공공데이터 서비스 키 (선택, 없으면 자격/시험일정/직무역량 없이 진행)

3. 실행
   ```bash
   python career_roadmap_rag.py
   ```
   브라우저에서 표시되는 주소(예: http://127.0.0.1:7860)로 접속합니다.

## 주의

- **API 키는 `.env`에만 두고, 절대 Git에 커밋하지 마세요.**
- `consultations` / `career_roadmaps`는 **profile_id**(내담자) 기준으로 조회합니다.
