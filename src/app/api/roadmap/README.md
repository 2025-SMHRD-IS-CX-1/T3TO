# 로드맵 생성 API (외부 호출용)

Colab, Python 스크립트, cURL 등에서 **로드맵 모듈**을 HTTP로 호출할 수 있습니다.

## 엔드포인트

- **URL**: `POST /api/roadmap/generate`
- **인증**: 서버에 `ROADMAP_API_KEY` 환경 변수가 있으면, 요청 시 다음 중 하나 필수  
  - 헤더 `X-API-Key: <ROADMAP_API_KEY>`  
  - 헤더 `Authorization: Bearer <ROADMAP_API_KEY>`  
  `ROADMAP_API_KEY`가 없으면 인증 없이 호출 가능(개발용).

## 요청 본문 (JSON)

로드맵 RAG 컨텍스트 형태로 보냅니다.

| 필드 | 타입 | 설명 |
|------|------|------|
| `profile` | 배열 | **필수.** 내담자 프로필 객체 배열. `profile[0]`에 최소한 `recommended_careers`, `target_company`, `major` 등 포함 |
| `counseling` | 배열 | 상담 기록 (선택) |
| `analysis` | 배열 | 상담 분석 결과 (선택, strengths, interest_keywords 등) |
| `roadmap` | 배열 | 기존 로드맵 (선택) |

`profile[0]` 예시:

```json
{
  "recommended_careers": "백엔드 개발자, 소프트웨어 엔지니어",
  "target_company": "네이버, 카카오",
  "major": "컴퓨터공학",
  "education_level": "대학교 졸업",
  "work_experience_years": 2
}
```

## 응답 (성공 시)

`RunRoadmapResult`와 동일한 JSON:

- `info`: 마일스톤 배열 (id, title, description, status, date, resources, actionItems 등)
- `dynamicSkills`: 역량 목록
- `dynamicCerts`: 추천 자격증 목록
- `targetJob`, `targetCompany`: 확정된 목표 직무/기업

---

## Colab에서 호출 예시

```python
import requests
import json

# 배포된 앱 URL (예: https://your-app.vercel.app)
BASE_URL = "https://your-app.vercel.app"
# ROADMAP_API_KEY를 설정했다면 동일한 값 사용
API_KEY = "your-roadmap-api-key"  # 없으면 None, 서버도 키 미설정이어야 함

payload = {
    "profile": [
        {
            "recommended_careers": "데이터 엔지니어, ML 엔지니어",
            "target_company": "삼성전자, LG AI연구원",
            "major": "컴퓨터공학",
            "education_level": "대학교 졸업",
            "work_experience_years": 0
        }
    ],
    "counseling": [],
    "analysis": [],
    "roadmap": []
}

headers = {"Content-Type": "application/json"}
if API_KEY:
    headers["X-API-Key"] = API_KEY

resp = requests.post(f"{BASE_URL}/api/roadmap/generate", json=payload, headers=headers)
resp.raise_for_status()
result = resp.json()

print("목표 직무:", result["targetJob"])
print("목표 기업:", result["targetCompany"])
print("마일스톤 수:", len(result["info"]))
for m in result["info"][:3]:
    print("-", m["title"], m["description"][:80] + "...")
```

## cURL 예시

```bash
curl -X POST "https://your-app.vercel.app/api/roadmap/generate" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-roadmap-api-key" \
  -d '{
    "profile": [{
      "recommended_careers": "백엔드 개발자",
      "target_company": "네이버",
      "major": "컴퓨터공학"
    }],
    "counseling": [],
    "analysis": [],
    "roadmap": []
  }'
```
