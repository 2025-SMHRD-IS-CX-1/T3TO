# 로드맵 모듈 마이그레이션 가이드

**하나의 독립 모듈로 사용 가능 여부: 가능합니다.**  
이 폴더(`roadmap/lib`)만 복사하고, 외부 의존성(DB·검색·LLM)을 **어댑터**로 주입하면 다른 프로젝트에서 **동일한 로드맵 기능**을 그대로 쓸 수 있습니다.

---

## 로드맵 모듈 이식 및 재사용성 (요약)

| 항목 | 내용 |
|------|------|
| **이식 단위** | `roadmap/lib` 폴더 전체. Next/Supabase에 묶인 부분은 `roadmap-rag-context.ts`(선택)뿐. |
| **진입점** | `runRoadmap(userData, adapters)` 한 번 호출로 RAG → 마일스톤·역량·자격증 생성. 실패 시 규칙 기반 fallback. |
| **재사용 방식** | **어댑터 패턴**. DB·검색·LLM을 구현한 객체를 넘기면, lib는 그 인터페이스만 사용. |
| **필수 구현** | `RoadmapRagContext` 형태의 사용자 데이터, `RoadmapAdapters`(최소 `openaiApiKey`, `model`). |
| **선택 구현** | `searchCompany`, `searchJob`, `searchCertification` — 없으면 해당 기능만 생략되고 나머지 동작. |
| **외부 npm** | `openai` 패키지. 이식 시 프로젝트에 `openai` 설치 필요. |
| **앱 전용 의존** | `roadmap-qnet-rag.ts`가 `getRoadmapModel()`(`@/lib/ai-models`) 참조. 이식 시 해당 파일에 `getRoadmapModel`을 제공하거나, 환경변수 `OPENAI_MODEL` / 어댑터 `model`만 쓰도록 작은 수정 가능. |

---

## 1. 복사할 대상

- **전체 폴더**: `src/app/(dashboard)/roadmap/lib/`
  - `roadmap-types.ts` — 타입 정의 (CompanyInfo, JobInfo, RagRoadmapResult 등, **앱 코드 의존 없음**)
  - `roadmap-adapters.ts` — 마이그레이션용 어댑터 타입 (RoadmapAdapters, RoadmapRagContext, RunRoadmapResult)
  - `roadmap-run.ts` — **단일 진입점** `runRoadmap(userData, adapters)`. RAG 경로 + 실패 시 규칙 기반 fallback.
  - `roadmap-rag-generate.ts` — RAG 기반 로드맵 LLM 생성 (어댑터로 주입된 openai·컨텍스트만 사용)
  - `roadmap-milestones.ts` — RAG plan → 마일스톤/스킬/자격 변환
  - `roadmap-rule-based.ts` — 규칙 기반 로드맵 생성 (RAG 실패 시 fallback)
  - `roadmap-prompts.ts` — 로드맵·자격증 추천용 시스템/사용자 프롬프트
  - `roadmap-competencies.ts` — 역량·키워드 추출 (직무 카테고리·프로필 기반 역량)
  - `roadmap-qnet.ts` — Q-Net 자격 등급·필터 (학력/경력 기준, 순수 로직)
  - `roadmap-qnet-rag.ts` — RAG 기반 자격증 추천 (Tavily 검색 + OpenAI 폴백, 학력·경력 필터 적용)
  - `roadmap-evaluation.ts` — 출력 정확성·Citation 평가 (순수 로직)
  - `roadmap-rag-context.ts` — **선택**: RAG용 DB 조회. Supabase 사용 시만 복사하고, 다른 DB면 직접 구현 후 같은 인터페이스로 맞추면 됨.
  - `index.ts` — re-export (runRoadmap, generateRoadmapWithRag, ragPlanToMilestones, buildRuleBasedRoadmap 등)

## 2. 현재 앱에서만 쓰는 부분 (이식 시 대체 필요)
jhg

| 역할 | 현재 위치 | 이식 시 |
|------|-----------|--------|
| RAG 컨텍스트 수집 | `getRoadmapRagContext(supabase, profileId, userId)` | **본인 DB/API**에서 `RoadmapRagContext` 형태(`{ counseling, analysis, profile, roadmap }`)로 준비해 넘기면 됨 |
| 웹 검색 (기업/직무) | `@/lib/web-search` (Tavily) | **선택**. 어댑터의 `searchCompany`, `searchJob` 구현하거나, 없으면 DB 데이터만으로 생성 |
| 자격증 추천 | 어댑터 `searchCertification` (Tavily) + lib 내부 `getCertificationsForRoadmap` | **선택**. 어댑터에 `searchCertification(targetJob, major)` 구현하거나 없으면 빈 배열. `getQualifications`/`getExamSchedule`은 앱에서 빈 배열 반환 가능 |
| LLM 호출 | lib 내부 `generateRoadmapWithRag` (openai·model은 어댑터에서 주입) | 어댑터에 `openaiApiKey` + `model` 넘기면 `runRoadmap`이 lib 안에서 처리 |

## 3. 어댑터만 맞추면 되는 진입점

다른 프로젝트에서는 **진입점은 이미 lib에 있습니다.** 다음만 구현하면 됩니다.

```ts
import type { RoadmapAdapters, RoadmapRagContext } from './lib/roadmap-adapters'
import { runRoadmap } from './lib'

// 1) RAG 컨텍스트: 본인 DB/API에서 조회
const userData: RoadmapRagContext = await yourGetRagContext(profileId, userId)

// 2) 어댑터: OpenAI + (선택) 웹검색·자격증 검색
const adapters: RoadmapAdapters = {
  openaiApiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-4o-mini',
  searchCompany: yourSearchCompany,     // 없으면 undefined
  searchJob: yourSearchJob,             // 없으면 undefined
  getQualifications: () => Promise.resolve([]),
  getExamSchedule: () => Promise.resolve([]),
  searchCertification: yourSearchCertification,  // 없으면 undefined (자격증 추천 생략 가능)
}

// 3) 단일 호출로 RAG 경로 전체 실행 (웹 검색 → LLM → 마일스톤·역량·자격증). 실패 시 규칙 기반 fallback.
const result = await runRoadmap(userData, adapters)
// result.info, result.dynamicSkills, result.dynamicCerts, result.targetJob, result.targetCompany
```

현재 앱의 `createInitialRoadmap`(actions.ts)은 위와 같이 `runRoadmap(userData, adapters)`를 호출한 뒤, 반환값을 DB에 저장하는 역할만 합니다.

## 4. 독립 모듈 상태

- **진입점**: `runRoadmap(userData, adapters)`가 이미 `lib/roadmap-run.ts`에 있으며, 한 번 호출로 RAG 경로 전체(웹 검색 → LLM → 마일스톤·역량·자격증)가 실행됩니다. 실패 시 규칙 기반 fallback(`buildRuleBasedRoadmap`)이 동작합니다.
- **구성**: `generateRoadmapWithRag`, `ragPlanToMilestones`, `getCertificationsForRoadmap`, `computeCompetenciesFromProfile`, `buildRuleBasedRoadmap` 등은 모두 lib 안에 있고, `runRoadmap`이 어댑터를 넘겨 호출합니다. **추가로 옮길 작업 없이** 이식만 하면 됩니다.

### 이식 체크리스트

1. **복사**: `roadmap/lib` 전체를 새 프로젝트로 복사.
2. **npm**: `openai` 패키지 설치.
3. **모델 이름**: `roadmap-qnet-rag.ts`는 `getRoadmapModel()`을 사용. 이식 시 `@/lib/ai-models`를 새 프로젝트에 맞게 두거나, `process.env.OPENAI_MODEL ?? 'gpt-4o-mini'`를 반환하는 한 줄 모듈로 대체.
4. **RAG 컨텍스트**: 본인 DB/API에서 `{ counseling, analysis, profile, roadmap }` 형태로 조회해 `userData` 구성.
5. **어댑터**: `openaiApiKey`, `model` 필수. `searchCompany`/`searchJob`/`searchCertification`은 선택.
6. **호출**: `runRoadmap(userData, adapters)` 반환값(`info`, `dynamicSkills`, `dynamicCerts`, `targetJob`, `targetCompany`)을 필요한 곳에 저장·표시.

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

- **독립 모듈 가능 여부**: **가능**. 단일 진입점 `runRoadmap(userData, adapters)`가 lib에 구현되어 있음.
- **이식 단위**: `roadmap/lib` 전체 복사 + (선택) `roadmap-rag-context` 대체 구현. 앱에서는 어댑터만 채워 `runRoadmap` 호출.
- **파인튜닝**: 파인튜닝 대상은 **LLM**; 이 모듈은 태스크 정의·데이터 생성·HF 모델 연동에 활용 가능.
- **Hugging Face 업로드**: **모델**(파인튜닝 모델), **데이터셋**(로드맵 데이터), **Space**(데모) 형태로 모두 업로드 가능.
