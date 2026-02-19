/**
 * Q-Net / 공공데이터 API 호출 (서버 전용).
 * 자격증 목록, 시험일정, 직무역량 조회.
 */
import { XMLParser } from 'fast-xml-parser'
import { findJmCd } from './qnet-codes'

const QNET_SERVICE_KEY = process.env.QNET_SERVICE_KEY || ''

function parseXml<T = Record<string, unknown>>(xmlText: string): T {
    const parser = new XMLParser({ ignoreAttributes: false })
    return parser.parse(xmlText) as T
}

async function fetchXml(url: string, params: Record<string, string> = {}, retries = 3): Promise<string | null> {
    const searchParams = new URLSearchParams({ ...params, serviceKey: QNET_SERVICE_KEY })
    const fullUrl = `${url}?${searchParams.toString()}`

    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            console.log(`[Q-Net API] 요청 시도 ${attempt + 1}/${retries} - URL: ${url}`)
            const res = await fetch(fullUrl, { cache: 'no-store' })
            if (res.ok) {
                const text = await res.text()
                console.log(`[Q-Net API] 응답 성공 - 상태: ${res.status}, 길이: ${text.length}`)
                return text
            } else {
                const errorText = await res.text().catch(() => '')
                console.error(`[Q-Net API] 응답 실패 - 상태: ${res.status}, 내용: ${errorText.slice(0, 200)}`)
            }
        } catch (e) {
            console.error(`[Q-Net API] 요청 에러 (시도 ${attempt + 1}/${retries}):`, e)
            if (attempt === retries - 1) return null
            await new Promise((r) => setTimeout(r, 2000))
        }
    }
    console.error('[Q-Net API] 모든 재시도 실패')
    return null
}

function extractItems(obj: unknown): unknown[] {
    if (!obj || typeof obj !== 'object') return []
    const body = (obj as Record<string, unknown>).response as Record<string, unknown> | undefined
    const items = body?.body && typeof (body.body as Record<string, unknown>).items === 'object'
        ? (body.body as Record<string, unknown>).items as Record<string, unknown>
        : null
    if (!items) return []
    const item = items.item
    if (Array.isArray(item)) return item
    if (item && typeof item === 'object') return [item]
    return []
}

/** 국가자격 목록 (전체 조회 시도) */
export async function getQualificationList(): Promise<unknown[]> {
    if (!QNET_SERVICE_KEY) {
        console.warn('[Q-Net API] QNET_SERVICE_KEY가 없어 자격증 목록 조회를 건너뜁니다')
        return []
    }
    console.log('[Q-Net API] 자격증 목록 조회 시작')
    // 공공데이터포털/Q-Net OpenAPI (openapi.q-net.or.kr)
    const url = 'https://openapi.q-net.or.kr/api/service/rest/InquiryListNationalQualifcationSVC/getList'

    // 한번에 많이 가져오기 (API 제한 확인 필요, 우선 1000개 시도)
    const xml = await fetchXml(url, { pageNo: '1', numOfRows: '1000', _type: 'xml' })
    if (!xml) {
        console.warn('[Q-Net API] 자격증 목록 조회 실패 - XML 응답 없음')
        return []
    }
    const parsed = parseXml(xml)
    const items = extractItems(parsed)
    console.log('[Q-Net API] 자격증 목록 조회 완료 - 결과 수:', items.length)
    return items
}

/** 
 * 자격 시험 일정 조회 
 * 1. 정적 맵에서 jmCd 검색 (빠른 조회)
 * 2. 없으면 자격증 목록 API 조회 (Fallback)
 * 3. 확보된 jmCd로 시험일정 API 호출
 */
export async function getExamSchedule(targetNames: string[] = []): Promise<unknown[]> {
    if (!QNET_SERVICE_KEY) {
        console.warn('[Q-Net API] QNET_SERVICE_KEY가 없어 시험 일정 조회를 건너뜁니다')
        return []
    }

    // 요청된 자격증 목록 (중복 제거)
    const uniqueTargets = Array.from(new Set(targetNames))
    console.log(`[Q-Net API] 일정 조회 요청: ${uniqueTargets.join(', ')}`)

    const targetJmCds: { name: string, code: string }[] = []
    const missingTargets: string[] = []

    // 1. 정적 맵에서 우선 검색
    for (const name of uniqueTargets) {
        const code = findJmCd(name)
        if (code) {
            targetJmCds.push({ name, code })
        } else {
            // KData 주관 자격증(SQLD, ADsP 등)은 Q-Net API에 없음 -> 제외
            // 그 외 Q-Net 자격증일 수 있는 것만 Fallback 대상
            if (!/SQL|ADsP|데이터분석|컴퓨터활용/i.test(name)) {
                missingTargets.push(name)
            }
        }
    }

    // 2. 맵에 없는 자격증이 있다면 API 목록 조회 (Fallback)
    if (missingTargets.length > 0) {
        console.log(`[Q-Net API] 정적 맵에 없는 자격증 검색 시도: ${missingTargets.join(', ')}`)
        try {
            const qualList = await getQualificationList()
            for (const item of qualList as any[]) {
                const name = String(item.jmNm || item.qualNm || '').trim()
                const code = String(item.jmCd || item.qualGbCd || '').trim()

                for (const missing of missingTargets) {
                    if (name.includes(missing) || missing.includes(name)) {
                        if (!targetJmCds.some(t => t.code === code)) {
                            targetJmCds.push({ name: missing, code })
                        }
                    }
                }
            }
        } catch (e) {
            console.error('[Q-Net API] 자격증 목록 Fallback 조회 실패:', e)
        }
    }

    console.log(`[Q-Net API] 최종 타겟 자격증 ${targetJmCds.length}개 식별:`, targetJmCds.map(t => t.name))

    // 3. 각 자격증별 일정 조회 (병렬 처리)
    const url = 'https://apis.data.go.kr/B490007/qualExamSchd/getQualExamSchdList'
    const schedules: unknown[] = []
    const currentYear = new Date().getFullYear().toString()

    const promises = targetJmCds.map(async ({ name, code }) => {
        // 파라미터: implYy(시행년도), jmCd(종목코드)
        // qualgbCd는 생략
        const xml = await fetchXml(url, {
            implYy: currentYear,
            jmCd: code,
            numOfRows: '100', // 호출 과도 방지용 제한 (페이지당 100개)
            pageNo: '1',
            dataFormat: 'xml'
        })

        if (!xml) return []

        const parsed = parseXml(xml)
        const items = extractItems(parsed)
        // item에 qualName이 없을 수 있으므로 주입
        return items.map((item: any) => ({ ...item, qualName: name }))
    })

    const results = await Promise.all(promises)
    results.forEach(res => schedules.push(...res))

    console.log('[Q-Net API] 시험 일정 조회 완료 - 총 일정 수:', schedules.length)
    return schedules
}
