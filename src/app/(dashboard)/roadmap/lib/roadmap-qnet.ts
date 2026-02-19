/** Q-Net 자격증을 전공/직무·추출 키워드로 필터링 (키워드 기반 필터링, RAG 실패 시 폴백용) */
export function filterRelevantQualifications(
    qualifications: unknown[],
    examSchedule: unknown[],
    targetJob: string,
    major: string,
    extractedKeywords: string[] = []
): Array<{ type: string; name: string; status: string; color: string; details?: { written?: string; practical?: string; difficulty?: string; examSchedule?: string; description?: string } }> {
    const keywords: string[] = []

    if (extractedKeywords.length > 0) {
        keywords.push(...extractedKeywords)
    }

    if (targetJob) {
        keywords.push(...targetJob.split(/[,\s]+/).filter((k) => k.length > 1))
        if (extractedKeywords.length === 0) {
            if (/개발|엔지니어|소프트웨어|프로그래머/i.test(targetJob)) keywords.push('정보처리', '소프트웨어', 'IT', '컴퓨터')
            if (/데이터|분석|AI|인공지능/i.test(targetJob)) keywords.push('데이터', '분석', '빅데이터', 'AI')
            if (/토목|건설|측량|건축|구조/i.test(targetJob)) keywords.push('토목', '건설', '측량', '건축', '구조')
            if (/안전|산업안전|건설안전/i.test(targetJob)) keywords.push('안전', '산업안전', '건설안전', '소방')
            if (/기계|자동차|메카트로닉스/i.test(targetJob)) keywords.push('기계', '자동차', '용접', '메카트로닉스')
            if (/전기|전자|전기기사|전자기사/i.test(targetJob)) keywords.push('전기', '전자', '전기공사', '산업계측')
            if (/의료|의학|바이오|생명/i.test(targetJob)) keywords.push('의료', '의학', '바이오', '생명', '의료기기')
            if (/마케팅|경영|경제|상경/i.test(targetJob)) keywords.push('마케팅', '경영', '경제', '사회조사', '컨설팅')
        }
    }

    if (major && major !== '정보 없음' && major !== '전공 분야') {
        keywords.push(...major.split(/[,\s]+/).filter((k) => k.length > 1))
        // 전공별 관련 자격증 키워드 추가
        if (/컴퓨터|정보|소프트웨어|IT|전산/i.test(major)) keywords.push('정보처리', '컴퓨터활용', '정보보안')
        if (/의학|의료|바이오|생명|의공학/i.test(major)) keywords.push('의료기기', '바이오', '생명', '임상')
        if (/토목|건설|건축|측량|구조/i.test(major)) keywords.push('토목', '건설', '건축', '측량', '구조')
        if (/기계|자동차|메카트로닉스|기계공학/i.test(major)) keywords.push('기계', '자동차', '용접', '메카트로닉스')
        if (/전기|전자|전기공학|전자공학/i.test(major)) keywords.push('전기', '전자', '전기공사', '산업계측')
        if (/안전|소방|산업안전/i.test(major)) keywords.push('안전', '산업안전', '건설안전', '소방')
        if (/경영|경제|마케팅|상경|경제학/i.test(major)) keywords.push('경영', '마케팅', '경제', '사회조사', '컨설팅')
        if (/데이터|통계|경영정보/i.test(major)) keywords.push('데이터', '분석', '빅데이터', '통계')
    }

    const uniqueKeywords = [...new Set(keywords.map((k) => k.toLowerCase()))]
    console.log('[Q-Net 필터링] 목표 직무:', targetJob, '전공:', major, '추출 키워드 수:', extractedKeywords.length, '키워드:', uniqueKeywords)

    const relevantCerts: Array<{ type: string; name: string; status: string; color: string; details?: { written?: string; practical?: string; difficulty?: string; examSchedule?: string; description?: string } }> = []
    const seenNames = new Set<string>()

    for (const qual of qualifications) {
        if (!qual || typeof qual !== 'object') continue

        const qualObj = qual as Record<string, unknown>
        const qualName = String(qualObj.qualName || qualObj.qualNm || qualObj.name || qualObj.jmfldnm || '').trim()
        const qualDesc = String(qualObj.description || qualObj.desc || qualObj.qualDesc || qualObj.obligfldnm || qualObj.mdobligfldnm || '').trim()

        if (!qualName || seenNames.has(qualName)) continue

        const qualNameLower = qualName.toLowerCase()
        const qualDescLower = qualDesc.toLowerCase()
        const matchesKeyword = uniqueKeywords.some(
            (keyword) => qualNameLower.includes(keyword) || qualDescLower.includes(keyword)
        )

        if (uniqueKeywords.length === 0 || matchesKeyword || qualNameLower.includes('기사') || qualNameLower.includes('산업기사')) {
            let examScheduleInfo = ''
            for (const exam of examSchedule) {
                if (!exam || typeof exam !== 'object') continue
                const examObj = exam as Record<string, unknown>
                const examQualName = String(examObj.qualName || examObj.qualNm || examObj.jmfldnm || examObj.description || '').trim()
                const examDate = String(examObj.docExamDt || examObj.pracExamStartDt || examObj.examDate || examObj.implYmd || '').trim()
                const matches = examQualName && (qualNameLower.includes(examQualName.toLowerCase()) || examQualName.toLowerCase().includes(qualNameLower) || /기사|산업기사/.test(examQualName) && qualNameLower.includes('기사'))
                if (matches && examDate) {
                    examScheduleInfo = `시험일정: ${examDate}`
                    break
                }
            }

            const colors = [
                'text-blue-600 bg-blue-50',
                'text-green-600 bg-green-50',
                'text-orange-600 bg-orange-50',
                'text-purple-600 bg-purple-50',
                'text-red-600 bg-red-50',
            ]
            const statuses = ['취득 권장', '준비 중', '관심 분야']

            relevantCerts.push({
                type: '자격증',
                name: qualName,
                status: statuses[relevantCerts.length % statuses.length],
                color: colors[relevantCerts.length % colors.length],
                details: {
                    description: qualDesc || `${qualName}에 관한 국가기술자격증입니다.`,
                    examSchedule: examScheduleInfo || '시험일정: Q-Net 공식 사이트 확인',
                    difficulty: '난이도: 중',
                    written: '필기: 100점 만점에 60점 이상',
                    practical: '실기: 100점 만점에 60점 이상',
                },
            })
            seenNames.add(qualName)

            if (relevantCerts.length >= 4) break
        }
    }

    console.log('[Q-Net 필터링] 필터링된 자격증 수:', relevantCerts.length)
    
    // 하드코딩된 폴백 제거 - RAG 기반 추천으로 대체됨
    // RAG가 실패할 때만 키워드 기반 필터링 결과 반환

    return relevantCerts
}
