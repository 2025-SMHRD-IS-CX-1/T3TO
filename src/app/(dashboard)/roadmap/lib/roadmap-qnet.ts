/** 국가기술자격 등급: 학력·경력에 따른 취득 가능 구분용 */
export type CertTier = '기능사' | '산업기사' | '기사' | '기술사'

/** 자격증 한 건의 등급 반환 (Q-Net API jmfldnm/seriesnm 기반, 환각 없음) */
export function getQualTier(qual: unknown): CertTier | null {
    if (!qual || typeof qual !== 'object') return null
    const o = qual as Record<string, unknown>
    const name = String(o.jmfldnm || o.qualName || o.qualNm || o.name || '').trim()
    const series = String(o.seriesnm || '').trim()
    const combined = `${name} ${series}`.trim()
    if (/기술사/.test(combined)) return '기술사'
    if (/산업기사/.test(combined)) return '산업기사'
    if (/기능사/.test(combined)) return '기능사'
    if (/기사/.test(combined)) return '기사'
    if (series === '기능사') return '기능사'
    if (series === '산업기사') return '산업기사'
    if (series === '기사' || series === '기술사') return series as CertTier
    return null
}

/**
 * 내담자 학력·경력에 따라 취득 가능한 자격 등급 목록
 * 고졸: 기능사 (경력 2년 이상 시 산업기사 포함)
 * 대학재학: 기능사, 산업기사
 * 대학졸업: 기능사, 산업기사, 기사 (경력 4년 이상 시 기술사 포함)
 */
export function getEligibleTiers(
    education_level: string,
    work_experience_years: number
): CertTier[] {
    const level = (education_level || '').trim()
    const years = typeof work_experience_years === 'number' ? work_experience_years : 0

    if (/고등학교\s*졸업|고졸|고교\s*졸업/i.test(level)) {
        const tiers: CertTier[] = ['기능사']
        if (years >= 2) tiers.push('산업기사') // 고졸 + 해당 분야 실무 2년 → 산업기사 응시 가능
        return tiers
    }
    if (/대학교\s*재학|대학\s*재학|대재|전문대\s*재학|재학\s*중/i.test(level)) {
        return ['기능사', '산업기사']
    }
    if (/대학교\s*졸업|대졸|4년제|전문대\s*졸업|대학원|석사|박사/i.test(level)) {
        const tiers: CertTier[] = ['기능사', '산업기사', '기사']
        if (years >= 4) tiers.push('기술사')
        return tiers
    }
    // 학력 정보 없음 또는 기타: 모두 추천 가능 (기존 동작 유지)
    return ['기능사', '산업기사', '기사', '기술사']
}

/** 학력·경력에 맞는 자격증만 필터 (직종 경력 포함한 자격조건 반영) */
export function filterQualificationsByEligibility(
    qualifications: unknown[],
    education_level: string,
    work_experience_years: number
): unknown[] {
    const eligible = getEligibleTiers(education_level, work_experience_years)
    return qualifications.filter((qual) => {
        const tier = getQualTier(qual)
        if (!tier) return true // 등급 불명이면 포함 (민간자격 등)
        return eligible.includes(tier)
    })
}

/** API 시험일정 YYYYMMDD → "YYYY년 M월" (환각 방지, API 데이터만 사용) */
function formatExamMonth(dateStr: string): string {
    if (!dateStr || typeof dateStr !== 'string') return ''
    const s = dateStr.trim().replace(/\D/g, '')
    if (s.length < 6) return ''
    const y = s.slice(0, 4)
    const m = parseInt(s.slice(4, 6), 10)
    if (Number.isNaN(m) || m < 1 || m > 12) return ''
    return `${y}년 ${m}월`
}

/**
 * 시험일정 API 결과만 사용해 필기/실기 시행월·회차 문자열 생성 (환각 금지)
 * API 필드: description(회차), docExamDt(필기일), pracExamStartDt(실기일)
 */
export function getExamScheduleWrittenAndPractical(
    examSchedule: unknown[],
    qualName: string
): { examScheduleWritten: string; examSchedulePractical: string } {
    const writtenParts: string[] = []
    const practicalParts: string[] = []
    const qualLower = qualName.toLowerCase().trim()

    for (const exam of examSchedule) {
        if (!exam || typeof exam !== 'object') continue
        const o = exam as Record<string, unknown>
        const examQualName = String(o.qualName || o.qualNm || o.jmfldnm || o.description || '').trim()
        const desc = String(o.description || '').trim()
        const matches =
            (examQualName &&
                (qualLower.includes(examQualName.toLowerCase()) ||
                    examQualName.toLowerCase().includes(qualLower) ||
                    (/기사|산업기사/.test(examQualName) && qualLower.includes('기사')))) ||
            (desc && qualLower.includes('기술사') && /기술사/.test(desc)) ||
            (desc && !/기술사/.test(desc) && (qualLower.includes('기사') || qualLower.includes('산업기사')))

        if (!matches) continue

        const description = String(o.description || '').trim()
        const docDt = String(o.docExamDt || '').trim()
        const pracDt = String(o.pracExamStartDt || '').trim()

        if (docDt) {
            const month = formatExamMonth(docDt)
            writtenParts.push(description ? `${month} ${description}` : month)
        }
        if (pracDt) {
            const month = formatExamMonth(pracDt)
            practicalParts.push(description ? `${month} ${description}` : month)
        }
    }

    return {
        examScheduleWritten: [...new Set(writtenParts)].join(', ') || '',
        examSchedulePractical: [...new Set(practicalParts)].join(', ') || '',
    }
}

/** Q-Net 자격증을 전공/직무·추출 키워드로 필터링 (키워드 기반 필터링, RAG 실패 시 폴백용). 학력·경력에 맞는 등급만 추천 */
export function filterRelevantQualifications(
    qualifications: unknown[],
    examSchedule: unknown[],
    targetJob: string,
    major: string,
    extractedKeywords: string[] = [],
    education_level: string = '',
    work_experience_years: number = 0
): Array<{ type: string; name: string; status: string; color: string; details?: { written?: string; practical?: string; difficulty?: string; examSchedule?: string; examScheduleWritten?: string; examSchedulePractical?: string; description?: string } }> {
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
    const byEligibility = filterQualificationsByEligibility(qualifications, education_level, work_experience_years)
    console.log('[Q-Net 필터링] 목표 직무:', targetJob, '전공:', major, '학력:', education_level || '미입력', '경력:', work_experience_years + '년', '자격조건 필터 후:', byEligibility.length + '개')

    const relevantCerts: Array<{ type: string; name: string; status: string; color: string; details?: { written?: string; practical?: string; difficulty?: string; examSchedule?: string; examScheduleWritten?: string; examSchedulePractical?: string; description?: string } }> = []
    const seenNames = new Set<string>()

    for (const qual of byEligibility) {
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
            const { examScheduleWritten, examSchedulePractical } = getExamScheduleWrittenAndPractical(examSchedule, qualName)

            const colors = [
                'text-blue-600 bg-blue-50',
                'text-green-600 bg-green-50',
                'text-orange-600 bg-orange-50',
                'text-purple-600 bg-purple-50',
                'text-red-600 bg-red-50',
            ]
            const statuses = ['취득 권장', '취득 추천', '관심 분야']

            relevantCerts.push({
                type: '자격증',
                name: qualName,
                status: statuses[relevantCerts.length % statuses.length],
                color: colors[relevantCerts.length % colors.length],
                details: {
                    description: qualDesc || `${qualName}에 관한 국가기술자격증입니다.`,
                    examScheduleWritten,
                    examSchedulePractical,
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
