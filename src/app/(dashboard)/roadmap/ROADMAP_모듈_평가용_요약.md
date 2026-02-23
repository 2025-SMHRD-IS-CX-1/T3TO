# 로드맵(roadmap) 모듈 — 평가용 요약

> 프로젝트 평가 시 제출·참고용 요약 문서입니다.

---

## 1. 모듈 개요

| 항목 | 내용 |
|------|------|
| **경로** | `src/app/(dashboard)/roadmap/` (라우트: `/roadmap`) |
| **역할** | 내담자별 **맞춤형 커리어 로드맵** 생성·조회·표시 |
| **기술** | Next.js(App Router), Server Actions, Supabase, OpenAI, RAG, Tavily 웹 검색 |
| **DB 테이블** | `career_roadmaps`, `career_profiles`, `consultations`, `consultation_analysis` (조회·저장만, 스키마 변경 없음) |

---

## 2. 디렉터리 및 파일 구성

```
src/app/(dashboard)/roadmap/
├── page.tsx                 # 페이지 진입 (Suspense + RoadmapPageClient)
├── RoadmapPageClient.tsx    # 클라이언트 UI (로드맵 조회/생성/갱신/출력·저장)
├── actions.ts               # 서버 액션 (getRoadmap, getClientProfile, createInitialRoadmap)
├── lib/                     # 로드맵 비즈니스 로직
│   ├── index.ts             # 모듈 re-export
│   ├── roadmap-types.ts     # 공용 타입 (RagPlanStep, RagRoadmapResult 등)
│   ├── roadmap-adapters.ts  # 어댑터 인터페이스 (이식·테스트용)
│   ├── roadmap-run.ts       # 단일 진입점: RAG 시도 → 실패 시 규칙 기반 폴백
│   ├── roadmap-rag-context.ts   # RAG용 DB 컨텍스트 수집
│   ├── roadmap-rag-generate.ts  # RAG 기반 LLM 로드맵 생성
│   ├── roadmap-prompts.ts   # 시스템/사용자 프롬프트
│   ├── roadmap-evaluation.ts    # 출력 정확성·Faithfulness 평가
│   ├── roadmap-milestones.ts    # RAG plan → 마일스톤/역량/자격 변환
│   ├── roadmap-competencies.ts  # 역량 도출 (프로필·상담 기반)
│   ├── roadmap-qnet.ts      # Q-Net 자격증 등급·필터·시험일정
│   ├── roadmap-qnet-rag.ts  # 자격증 RAG 추천 (LLM + 키워드 폴백)
│   ├── roadmap-rule-based.ts    # 규칙 기반 로드맵 (RAG 실패 시)
│   └── MIGRATION.md         # 독립 모듈 이식 가이드
```

**관련 UI 컴포넌트**: `src/components/roadmap/roadmap-gantt.tsx`, `timeline.tsx`  
**API**: `src/app/api/roadmap/generate/route.ts` (외부/Colab 호출용)

---

## 3. 주요 기능

1. **로드맵 생성**  
   내담자 프로필·상담·분석 + (선택) 웹 검색(기업/직무) → RAG 컨텍스트 구성 → OpenAI로 단계별 plan 생성 → 마일스톤·역량·자격증으로 변환 후 DB 저장.

2. **로드맵 갱신**  
   기존 로드맵이 있을 때 같은 파이프라인으로 재생성 후 UPSERT.

3. **표시**  
   갠트 차트(분기별), 단기·중기·장기 카드, 핵심 직무 역량(Competencies), 추천 자격증·교육, 출력·이미지 저장.

4. **자격증 추천**  
   **Q-Net API 대신 Tavily API**로 직무·전공 관련 자격증을 검색한 뒤, 검색 결과를 RAG 컨텍스트로 LLM에 넘겨 추천(`getCertificationsFromTavilyContext`). Tavily 키가 없거나 검색 실패 시 **OpenAI 폴백**(LLM 지식 기반) 사용.

---

## 4. 처리 흐름 (간단)

```
[클라이언트] RoadmapPageClient
    → actions.createInitialRoadmap(profileId, clientData, counselorId, updateOnly)
        → getRoadmapRagContext(supabase, profileId, userId)  // DB 컨텍스트
        → runRoadmap(userData, adapters)
            ├─ Tavily: 기업/직무 검색 (타임아웃 10초)
            ├─ Tavily: 자격증 검색 (searchCertification, 타임아웃 8초)
            ├─ generateRoadmapWithRag() → OpenAI → plan + 평가
            ├─ ragPlanToMilestones() → info, dynamicSkills, dynamicCerts
            ├─ getCertificationsForRoadmap(tavilyCertContext) → Tavily RAG 또는 OpenAI 폴백
            └─ 실패 시 buildRuleBasedRoadmap()
        → career_roadmaps UPSERT, revalidatePath
```

---

## 5. 설계·품질 관련 포인트 (평가 시 참고)

| 항목 | 설명 |
|------|------|
| **어댑터 패턴** | `RoadmapAdapters`로 OpenAI·웹검색·DB를 주입 가능. 다른 프레임워크/DB로 이식 시 동일 로직 재사용 가능. |
| **RAG + 폴백** | RAG(DB+웹) 성공 시 LLM 로드맵, 실패 시 규칙 기반 로드맵으로 동일 출력 형식 유지. |
| **평가 로직** | `roadmap-evaluation.ts`: plan 단계 수·summary·단계 유효성(정확성), citation·Faithfulness(환각 검증). |
| **독립 모듈** | `lib/`는 Next/Supabase에 직접 의존하지 않고, 어댑터·타입으로 진입점 정의. `MIGRATION.md`에 이식 방법 정리. |
| **DB 원칙 준수** | 스키마 변경 없이 기존 테이블 조회·INSERT/UPDATE만 수행. |

---

## 6. 외부 연동

- **OpenAI**: 로드맵 plan 생성, 자격증 추천(폴백 시 LLM 지식 기반).
- **Tavily** (`@/lib/web-search`): 기업/직무 검색 + **자격증 검색**(Q-Net API 대체). `searchCertificationInfo`로 직무·전공·시험일정 관련 웹 검색 후 RAG로 자격증 추천.
- **Supabase**: 프로필·상담·분석·로드맵 저장·조회.

※ **Q-Net API 미사용.** 자격증 데이터는 Tavily 검색 → RAG 추천 또는 OpenAI 폴백. **rag-roadmap**(Python) 폴더는 Next.js 앱에서 호출되지 않는 별도 데모용입니다.

---

## 7. 참고 문서

- **이식·마이그레이션**: `src/app/(dashboard)/roadmap/lib/MIGRATION.md`
- **API 호출(Colab/cURL)**: `src/app/api/roadmap/README.md`

---

*문서 생성: 로드맵 모듈 평가용 요약*
