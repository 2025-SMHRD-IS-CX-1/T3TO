/**
 * Q-Net / 공공데이터 API 호출 (서버 전용).
 * 자격증 목록, 시험일정, 직무역량 조회.
 * QNET_SERVICE_KEY = 공공데이터포털 인증키 (.env.local에 설정)
 * npm run cache:qnet 로 미리 다운로드 시 data/cache/에서 읽음 (7일 유효)
 */
import { XMLParser } from 'fast-xml-parser'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const CACHE_DIR = join(process.cwd(), 'data', 'cache')
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7일

function readCache<T>(filename: string): T | null {
    try {
        const p = join(CACHE_DIR, filename)
        if (!existsSync(p)) return null
        const metaPath = join(CACHE_DIR, 'qnet-meta.json')
        if (existsSync(metaPath)) {
            const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as { updatedAt?: string }
            const updated = meta?.updatedAt ? new Date(meta.updatedAt).getTime() : 0
            if (Date.now() - updated > CACHE_TTL_MS) return null
        }
        return JSON.parse(readFileSync(p, 'utf8')) as T
    } catch {
        return null
    }
}

/** 런타임에 env 읽기 (Next.js 모듈 캐시 회피) */
function getServiceKey(): string {
    const key = process.env.QNET_SERVICE_KEY || process.env.DATA_GO_KR_SERVICE_KEY || ''
    if (!key && process.env.NODE_ENV === 'development') {
        console.warn('[Q-Net API] QNET_SERVICE_KEY 또는 DATA_GO_KR_SERVICE_KEY를 .env.local에 설정하고 서버를 재시작하세요.')
    }
    return key
}

function parseXml<T = Record<string, unknown>>(xmlText: string): T {
    const parser = new XMLParser({ ignoreAttributes: false })
    return parser.parse(xmlText) as T
}

/** 공공 API XML에서 resultCode/resultMsg 추출 (에러 원인 확인용) */
function getResultMessage(parsed: Record<string, unknown>): string | null {
    const res = parsed?.response as Record<string, unknown> | undefined
    const header = res?.header as Record<string, unknown> | undefined
    if (!header) return null
    const code = header.resultCode
    const msg = header.resultMsg
    if (code != null || msg != null) return `resultCode=${code} resultMsg=${msg}`
    return null
}

async function fetchXml(url: string, params: Record<string, string> = {}, retries = 1): Promise<string | null> {
    const key = getServiceKey()
    const { serviceKey: _skip, ...rest } = params
    const searchParams = new URLSearchParams({ ...rest, serviceKey: key })
    const fullUrl = `${url}?${searchParams.toString()}`

    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            console.log(`[Q-Net API] 요청 시도 ${attempt + 1}/${retries} - URL: ${url}`)
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 30000)
            const res = await fetch(fullUrl, {
                signal: controller.signal,
                next: { revalidate: 3600 },
            })
            clearTimeout(timeoutId)
            const text = await res.text().catch(() => '')
            if (res.ok) {
                console.log(`[Q-Net API] 응답 성공 - 상태: ${res.status}, 길이: ${text.length}`)
                const parsed = parseXml(text) as Record<string, unknown>
                const msg = getResultMessage(parsed)
                if (msg) console.log(`[Q-Net API] API 결과: ${msg}`)
                return text
            }
            console.error(`[Q-Net API] HTTP 실패 - 상태: ${res.status}, 내용: ${text.slice(0, 500)}`)
            try {
                const parsed = parseXml(text) as Record<string, unknown>
                const msg = getResultMessage(parsed)
                if (msg) console.error(`[Q-Net API] API 에러: ${msg}`)
            } catch {
                // 비XML 응답이면 무시
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

/** 국가자격 목록 (페이지네이션 지원) */
export async function getQualificationList(pageNo: number = 1, numOfRows: number = 100): Promise<unknown[]> {
    const key = getServiceKey()
    if (!key) {
        console.warn('[Q-Net API] QNET_SERVICE_KEY가 없어 자격증 목록 조회를 건너뜁니다. .env.local에 QNET_SERVICE_KEY=인증키 를 추가하고 npm run dev 재시작')
        return []
    }
    console.log(`[Q-Net API] 자격증 목록 조회 시작 - 페이지: ${pageNo}, 개수: ${numOfRows}`)
    const url = 'https://openapi.q-net.or.kr/api/service/rest/InquiryListNationalQualifcationSVC/getList'
    const xml = await fetchXml(url, { pageNo: String(pageNo), numOfRows: String(numOfRows) })
    if (!xml) {
        console.warn('[Q-Net API] 자격증 목록 조회 실패 - XML 응답 없음')
        return []
    }
    const parsed = parseXml(xml) as Record<string, unknown>
    const items = extractItems(parsed)
    if (items.length === 0) {
        const msg = getResultMessage(parsed)
        if (msg) console.warn('[Q-Net API] 자격증 목록 조회 결과 없음 -', msg)
    }
    console.log(`[Q-Net API] 자격증 목록 조회 완료 - 결과 수: ${items.length}`)
    return items
}

/** 여러 페이지에서 자격증 목록 가져오기 (캐시 우선, 없으면 API) */
export async function getAllQualifications(maxPages: number = 5): Promise<unknown[]> {
    const cached = readCache<unknown[]>('qnet-qualifications.json')
    if (cached && Array.isArray(cached) && cached.length > 0) {
        console.log(`[Q-Net API] 자격증 목록 캐시 사용 - ${cached.length}개`)
        return cached
    }
    const allItems: unknown[] = []
    for (let page = 1; page <= maxPages; page++) {
        const items = await getQualificationList(page, 100)
        if (items.length === 0) break
        allItems.push(...items)
        if (items.length < 100) break
    }
    console.log(`[Q-Net API] 전체 자격증 목록 조회 완료 - 총 ${allItems.length}개`)
    return allItems
}

/**
 * 자격 시험 일정 (한국산업인력공단_국가기술자격 종목별 시험정보 API)
 * @see https://www.data.go.kr/data/15003029/openapi.do
 * QNET_SERVICE_KEY = 공공데이터포털 인증키 (동일)
 */
export async function getExamSchedule(): Promise<unknown[]> {
    const cached = readCache<unknown[]>('qnet-exam-schedule.json')
    if (cached && Array.isArray(cached)) {
        console.log(`[Q-Net API] 시험일정 캐시 사용 - ${cached.length}건`)
        return cached
    }
    const key = getServiceKey()
    if (!key) {
        console.warn('[Q-Net API] QNET_SERVICE_KEY가 없어 시험 일정 조회를 건너뜁니다')
        return []
    }
    console.log('[Q-Net API] 시험 일정 조회 시작 (openapi.q-net.or.kr)')
    const baseUrl = 'https://openapi.q-net.or.kr/api/service/rest/InquiryTestInformationNTQSVC'
    const allItems: unknown[] = []
    // 기사·산업기사 시험일정 (정보처리기사 등)
    const eXml = await fetchXml(`${baseUrl}/getEList`)
    if (eXml) {
        const eItems = extractItems(parseXml(eXml))
        allItems.push(...eItems)
    }
    // 기술사 시험일정 (보완용)
    const peXml = await fetchXml(`${baseUrl}/getPEList`)
    if (peXml) {
        const peItems = extractItems(parseXml(peXml))
        allItems.push(...peItems)
    }
    console.log('[Q-Net API] 시험 일정 조회 완료 - 결과 수:', allItems.length)
    return allItems
}

/** 직무역량 목록 */
export async function getJobCompetencyList(): Promise<unknown[]> {
    if (!getServiceKey()) {
        console.warn('[Q-Net API] QNET_SERVICE_KEY가 없어 직무역량 조회를 건너뜁니다')
        return []
    }
    console.log('[Q-Net API] 직무역량 조회 시작')
    const url = 'https://apis.data.go.kr/B490007/jobCompetency/getJobCompetencyList'
    const xml = await fetchXml(url, { pageNo: '1', numOfRows: '10' })
    if (!xml) {
        console.warn('[Q-Net API] 직무역량 조회 실패 - XML 응답 없음')
        return []
    }
    const parsed = parseXml(xml)
    const items = extractItems(parsed)
    console.log('[Q-Net API] 직무역량 조회 완료 - 결과 수:', items.length)
    return items
}
