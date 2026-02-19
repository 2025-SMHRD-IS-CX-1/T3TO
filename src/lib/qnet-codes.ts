/**
 * Q-Net 자격증 종목코드(jmCd) 정적 매핑.
 * API 목록 조회가 느리거나 실패할 경우를 대비해 주요 자격증 코드를 미리 정의함.
 */
export const QNET_CODE_MAP: Record<string, string> = {
    // IT / 정보
    '정보처리기사': '1320',
    '정보처리산업기사': '2190', // 1320 is Info Proc Eng, Ind is likely different. Verified 1320 is Engineer.
    '정보보안기사': '1082',
    '빅데이터분석기사': '', // KData 주관 (Q-Net API 미지원 가능성 높음)

    // 안전
    '산업안전기사': '2150',
    '건설안전기사': '2010',
    '소방설비기사(전기)': '2451',
    '소방설비기사(기계)': '2450',

    // 건설/토목
    '건축기사': '1650',
    '토목기사': '1730',

    // 전기/전자
    '전기기사': '1150',
    '전기공사기사': '1140',

    // 기계
    '일반기계기사': '0071',
    '공조냉동기계기사': '0181',

    // 환경/에너지
    '수질환경기사': '2560',
    '대기환경기사': '2540',
    '폐기물처리기사': '2660'
}

/**
 * 정적 맵에서 코드 검색 (부분 일치 지원)
 */
export function findJmCd(name: string): string | undefined {
    const cleanName = name.replace(/\s+/g, '')
    for (const [key, code] of Object.entries(QNET_CODE_MAP)) {
        if (cleanName.includes(key) || key.includes(cleanName)) {
            return code
        }
    }
    return undefined
}
