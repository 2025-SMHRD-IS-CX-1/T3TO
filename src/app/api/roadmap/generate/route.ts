import { NextRequest, NextResponse } from 'next/server'
import { getRoadmapModel } from '@/lib/ai-models'
import {
    getAllQualifications,
    getExamSchedule,
    getJobCompetencyList,
} from '@/lib/qnet-api'
import { searchCompanyInfo, searchJobInfo } from '@/lib/web-search'
import { runRoadmap } from '@/app/(dashboard)/roadmap/lib'
import type { RoadmapRagContext } from '@/app/(dashboard)/roadmap/lib'

/** Colab 등 외부에서 로드맵 모듈을 호출하는 API. POST body에 RAG 컨텍스트를 넘기면 로드맵 결과(JSON)를 반환합니다. */
export async function POST(req: NextRequest) {
    const apiKey = process.env.ROADMAP_API_KEY
    if (apiKey) {
        const headerKey = req.headers.get('x-api-key') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
        if (headerKey !== apiKey) {
            return NextResponse.json({ error: 'Unauthorized. X-API-Key 또는 Authorization: Bearer <ROADMAP_API_KEY> 필요.' }, { status: 401 })
        }
    }

    if (!process.env.OPENAI_API_KEY) {
        return NextResponse.json(
            { error: 'OPENAI_API_KEY가 설정되지 않았습니다. 서버 환경 변수를 확인해주세요.' },
            { status: 500 }
        )
    }

    let body: RoadmapRagContext & { profile?: unknown[] }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: '요청 본문이 올바른 JSON이 아닙니다.' }, { status: 400 })
    }

    const userData: RoadmapRagContext = {
        counseling: Array.isArray(body.counseling) ? body.counseling : [],
        analysis: Array.isArray(body.analysis) ? body.analysis : [],
        profile: Array.isArray(body.profile) ? body.profile : [],
        roadmap: Array.isArray(body.roadmap) ? body.roadmap : [],
    }

    const adapters = {
        openaiApiKey: process.env.OPENAI_API_KEY ?? '',
        model: getRoadmapModel(),
        searchCompany: searchCompanyInfo,
        searchJob: searchJobInfo,
        getQualifications: () => getAllQualifications(5),
        getExamSchedule,
        getJobCompetencyList,
    }

    try {
        const result = await runRoadmap(userData, adapters)
        return NextResponse.json(result)
    } catch (e) {
        console.error('[API roadmap/generate]', e)
        const message = e instanceof Error ? e.message : '로드맵 생성 중 오류가 발생했습니다.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
