/**
 * RAG plan → 마일스톤/스킬/자격 변환. 목표 구체화 안내 문자열 포함.
 * 독립 모듈용 — lib 내부 타입·필터만 사용.
 */
import type { RagRoadmapResult, CompanyInfo } from './roadmap-types'
import { filterRelevantQualifications } from './roadmap-qnet'
import { extractKeywordsFromAnalysis } from './roadmap-competencies'

/** 목표 기업이 없을 때 목표 구체화를 위한 상세 안내 (직무·산업·역량 구체화) */
export const GOAL_CONCRETIZATION_CONTENT = `【목표 구체화를 위한 상세 안내】

1. SMART 목표 설정
• Specific(구체적): "개발자"가 아니라 "백엔드/프론트엔드/데이터 엔지니어" 등 구체 직무
• Measurable(측정 가능): "역량 쌓기"가 아니라 "정보처리기사 취득", "포트폴리오 2개 완성"
• Achievable(달성 가능): 현재 학력·경력에서 1~2년 내 도달 가능한 수준
• Relevant(관련성): 전공·경험·관심사와 연결된 직무·산업
• Time-bound(기한): "3개월 내 자격증 취득", "6개월 내 인턴 지원" 등

2. 직무·산업 구체화
• 희망 직무를 1~2개로 좁히기: 채용 사이트(원티드, 잡코리아)에서 실제 공고 키워드로 검색해 비슷한 직무명 확인
• 관심 산업 정하기: IT·금융·제조·공공·스타트업 등, 직무와 맞는 산업 1~2개
• 목표 연봉·근무 형태(정규직/인턴/프리랜서) 범위 정하기

3. 역량 갭 분석
• 해당 직무 채용 공고 5~10개에서 공통 요구 역량·자격·경험 정리
• 현재 보유 역량과 비교해 부족한 항목(기술, 자격증, 프로젝트 경험 등) 리스트업
• 부족 역량 중 3개월·6개월·1년 단위로 보완할 항목 우선순위 정하기

4. 다음 단계
• 위 내용을 바탕으로 1단계(기초 역량)→2단계(역량 강화·포트폴리오)→3단계(취업·안착) 순서로 실행 계획 수립
• 상담 시 "구체적 직무명", "선호 산업", "갭 분석 결과"를 공유하면 더 맞춤형 로드맵을 만들 수 있습니다.`

export type RagPlanToMilestonesResult = {
    info: Array<{ id: string; title: string; description: string; status: string; date: string; quizScore: number; resources: { title: string; url: string; type: 'video' | 'article' | 'quiz'; content?: string }[]; actionItems: string[] }>
    dynamicSkills: Array<{ title: string; desc: string; level: number }>
    dynamicCerts: Array<{ type: string; name: string; status: string; color: string; details?: { written?: string; practical?: string; difficulty?: string; examSchedule?: string; description?: string } }>
    targetJob: string
    targetCompany: string
}

/** RAG plan + Q-Net API 데이터를 기존 마일스톤/스킬/자격 형식으로 변환 */
export function ragPlanToMilestones(
    rag: RagRoadmapResult,
    clientData: { recommended_careers?: string; target_company?: string; education_level?: string; major?: string },
    qualifications: unknown[] = [],
    examSchedule: unknown[] = [],
    companyInfos?: CompanyInfo[],
    analysisList: Array<{ strengths?: string; interest_keywords?: string; career_values?: string }> = []
): RagPlanToMilestonesResult {
    const targetJob = (clientData?.recommended_careers && clientData.recommended_careers !== '없음' && clientData.recommended_careers !== '미정')
        ? clientData.recommended_careers
        : '희망 직무'
    const targetCompany = (clientData?.target_company && clientData.target_company !== '없음' && clientData.target_company !== '미정')
        ? clientData.target_company
        : ''

    const plan = rag?.plan || []
    const summary = rag?.summary || ''

    const dynamicSkills = [
        { title: `${targetJob} 숙련도`, desc: `${targetJob} 수행을 위한 핵심 역량`, level: 80 },
        { title: '데이터 분석 및 활용', desc: '실무 데이터 기반 문제 해결 능력', level: 70 },
        { title: '협업 도구 활용', desc: '팀 협업 시스템 숙련도', level: 85 },
        { title: '문제 해결', desc: '논리적 분해 및 해결 능력', level: 75 },
    ]

    const major = clientData?.major || ''
    const extractedKw = extractKeywordsFromAnalysis(analysisList)
    let dynamicCerts = filterRelevantQualifications(qualifications, examSchedule, targetJob, major, extractedKw)

    // Q-Net 시험 일정 조회 헬퍼 함수
    const findExamDate = (name: string, defaultSchedule: string): string => {
        const found = examSchedule.find((exam: any) => {
            const qualName = String(exam.qualName || exam.qualNm || '').trim()
            return qualName && name.includes(qualName)
        }) as any

        if (found) {
            const date = String(found.examDate || found.implYmd || found.docRegStartDt || '').trim()
            if (date) return `시험일정: ${date} (접수: ${found.docRegStartDt}~${found.docRegEndDt})`
        }
        return `시험일정: ${defaultSchedule}`
    }

    if (dynamicCerts.length < 3) {
        const isDevCareer = /개발|엔지니어|소프트웨어|프로그래머/i.test(targetJob)
        const isDataCareer = /데이터|분석|AI|인공지능/i.test(targetJob)
        if (isDevCareer || isDataCareer) {
            if (!dynamicCerts.some(c => c.name.includes('정보처리'))) {
                dynamicCerts.unshift({
                    type: '자격증',
                    name: '정보처리기사',
                    status: '취득 권장',
                    color: 'text-blue-600 bg-blue-50',
                    details: {
                        written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)',
                        practical: '실기: 100점 만점에 60점 이상',
                        difficulty: '난이도: 중상',
                        examSchedule: findExamDate('정보처리기사', '연 3회 (3월, 7월, 10월)'),
                        description: '정보처리 관련 산업기사 자격을 취득한 자 또는 관련학과 졸업자 등이 응시할 수 있는 국가기술자격증입니다.'
                    }
                })
            }
        }
    }

    const isDevCareer = /개발|엔지니어|소프트웨어|프로그래머/i.test(targetJob)
    const isDataCareer = /데이터|분석|AI|인공지능/i.test(targetJob)
    const isCivilCareer = /토목|건설|측량|건축|구조/i.test(targetJob)
    const isSafetyCareer = /안전|산업안전|건설안전/i.test(targetJob)
    const isMechCareer = /기계|자동차|메카트로닉스/i.test(targetJob)
    const isElecCareer = /전기|전자|전기기사|전자기사/i.test(targetJob)

    if (isDataCareer) {
        dynamicCerts.push(
            { type: '자격증', name: 'ADsP (데이터분석 준전문가)', status: '취득 권장', color: 'text-orange-600 bg-orange-50', details: { written: '필기: 60점 이상 (100점 만점)', practical: '실기: 없음', difficulty: '난이도: 중하', examSchedule: findExamDate('데이터분석준전문가', '연 4회 (3월, 6월, 9월, 12월)'), description: '데이터 분석 기초 지식과 데이터 분석 프로세스에 대한 이해를 인증하는 자격증입니다.' } },
            { type: '자격증', name: 'SQLD (SQL 개발자)', status: '취득 권장', color: 'text-green-600 bg-green-50', details: { written: '필기: 60점 이상 (100점 만점)', practical: '실기: 없음', difficulty: '난이도: 중하', examSchedule: findExamDate('SQL개발자', '연 4회 (3월, 6월, 9월, 12월)'), description: '데이터베이스와 데이터 모델링에 대한 지식을 바탕으로 SQL을 작성하고 활용할 수 있는 능력을 인증합니다.' } },
            { type: '자격증', name: '빅데이터분석기사', status: '준비 중', color: 'text-purple-600 bg-purple-50', details: { written: '필기: 100점 만점에 60점 이상', practical: '실기: 100점 만점에 60점 이상', difficulty: '난이도: 상', examSchedule: findExamDate('빅데이터분석기사', '연 1회 (10월)'), description: '빅데이터 분석 및 활용 능력을 종합적으로 평가하는 국가기술자격증입니다.' } }
        )
    } else if (isCivilCareer) {
        dynamicCerts.push(
            { type: '자격증', name: '토목기사', status: '취득 권장', color: 'text-blue-600 bg-blue-50', details: { written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)', practical: '실기: 100점 만점에 60점 이상', difficulty: '난이도: 중상', examSchedule: findExamDate('토목기사', '연 2회 (4월, 10월)'), description: '토목공학에 관한 전문지식과 기술을 바탕으로 토목공사 설계, 시공, 감리 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.' } },
            { type: '자격증', name: '건설기사', status: '취득 권장', color: 'text-green-600 bg-green-50', details: { written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)', practical: '실기: 100점 만점에 60점 이상', difficulty: '난이도: 중상', examSchedule: findExamDate('건설기사', '연 2회 (4월, 10월)'), description: '건설공학에 관한 전문지식과 기술을 바탕으로 건설공사 설계, 시공, 감리 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.' } },
            { type: '자격증', name: '측량기사', status: '준비 중', color: 'text-orange-600 bg-orange-50', details: { written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)', practical: '실기: 100점 만점에 60점 이상', difficulty: '난이도: 중', examSchedule: findExamDate('측량기사', '연 2회 (4월, 10월)'), description: '측량에 관한 전문지식과 기술을 바탕으로 지형측량, 지적측량, 공공측량 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.' } },
            { type: '자격증', name: '건설안전기사', status: '준비 중', color: 'text-red-600 bg-red-50', details: { written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)', practical: '실기: 100점 만점에 60점 이상', difficulty: '난이도: 중상', examSchedule: findExamDate('건설안전기사', '연 2회 (4월, 10월)'), description: '건설현장의 안전관리에 관한 전문지식과 기술을 바탕으로 안전관리 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.' } }
        )
    } else if (isSafetyCareer) {
        dynamicCerts.push(
            { type: '자격증', name: '산업안전기사', status: '취득 권장', color: 'text-blue-600 bg-blue-50', details: { written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)', practical: '실기: 100점 만점에 60점 이상', difficulty: '난이도: 중상', examSchedule: findExamDate('산업안전기사', '연 2회 (4월, 10월)'), description: '산업안전에 관한 전문지식과 기술을 바탕으로 산업현장의 안전관리 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.' } },
            { type: '자격증', name: '건설안전기사', status: '취득 권장', color: 'text-green-600 bg-green-50', details: { written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)', practical: '실기: 100점 만점에 60점 이상', difficulty: '난이도: 중상', examSchedule: findExamDate('건설안전기사', '연 2회 (4월, 10월)'), description: '건설현장의 안전관리에 관한 전문지식과 기술을 바탕으로 안전관리 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.' } },
            { type: '자격증', name: '소방설비기사', status: '준비 중', color: 'text-red-600 bg-red-50', details: { written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)', practical: '실기: 100점 만점에 60점 이상', difficulty: '난이도: 중상', examSchedule: findExamDate('소방설비기사', '연 2회 (4월, 10월)'), description: '소방설비에 관한 전문지식과 기술을 바탕으로 소방설비 설치, 유지관리 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.' } },
            { type: '자격증', name: '위험물기능사', status: '준비 중', color: 'text-orange-600 bg-orange-50', details: { written: '필기: 100점 만점에 60점 이상', practical: '실기: 100점 만점에 60점 이상', difficulty: '난이도: 중', examSchedule: findExamDate('위험물기능사', '연 2회 (4월, 10월)'), description: '위험물의 취급 및 저장에 관한 전문지식과 기술을 인증하는 국가기술자격증입니다.' } }
        )
    } else if (isMechCareer) {
        dynamicCerts.push(
            { type: '자격증', name: '기계기사', status: '취득 권장', color: 'text-blue-600 bg-blue-50', details: { written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)', practical: '실기: 100점 만점에 60점 이상', difficulty: '난이도: 중상', examSchedule: findExamDate('기계기사', '연 2회 (4월, 10월)'), description: '기계공학에 관한 전문지식과 기술을 바탕으로 기계설계, 제조, 유지관리 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.' } },
            { type: '자격증', name: '자동차정비기사', status: '취득 권장', color: 'text-green-600 bg-green-50', details: { written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)', practical: '실기: 100점 만점에 60점 이상', difficulty: '난이도: 중', examSchedule: findExamDate('자동차정비기사', '연 2회 (4월, 10월)'), description: '자동차 정비에 관한 전문지식과 기술을 바탕으로 자동차 점검, 수리, 정비 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.' } },
            { type: '자격증', name: '용접기사', status: '준비 중', color: 'text-orange-600 bg-orange-50', details: { written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)', practical: '실기: 100점 만점에 60점 이상', difficulty: '난이도: 중', examSchedule: findExamDate('용접기사', '연 2회 (4월, 10월)'), description: '용접에 관한 전문지식과 기술을 바탕으로 용접 작업을 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.' } },
            { type: '자격증', name: '건설기계기사', status: '준비 중', color: 'text-purple-600 bg-purple-50', details: { written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)', practical: '실기: 100점 만점에 60점 이상', difficulty: '난이도: 중상', examSchedule: findExamDate('건설기계기사', '연 2회 (4월, 10월)'), description: '건설기계에 관한 전문지식과 기술을 바탕으로 건설기계의 설계, 제조, 유지관리 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.' } }
        )
    } else if (isElecCareer) {
        dynamicCerts.push(
            { type: '자격증', name: '전기기사', status: '취득 권장', color: 'text-blue-600 bg-blue-50', details: { written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)', practical: '실기: 100점 만점에 60점 이상', difficulty: '난이도: 중상', examSchedule: findExamDate('전기기사', '연 2회 (4월, 10월)'), description: '전기에 관한 전문지식과 기술을 바탕으로 전기설비 설계, 시공, 유지관리 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.' } },
            { type: '자격증', name: '전자기사', status: '취득 권장', color: 'text-green-600 bg-green-50', details: { written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)', practical: '실기: 100점 만점에 60점 이상', difficulty: '난이도: 중상', examSchedule: findExamDate('전자기사', '연 2회 (4월, 10월)'), description: '전자공학에 관한 전문지식과 기술을 바탕으로 전자설비 설계, 제조, 유지관리 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.' } },
            { type: '자격증', name: '전기공사기사', status: '준비 중', color: 'text-orange-600 bg-orange-50', details: { written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)', practical: '실기: 100점 만점에 60점 이상', difficulty: '난이도: 중', examSchedule: findExamDate('전기공사기사', '연 2회 (4월, 10월)'), description: '전기공사에 관한 전문지식과 기술을 바탕으로 전기공사 설계, 시공, 감리 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.' } },
            { type: '자격증', name: '산업계측기사', status: '준비 중', color: 'text-purple-600 bg-purple-50', details: { written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)', practical: '실기: 100점 만점에 60점 이상', difficulty: '난이도: 중', examSchedule: findExamDate('산업계측기사', '연 2회 (4월, 10월)'), description: '산업계측에 관한 전문지식과 기술을 바탕으로 계측기기 설계, 설치, 유지관리 등의 업무를 수행할 수 있는 능력을 인증하는 국가기술자격증입니다.' } }
        )
    } else {
        dynamicCerts.push(
            { type: '자격증', name: '정보처리기사', status: '취득 권장', color: 'text-blue-600 bg-blue-50', details: { written: '필기: 100점 만점에 60점 이상 (과목당 40점 이상)', practical: '실기: 100점 만점에 60점 이상', difficulty: '난이도: 중상', examSchedule: findExamDate('정보처리기사', '연 3회 (3월, 7월, 10월)'), description: '정보처리 관련 산업기사 자격을 취득한 자 또는 관련학과 졸업자 등이 응시할 수 있는 국가기술자격증입니다.' } },
            { type: '자격증', name: 'ADsP (데이터분석 준전문가)', status: '준비 중', color: 'text-orange-600 bg-orange-50', details: { written: '필기: 60점 이상 (100점 만점)', practical: '실기: 없음', difficulty: '난이도: 중하', examSchedule: findExamDate('데이터분석준전문가', '연 4회 (3월, 6월, 9월, 12월)'), description: '데이터 분석 기초 지식과 데이터 분석 프로세스에 대한 이해를 인증하는 자격증입니다.' } },
            { type: '자격증', name: 'SQLD (SQL 개발자)', status: '취득 권장', color: 'text-green-600 bg-green-50', details: { written: '필기: 60점 이상 (100점 만점)', practical: '실기: 없음', difficulty: '난이도: 중하', examSchedule: findExamDate('SQL개발자', '연 4회 (3월, 6월, 9월, 12월)'), description: '데이터베이스와 데이터 모델링에 대한 지식을 바탕으로 SQL을 작성하고 활용할 수 있는 능력을 인증합니다.' } },
            { type: '자격증', name: '컴퓨터활용능력 1급', status: '준비 중', color: 'text-purple-600 bg-purple-50', details: { written: '필기: 70점 이상 (100점 만점)', practical: '실기: 70점 이상 (100점 만점)', difficulty: '난이도: 중', examSchedule: findExamDate('컴퓨터활용능력', '연 4회 (3월, 6월, 9월, 12월)'), description: '컴퓨터 활용 능력을 평가하는 자격증으로, 엑셀, 액세스 등의 활용 능력을 인증합니다.' } }
        )
    }

    let educationProgram = ''
    if (isDevCareer) {
        educationProgram = ['패스트캠퍼스 백엔드 개발 부트캠프', '네이버 커넥트재단 부스트캠프', '삼성 SW 아카데미', '코드스쿼드 마스터즈 코스', '우아한테크코스'][Math.floor(Math.random() * 5)]
    } else if (isDataCareer) {
        educationProgram = ['패스트캠퍼스 데이터 사이언스 부트캠프', '네이버 커넥트재단 부스트캠프 AI', '삼성 SDS 멀티캠퍼스 데이터 분석 과정', '코드스테이츠 AI 부트캠프', '플래티넘 데이터 아카데미'][Math.floor(Math.random() * 5)]
    } else if (isCivilCareer) {
        educationProgram = ['한국건설기술인협회 토목기사 실무과정', '한국건설기술교육원 건설기사 양성과정', '한국토지주택공사 토목기술자 교육과정', '건설교육원 토목설계 실무과정', '한국건설산업교육원 토목시공 전문과정'][Math.floor(Math.random() * 5)]
    } else if (isSafetyCareer) {
        educationProgram = ['한국산업안전보건공단 산업안전기사 양성과정', '건설안전교육원 건설안전기사 실무과정', '한국안전교육원 산업안전 전문가 과정', '안전보건교육원 안전관리자 양성과정', '한국건설안전협회 건설안전 전문교육'][Math.floor(Math.random() * 5)]
    } else if (isMechCareer) {
        educationProgram = ['한국기계산업진흥회 기계기사 실무과정', '한국자동차산업협회 자동차정비 전문교육', '기계교육원 기계설계 실무과정', '한국산업인력공단 기계기사 양성과정', '기계기술교육원 기계제조 전문과정'][Math.floor(Math.random() * 5)]
    } else if (isElecCareer) {
        educationProgram = ['한국전기공사협회 전기기사 실무과정', '한국전자산업진흥회 전자기사 양성과정', '전기교육원 전기설비 실무과정', '한국산업인력공단 전기기사 전문교육', '전자기술교육원 전자설계 실무과정'][Math.floor(Math.random() * 5)]
    } else {
        educationProgram = ['패스트캠퍼스 IT 부트캠프', '네이버 커넥트재단 부스트캠프', '삼성 SW 아카데미', '코드스테이츠 부트캠프', '멀티캠퍼스 IT 과정'][Math.floor(Math.random() * 5)]
    }
    dynamicCerts.push({ type: '교육', name: educationProgram, status: '수료 권장', color: 'text-indigo-600 bg-indigo-50' })

    /** "채용 공고·인재상 분석 기반" 등 맥락 문구 제거 후 실질적 수행 내용만 반환 */
    const stripMetaPhrases = (s: string): string => {
        let t = s
            .replace(/\s*채용\s*공고\s*·?\s*인재상\s*(검색\s*)?분석\s*기반\s*/gi, ' ')
            .replace(/\s*검색\s*기반\s*/gi, ' ')
            .replace(/\s*\(검색\s*결과\)\s*/g, ' ')
            .replace(/\s*[-–]\s*웹\s*검색.*?\./g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
        if (t.startsWith('·')) t = t.slice(1).trim()
        return t || s
    }
    /** 추상적 단계 제목 또는 "목표 기업" 포함 시 구체적 실행 방안(추천활동/역량)으로 보완 */
    const concreteTitle = (step: (typeof plan)[0], i: number): string => {
        let raw = (step.단계 || `Step${i + 1}`).trim()
        raw = stripMetaPhrases(raw)
        const hasTargetCompanyPhrase = /목표 기업/.test(raw)
        const isVague = hasTargetCompanyPhrase || (/맞춤형 역량 강화|최종 합격 및 안착|역량 강화/.test(raw) && raw.length < 50)
        if (!isVague) return raw
        const actions = Array.isArray(step.추천활동) ? step.추천활동 as string[] : []
        const competencies = Array.isArray(step.역량) ? step.역량 as string[] : []
        const concrete = actions.find((a: string) => a.length > 25 && /프로젝트|인턴|자격증|프로그래머스|백준|원티드|STAR|면접/.test(a))
            || competencies.find((c: string) => c.length > 25 && /프로젝트|인턴|자격증|프로그래머스|백준|원티드|STAR|면접/.test(c))
        if (concrete) return stripMetaPhrases(concrete.length > 60 ? concrete.slice(0, 57) + '…' : concrete)
        return raw
    }

    const info = plan.map((step, i) => {
        const isFirst = i === 0
        const rawActions = Array.isArray(step.추천활동) ? step.추천활동 : []
        const actionItems = rawActions.map((a: unknown) => stripMetaPhrases(String(a)))
        const resources: { title: string; url: string; type: 'video' | 'article' | 'quiz'; content?: string }[] = []

        if (companyInfos?.length && (i === 1 || i === 2)) {
            for (const co of companyInfos) {
                if (co.talentProfile) resources.push({ title: `${co.companyName} 인재상`, url: '#', type: 'article', content: co.talentProfile.slice(0, 1500) })
                if (co.recruitmentInfo) resources.push({ title: `${co.companyName} 채용·공고 요약`, url: '#', type: 'article', content: co.recruitmentInfo.slice(0, 1500) })
                if (co.techStack) resources.push({ title: `${co.companyName} 기술 스택·개발 환경`, url: '#', type: 'article', content: co.techStack.slice(0, 1500) })
            }
        }
        if (!targetCompany && (i === 0 || i === 1)) {
            resources.push({ title: '목표 구체화 가이드', url: '#', type: 'article', content: GOAL_CONCRETIZATION_CONTENT })
        }
        if (isFirst && step.자격정보?.length) {
            const firstQual = step.자격정보[0] as Record<string, unknown>
            resources.push({ title: String(firstQual?.qualName ?? '자격 정보'), url: '#', type: 'article' })
        }
        if (step.직업군?.length) resources.push({ title: `직업군: ${step.직업군.slice(0, 2).join(', ')}`, url: '#', type: 'article' })
        if (resources.length === 0) resources.push({ title: '진로 가이드', url: '#', type: 'article' })

        let stepDescription = ''
        if (summary && isFirst) {
            stepDescription = summary
        } else if (i === 1) {
            if (step.역량?.length && step.역량.some((v: string) => v.length > 30)) {
                stepDescription = step.역량.join('. ')
            } else if (actionItems.length > 0) {
                const relevantActions = actionItems.filter((item: string) => /프로젝트|인턴|경험|자격증|포트폴리오|오픈소스|협업/i.test(item))
                stepDescription = (relevantActions.length > 0 ? relevantActions : actionItems).slice(0, 2).join('. ')
            } else if (step.역량?.length) {
                stepDescription = step.역량.join('. ')
            } else {
                stepDescription = targetCompany ? '목표 기업 맞춤형 역량 강화를 위한 구체적인 방안을 수립합니다.' : '목표 직무(직무목표)에 맞춘 역량 강화를 위한 구체적인 방안을 수립합니다.'
            }
        } else if (i === 2) {
            if (step.역량?.length && step.역량.some((v: string) => /프로그래머스|백준|원티드|면접|STAR|사이트/i.test(v))) {
                stepDescription = step.역량.join('. ')
            } else if (actionItems.length > 0) {
                const relevantActions = actionItems.filter((item: string) => /면접|이력서|자기소개서|STAR|프로그래머스|백준|원티드|로켓펀치|온보딩/i.test(item))
                stepDescription = (relevantActions.length > 0 ? relevantActions : actionItems).slice(0, 2).join('. ')
            } else if (step.역량?.length) {
                stepDescription = step.역량.join('. ')
            } else {
                stepDescription = targetCompany ? '최종 합격을 위한 전략 수립 및 면접 준비를 진행합니다.' : '목표 직무 달성을 위한 최종 합격 및 면접 전략 수립을 진행합니다.'
            }
        } else if (step.역량?.length) {
            stepDescription = step.역량.join('. ')
        } else {
            stepDescription = '단계별 목표를 진행합니다.'
        }

        return {
            id: `step-${i + 1}`,
            title: concreteTitle(step, i),
            description: stepDescription,
            status: i === 0 ? 'in-progress' : 'locked',
            date: i === 0 ? new Date().toLocaleDateString('ko-KR') : '',
            quizScore: 0,
            resources,
            actionItems,
        }
    })

    if (info.length === 0) {
        info.push({
            id: 'step-1',
            title: '1단계: 목표 설정',
            description: '상담 및 프로필을 바탕으로 목표를 구체화합니다.',
            status: 'in-progress',
            date: new Date().toLocaleDateString('ko-KR'),
            quizScore: 0,
            resources: [{ title: '진로 가이드', url: '#', type: 'article' }],
            actionItems: ['목표 직무·기업 조사', '역량 갭 분석'],
        })
    }

    return { info, dynamicSkills, dynamicCerts, targetJob, targetCompany }
}
