# 로드맵 모듈 마이그레이션 가이드

**하나의 독립 모듈로 사용 가능 여부: 가능합니다.**  
이 폴더(`roadmap/lib`)만 복사하고, 외부 의존성(DB·검색·LLM·Q-Net)을 **어댑터**로 주입하면 다른 프로젝트에서 **동일한 로드맵 기능**을 그대로 쓸 수 있습니다.

## 1. 복사할 대상

- **전체 폴더**: `src/app/(dashboard)/roadmap/lib/`
  - `roadmap-types.ts` — 타입 정의 (CompanyInfo, JobInfo, RagRoadmapResult 등, **앱 코드 의존 없음**)
  - `roadmap-competencies.ts` — 역량·키워드 추출 (순수 로직)
  - `roadmap-qnet.ts` — Q-Net 자격증 필터 (순수 로직)
  - `roadmap-evaluation.ts` — 출력 정확성·Citation 평가 (순수 로직)
  - `roadmap-adapters.ts` — 마이그레이션용 어댑터 타입
  - `roadmap-rag-context.ts` — **선택**: RAG용 DB 조회. Supabase 사용 시만 복사하고, 다른 DB면 직접 구현 후 같은 인터페이스로 맞추면 됨.
  - `index.ts` — re-export

## 2. 현재 앱에서만 쓰는 부분 (이식 시 대체 필요)

| 역할 | 현재 위치 | 이식 시 |
|------|-----------|--------|
| RAG 컨텍스트 수집 | `getRoadmapRagContext(supabase, profileId, userId)` | **본인 DB/API**에서 `{ counseling, analysis, profile, roadmap }` 형태로 준비해 넘기면 됨 |
| 웹 검색 (기업/직무) | `@/lib/web-search` (Tavily) | **선택**. `RoadmapAdapters.searchCompany`, `searchJob` 구현하거나, 없으면 DB 데이터만으로 생성 |
| 자격증/시험일정 | (제거됨) | **선택**. 어댑터에서 `getQualifications`, `getExamSchedule` 구현하거나 빈 배열 반환 |
| LLM 호출 | `actions.ts` 내부 `generateRoadmapWithRag` | **동일 시그니처 유지**. `openaiApiKey` + `model`만 넘기면 됨 |

## 3. 어댑터만 맞추면 되는 진입점 (개념)

다른 프로젝트에서는 다음만 구현하면 됩니다.

```ts
import type { RoadmapAdapters, RoadmapRagContext } from './lib/roadmap-adapters'
import { computeCompetenciesFromProfile, filterRelevantQualifications, extractKeywordsFromAnalysis } from './lib'

// 1) RAG 컨텍스트: 본인 DB/API에서 조회
const userData: RoadmapRagContext = await yourGetRagContext(profileId, userId)

// 2) 어댑터: OpenAI + (선택) 웹검색
const adapters: RoadmapAdapters = {
  openaiApiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-4o-mini',
  searchCompany: yourSearchCompany,  // 없으면 undefined
  searchJob: yourSearchJob,          // 없으면 undefined
}

// 3) 현재 createInitialRoadmap 안에서 하는 흐름과 동일:
//    generateRoadmapWithRag(userData) → ragPlanToMilestones → computeCompetenciesFromProfile
//    이 흐름을 호출하는 함수를 앱에서 한 번 감싸서, adapters를 주입해 호출하면 이식 완료.
```

실제 **진입점 함수**(`generateRoadmapWithRag` + `ragPlanToMilestones` 호출)는 아직 `actions.ts` 안에 있습니다.  
완전한 단일 진입점(예: `runRoadmap(userData, adapters)`)으로 빼려면, `generateRoadmapWithRag`와 `ragPlanToMilestones`를 이 `lib`로 옮기고, `openai`/`model`/웹검색 결과를 인자로 받도록 리팩터하면 됩니다.

## 4. 하나의 독립 모듈로 쓰려면

- **진입점**: `runRoadmap(userData, adapters)` 한 번만 호출하면 RAG 경로 전체(웹 검색 → LLM → 마일스톤·역량)가 실행되도록 되어 있으면 독립 모듈 완성.
- **필요 작업**: `generateRoadmapWithRag`, `ragPlanToMilestones`(및 필요 시 규칙 기반 로직)를 `lib`로 옮기고, `openai`/`model`/웹검색 결과/Q-Net을 **인자(어댑터)**로만 받도록 바꾸면 됨. 로직은 그대로 두고 호출부만 어댑터 주입으로 교체하면 **기능 유지** 가능.

## 5. 파인튜닝·Hugging Face 업로드 가능성

질문: **모듈을 독립시키는 이유가 파인튜닝·Hugging Face 업로드 가능 여부**인 경우.

### 파인튜닝

- **파인튜닝 대상**: 파인튜닝되는 것은 **이 TypeScript 모듈이 아니라, 언어 모델(LLM)** 입니다.
- **이 모듈이 하는 일**:
  - **태스크·프롬프트 정의**: 로드맵 생성용 시스템 프롬프트 + 사용자 컨텍스트(RAG) 형식이 코드에 고정되어 있음.
  - **학습 데이터 생성**: 현재 파이프라인(GPT 등)으로 `(RAG 컨텍스트 → 정답 로드맵 JSON)` 쌍을 대량 생성하면, 그걸로 **다른 오픈 LLM(LLaMA, Qwen 등)을 파인튜닝**할 수 있음.
  - **HF 모델 연동**: 어댑터로 LLM 호출부만 바꾸면, OpenAI 대신 **Hugging Face Inference API / 자체 파인튜닝 모델**을 붙여서 같은 입력·출력 형식을 유지할 수 있음.
- **정리**: **파인튜닝은 “로드맵 전용 LLM”을 만드는 것**이고, 이 모듈은 그걸 위한 **데이터 생성·프롬프트 정의·추론 파이프라인**을 제공합니다. 모듈을 독립시키면 데이터 생성 스크립트나 HF 기반 학습 파이프라인에 같은 로직을 재사용하기 쉬워집니다.

### Hugging Face 업로드

| 업로드 형태 | 가능 여부 | 설명 |
|-------------|-----------|------|
| **모델 (Model)** | ✅ 가능 | 이 태스크(로드맵 생성)로 **파인튜닝한 모델**을 HF에 업로드. 모듈의 프롬프트·출력 스키마를 그대로 쓰면 됨. |
| **데이터셋 (Dataset)** | ✅ 가능 | 이 파이프라인으로 만든 `(context, roadmap_json)` **학습/평가용 데이터셋**을 HF Datasets으로 업로드. |
| **Space (데모)** | ✅ 가능 | Gradio/Streamlit 등으로 입력(RAG 텍스트 또는 프로필) → 로드맵 JSON/UI 출력. 백엔드는 (1) HF Inference API의 파인튜닝 모델, (2) 또는 동일 프롬프트를 쓰는 다른 API로 구현 가능. 모듈을 Python으로 옮기거나 API로 감싸면 Space에 붙이기 좋음. |

- **독립 모듈이 도움이 되는 이유**: 프롬프트·입출력 형식·평가 로직이 한 곳(`lib`)에 있으면, (1) 데이터 생성, (2) 파인튜닝 스크립트, (3) HF Space/API 서빙에서 **동일 스펙**을 재사용할 수 있어, HF 업로드(모델/데이터셋/Space) 모두와 호환되기 쉽습니다.

## 6. 요약

- **독립 모듈 가능 여부**: **가능** (기능 유지하면서 어댑터 패턴으로 이식 가능).
- **이식 단위**: `roadmap/lib` 전체 + (선택) `roadmap-rag-context` 대체 구현.
- **파인튜닝**: 파인튜닝 대상은 **LLM**; 이 모듈은 태스크 정의·데이터 생성·HF 모델 연동에 활용 가능.
- **Hugging Face 업로드**: **모델**(파인튜닝 모델), **데이터셋**(로드맵 데이터), **Space**(데모) 형태로 모두 업로드 가능.
