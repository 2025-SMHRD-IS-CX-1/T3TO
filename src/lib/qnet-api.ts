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
            const res = await fetch(fullUrl, { next: { revalidate: 3600 } })
            if (res.ok) return await res.text()
        } catch (e) {
            if (attempt === retries - 1) return null
            await new Promise((r) => setTimeout(r, 2000))
        }
    }
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
    if (!QNET_SERVICE_KEY) return []
    const url = 'https://openapi.q-net.or.kr/api/service/rest/InquiryListNationalQualifcationSVC/getList'
    const xml = await fetchXml(url, { pageNo: '1', numOfRows: '10' })
    if (!xml) return []
    const parsed = parseXml(xml)
    return extractItems(parsed)
}

/** 자격 시험 일정 (예: 2026년 이후) */
export async function getExamSchedule(): Promise<unknown[]> {
    if (!QNET_SERVICE_KEY) return []
    const url = 'https://apis.data.go.kr/B490007/qualExamSchd/getQualExamSchdList'
    const xml = await fetchXml(url, { implYmd: '20260101' })
    if (!xml) return []
    const parsed = parseXml(xml)
    return extractItems(parsed)
}

/** 직무역량 목록 */
export async function getJobCompetencyList(): Promise<unknown[]> {
    if (!QNET_SERVICE_KEY) return []
    const url = 'https://apis.data.go.kr/B490007/jobCompetency/getJobCompetencyList'
    const xml = await fetchXml(url, { pageNo: '1', numOfRows: '10' })
    if (!xml) return []
    const parsed = parseXml(xml)
    return extractItems(parsed)
}
