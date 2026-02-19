# 오늘 수정 사항 정리 (2025-02-19)

아래는 오늘 적용한 수정 사항을 요약하고, 변경된 코드의 핵심 부분을 한 파일에 정리한 내용입니다.

---

## 1. 목표 기업 없을 때 직무목표 기반 중기/장기 목표 설정

**목적:** 목표 기업이 없으면 해당 프로필의 직무목표에 맞춰 중기(Step2)·장기(Step3) 목표를 설정하도록 변경.

**파일:** `src/app/(dashboard)/roadmap/actions.ts`

- **LLM 시스템 프롬프트 추가 (목표 기업 없는 경우):**
```text
- **목표 기업이 없는 경우 (직무목표 기반 중기/장기 목표)**:
  - 목표 기업(희망 기업)이 없거나 비어 있으면, 해당 프로필의 **직무목표(목표 직무)**에 맞춰서만 Step2·Step3를 작성해라.
  - Step2 (중기): "목표 직무에 맞춘 역량 강화" — 특정 기업명 없이 직무 요구 역량·포트폴리오·인턴/프로젝트/자격증 등 구체적 역량 개발 방법 제시.
  - Step3 (장기): "목표 직무 달성을 위한 최종 합격 및 안착" — 직무 시장 진입·면접 준비·이력서/자기소개서·입사 후 안착까지 직무 중심으로 구체적 방법 제시.
```

- **RAG 컨텍스트 (목표 기업 없음 시):**
```javascript
${!targetCompanyFromProfile || targetCompanyFromProfile === '없음' || targetCompanyFromProfile === '미정'
  ? '**목표 기업 없음**: 해당 프로필의 직무목표에 맞춰 중기(Step2)·장기(Step3) 목표를 설정해라. 기업명을 나열하지 말고 직무 역량 강화·취업·안착 중심으로 작성해라.'
  : '위 목표 직무·기업을 달성하는 데 초점을 맞춰 단계를 구성해라.'}
```

- **ragPlanToMilestones:** Step2/Step3 기본 설명문을 `targetCompany` 유무에 따라 분기 (목표 직무 기반 문구 사용).
- **규칙 기반:** phase2Desc, phase3 description에서 목표 기업 없을 때 직무목표 기반 문구 사용.

---

## 2. 기업 있을 때 인재상 정보 반영, 기업 없을 때 목표 구체화 상세 안내

**목적:** 단순 텍스트 나열이 아니라, 기업이 있으면 해당 기업 인재상·채용·기술스택 실제 정보 제공, 기업이 없으면 목표 구체화를 위한 상세 안내 제공.

**파일:** `src/app/(dashboard)/roadmap/actions.ts`, `src/app/(dashboard)/roadmap/page.tsx`, `src/components/roadmap/timeline.tsx`

- **generateRoadmapWithRag:** 웹 검색 결과 `companyInfos`를 반환하도록 수정 (`companyInfosResult` 보관 후 `return { ...parsed, companyInfos }`).
- **ragPlanToMilestones:** `companyInfos?: CompanyInfo[]` 파라미터 추가. Step2/Step3에 기업별 리소스 추가 (인재상, 채용·공고 요약, 기술 스택), 각 리소스에 `content` 필드로 실제 텍스트 저장. 목표 기업 없을 때 Step1/Step2에 "목표 구체화 가이드" 리소스(상세 안내 문구) 추가.
- **목표 구체화 가이드 상수 (GOAL_CONCRETIZATION_CONTENT):** SMART 목표, 직무·산업 구체화, 역량 갭 분석, 다음 단계 안내 문구 포함.
- **규칙 기반:** 목표 기업 있으면 `searchCompanyInfo` 호출 후 Step2/Step3 리소스에 인재상·채용·기술스택 `content` 추가. 목표 기업 없으면 Step1/Step2에 목표 구체화 가이드 리소스 추가.
- **리소스 타입:** `resources` 항목에 `content?: string` 추가.
- **로드맵 페이지:** 단계 상세 다이얼로그에서 `resource.content`가 있으면 제목 아래 회색 박스로 본문 표시.
- **timeline.tsx:** `RoadmapStep.resources` 타입에 `content?: string` 추가.

---

## 3. 핵심 직무 역량 퍼센트를 프로필 기반 실제 분석으로

**목적:** 고정 퍼센트(80, 70, 85, 75) 대신, 전공·학력·경력·상담내역·목표 기업을 바탕으로 필요 역량을 실제 분석하여 표기.

**파일:** `src/app/(dashboard)/roadmap/actions.ts`

- **computeCompetenciesFromProfile(profile, analysisList, targetJob, targetCompany):**
  - 전공·학력·경력·상담 분석(강점, 관심키워드, 가치관)으로 4가지 역량(목표 직무, 데이터 분석, 협업 도구, 문제 해결)의 level(0~100) 계산.
  - 전공-직무 일치도, 학력 점수, 경력 점수, 목표 기업 유무, 상담 강점 키워드 반영.
- **RAG 경로:** 로드맵 생성 후 `dynamicSkills`를 `computeCompetenciesFromProfile(ragContext.profile[0], ragContext.analysis, targetJob, targetCompany)` 결과로 덮어씀.
- **규칙 기반:** `profileId` 있을 때 프로필·상담 분석 조회 후 `computeCompetenciesFromProfile(ruleProfile, ruleAnalysisList, targetJob, targetCompany)`로 `dynamicSkills` 설정.

---

## 4. 첫 번째 역량: 직무명 나열 대신 실제 필요 역량(자격·경력) 표기

**목적:** "백엔드 개발자, 소프트웨어 엔지니어 숙련도"처럼 직무명을 나열하지 않고, 해당 직무에 실제로 필요한 역량의 핵심(자격·경력 등)을 구체적으로 표기.

**파일:** `src/app/(dashboard)/roadmap/actions.ts`

- **getConcreteRequiredCompetencies(targetJob, major):** 직무·전공 키워드에 따라 실제 필요 역량 문자열 반환.
  - 예: 신경외과 의사 → "의사면허, 신경외과 전문의·펠로우 경력, 수술·진료 역량"
  - 예: 백엔드 개발자 → "정보처리기사·관련 자격, 서버·DB 개발 역량, Git·API 설계 경험"
  - 예: 데이터 분석 → "SQL·데이터 분석 도구, ADsP·빅데이터분석기사 등, 리포팅·시각화 역량"
  - 의료·간호·약사, 개발·엔지니어, 데이터·AI, 토목·건설·안전, 기계·전기·전자, 경영·마케팅·인사 등 분야별 매핑.
- **첫 번째 역량 항목:** title = "목표 직무 필요 역량", desc = `getConcreteRequiredCompetencies(targetJob, major)` 반환값.

---

## 5. 커리어 프로필 나이: 연령대 → 실제 나이 기입

**목적:** 10대/20대/30대 연령대 선택 대신, 실제 나이(만 나이)를 기입하도록 변경.

**파일:** `src/app/(dashboard)/dashboard/page.tsx`, `src/app/(dashboard)/admin/clients/page.tsx`, `src/app/(dashboard)/roadmap/page.tsx`

- **대시보드 프로필 폼:** "연령대" select 제거 → "나이" 숫자 입력 (`<Input type="number" min={15} max={100} placeholder="만 25" name="age_group" />`). DB 필드명 `age_group` 유지, 값은 "25", "31" 등 숫자 문자열로 저장.
- **관리자 내담자 편집:** 동일하게 "나이" 숫자 입력. 기존 값이 숫자 문자열이면 그대로 표시.
- **관리자 내담자 상세:** "성별 / 연령대" → "성별 / 나이". 값이 숫자면 "25세"로 표시, 아니면 기존 값(연령대) 그대로 표시.
- **로드맵 페이지 내담자 정보:** "연령대" → "나이". 숫자면 "25세"로 표시.

---

## 수정된 파일 목록

| 파일 | 수정 내용 요약 |
|------|----------------|
| `src/app/(dashboard)/roadmap/actions.ts` | 목표 기업 없을 때 직무목표 기반 로드맵, 인재상/목표 구체화 리소스, 역량 분석 함수, 직무별 필요 역량 문자열, companyInfos 반환 등 |
| `src/app/(dashboard)/roadmap/page.tsx` | 리소스 content 표시, 나이 표기("25세") |
| `src/components/roadmap/timeline.tsx` | resources 타입에 `content?: string` 추가 |
| `src/app/(dashboard)/dashboard/page.tsx` | 연령대 → 나이 숫자 입력 |
| `src/app/(dashboard)/admin/clients/page.tsx` | 연령대 → 나이 숫자 입력, 상세보기 "나이"·"25세" 표시 |

---

## 참고: DB·스키마

- `career_profiles.age_group`: 컬럼명 변경 없음. 값만 "10대"/"20대" 대신 "25", "31" 등 실제 나이(문자열) 저장.
- 기존 연령대 데이터는 수정 전까지 그대로 표시되며, 수정·저장 시 새 형식(실제 나이)으로 저장됨.
