# 자기소개서 RAG API (로컬)

Colab에서 만들었던 RAG + LangChain 코드를 로컬용으로 정리한 서비스입니다.  
Next 앱의 **자기소개서 → AI 초안 생성** 버튼이 이 API를 호출해 3종 초안을 받습니다.

## 필요한 것

- Python 3.10+
- OpenAI API Key
- (선택) 자소서 PDF — `PDF_PATH`에 두면 RAG 검색에 사용됩니다. 없어도 초안은 생성됩니다.

## 설치 및 실행

```bash
cd rag-cover-letter
python -m venv venv
venv\Scripts\activate   # Windows
# source venv/bin/activate  # Mac/Linux
pip install -r requirements.txt
```

`.env` 파일 생성 (`.env.example` 복사 후 값 채우기):

```
OPENAI_API_KEY=sk-your-key
PDF_PATH=./자소서.pdf
```

서버 실행:

```bash
python main.py
```

기본 주소: **http://localhost:8000**  
- `GET /health` — 상태 확인  
- `POST /generate` — 초안 3종 생성 (Next 앱이 호출)

## Next 앱 연동

프로젝트 루트 `.env.local`에 추가:

```
RAG_COVER_LETTER_API_URL=http://localhost:8000/generate
```

이 서버를 켠 상태에서 자기소개서 페이지에서 **AI 초안 생성**을 누르면 RAG API로 요청이 갑니다.

## 품질 높이기

- **모델**: `.env`에 `OPENAI_MODEL=gpt-4o` 로 두면 더 좋은 문장 (비용 증가).
- **RAG**: `PDF_PATH`에 채용 공고·직무 설명 PDF 넣으면, 그 내용에 맞춰 초안 생성.
- **검색량**: `RAG_TOP_K=8` 처럼 키를 늘리면 context가 더 많아짐 (기본 6).
- **MMR**: `RAG_USE_MMR=true`(기본) 로 검색 결과 다양하게 가져옴.
- **프롬프트**: 역량/경험/가치관별 가이드와 400~700자 구조는 이미 반영됨.

## Colab과 다른 점

- 구글 드라이브 마운트 / `%cd` 제거
- API 키·PDF 경로는 환경변수(`.env`) 사용
- `!pip` 제거 — 로컬에서는 `requirements.txt`로 설치
- 자기소개서 **초안 3종 생성** 로직 추가 (역량/경험/가치관)
