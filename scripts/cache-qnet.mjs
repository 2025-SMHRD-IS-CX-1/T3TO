#!/usr/bin/env node
/**
 * Q-Net API 데이터를 미리 다운로드하여 data/cache/에 저장.
 * npm run cache:qnet 실행 시 .env.local의 QNET_SERVICE_KEY 사용.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CACHE_DIR = join(ROOT, 'data', 'cache')

function loadEnv() {
    const path = join(ROOT, '.env.local')
    if (!existsSync(path)) {
        console.error('.env.local이 없습니다. QNET_SERVICE_KEY를 설정하세요.')
        process.exit(1)
    }
    const content = readFileSync(path, 'utf8')
    for (const line of content.split('\n')) {
        const m = line.match(/^\s*([^#=]+)=(.*)$/)
        if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
    }
}

async function fetchXml(url, params = {}, retries = 3) {
    const key = process.env.QNET_SERVICE_KEY || process.env.DATA_GO_KR_SERVICE_KEY
    if (!key) {
        console.error('QNET_SERVICE_KEY가 .env.local에 없습니다.')
        process.exit(1)
    }
    const sp = new URLSearchParams({ ...params, serviceKey: key })
    const fullUrl = `${url}?${sp}`
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const controller = new AbortController()
            const t = setTimeout(() => controller.abort(), 30000)
            const res = await fetch(fullUrl, { signal: controller.signal })
            clearTimeout(t)
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            return res.text()
        } catch (e) {
            console.warn(`[캐시] 시도 ${attempt + 1}/${retries} 실패:`, e.message)
            if (attempt === retries - 1) throw e
            await new Promise((r) => setTimeout(r, 2000))
        }
    }
}

function extractItems(parsed) {
    const body = parsed?.response?.body
    const items = body?.items
    if (!items || typeof items !== 'object') return []
    const item = items.item
    if (Array.isArray(item)) return item
    return item && typeof item === 'object' ? [item] : []
}

async function main() {
    loadEnv()
    mkdirSync(CACHE_DIR, { recursive: true })

    console.log('[캐시] Q-Net 자격증 목록 다운로드 중...')
    const allQuals = []
    for (let page = 1; page <= 5; page++) {
        const xml = await fetchXml(
            'https://openapi.q-net.or.kr/api/service/rest/InquiryListNationalQualifcationSVC/getList',
            { pageNo: String(page), numOfRows: '100' }
        )
        const { XMLParser } = await import('fast-xml-parser')
        const parser = new XMLParser()
        const parsed = parser.parse(xml)
        const items = extractItems(parsed)
        if (items.length === 0) break
        allQuals.push(...items)
        if (items.length < 100) break
    }
    writeFileSync(join(CACHE_DIR, 'qnet-qualifications.json'), JSON.stringify(allQuals, null, 0))
    console.log(`[캐시] 자격증 ${allQuals.length}개 저장 완료`)

    console.log('[캐시] 시험일정 다운로드 중...')
    const allExams = []
    const baseUrl = 'https://openapi.q-net.or.kr/api/service/rest/InquiryTestInformationNTQSVC'
    for (const endpoint of ['/getEList', '/getPEList']) {
        try {
            const xml = await fetchXml(baseUrl + endpoint)
            const { XMLParser } = await import('fast-xml-parser')
            const parsed = new XMLParser().parse(xml)
            const items = extractItems(parsed)
            allExams.push(...items)
        } catch (e) {
            console.warn(`[캐시] ${endpoint} 실패:`, e.message)
        }
    }
    writeFileSync(join(CACHE_DIR, 'qnet-exam-schedule.json'), JSON.stringify(allExams, null, 0))
    console.log(`[캐시] 시험일정 ${allExams.length}건 저장 완료`)

    const meta = { updatedAt: new Date().toISOString(), qualifications: allQuals.length, examSchedule: allExams.length }
    writeFileSync(join(CACHE_DIR, 'qnet-meta.json'), JSON.stringify(meta, null, 2))
    console.log('[캐시] 완료 - data/cache/')
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
