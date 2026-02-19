/**
 * Q-Net / 공공데이터 API 호출 (서버 전용).
 * 자격증 목록, 시험일정, 직무역량 조회.
 */
import { XMLParser } from 'fast-xml-parser'

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
            const res = await fetch(fullUrl, { next: { revalidate: 3600 } })
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

/** 국가자격 목록 (일부) */
export async function getQualificationList(): Promise<unknown[]> {
    if (!QNET_SERVICE_KEY) {
        console.warn('[Q-Net API] QNET_SERVICE_KEY가 없어 자격증 목록 조회를 건너뜁니다')
        return []
    }
    console.log('[Q-Net API] 자격증 목록 조회 시작')
    const url = 'https://openapi.q-net.or.kr/api/service/rest/InquiryListNationalQualifcationSVC/getList'
    const xml = await fetchXml(url, { pageNo: '1', numOfRows: '10' })
    if (!xml) {
        console.warn('[Q-Net API] 자격증 목록 조회 실패 - XML 응답 없음')
        return []
    }
    const parsed = parseXml(xml)
    const items = extractItems(parsed)
    console.log('[Q-Net API] 자격증 목록 조회 완료 - 결과 수:', items.length)
    return items
}

/** 자격 시험 일정 (예: 2026년 이후) */
export async function getExamSchedule(): Promise<unknown[]> {
    if (!QNET_SERVICE_KEY) {
        console.warn('[Q-Net API] QNET_SERVICE_KEY가 없어 시험 일정 조회를 건너뜁니다')
        return []
    }
    console.log('[Q-Net API] 시험 일정 조회 시작')
    const url = 'https://apis.data.go.kr/B490007/qualExamSchd/getQualExamSchdList'
    const xml = await fetchXml(url, { implYmd: '20260101' })
    if (!xml) {
        console.warn('[Q-Net API] 시험 일정 조회 실패 - XML 응답 없음')
        return []
    }
    const parsed = parseXml(xml)
    const items = extractItems(parsed)
    console.log('[Q-Net API] 시험 일정 조회 완료 - 결과 수:', items.length)
    return items
}


