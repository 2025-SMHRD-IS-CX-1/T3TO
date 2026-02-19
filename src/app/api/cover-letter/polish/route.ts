import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { getCoverLetterModel } from '@/lib/ai-models'

export async function POST(req: NextRequest) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
        return NextResponse.json(
            { error: 'OPENAI_API_KEY가 설정되지 않았습니다. .env.local을 확인하고 서버를 재시작해주세요.' },
            { status: 500 }
        )
    }
    let body: { text?: string }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: '요청 본문이 올바른 JSON이 아닙니다.' }, { status: 400 })
    }
    const text = typeof body?.text === 'string' ? body.text.trim() : ''
    if (!text) {
        return NextResponse.json({ error: '수정할 내용이 없습니다.' }, { status: 400 })
    }
    const client = new OpenAI({ apiKey })
    const model = getCoverLetterModel()
    try {
        const res = await client.chat.completions.create({
            model,
            messages: [
                {
                    role: 'system',
                    content:
                        '당신은 채용 자기소개서 문장을 다듬는 전문가입니다. 주어진 자기소개서 본문만 수정해서 반환하세요. 의미와 핵심 내용은 유지하면서 다음을 반영합니다: 맞춤법·띄어쓰기 교정, 문맥이 매끄럽고 설득력 있게 다듬기, 어색한 표현·문법 정리. 쉼표는 문장에서 꼭 필요한 곳에만 쓰고, 조사(을/를, 에서 등) 앞이나 단어 사이에 불필요하게 넣지 마세요. 자연스러운 문장 흐름을 유지하세요. 다른 설명 없이 수정된 자기소개서 전문만 출력하세요.',
                },
                { role: 'user', content: text },
            ],
            temperature: 0.5,
            max_tokens: 4096,
        })
        let content = res.choices[0]?.message?.content?.trim() ?? ''
        if (!content) {
            return NextResponse.json({ error: 'AI가 수정된 내용을 반환하지 않았습니다.' }, { status: 502 })
        }
        const codeBlock = content.match(/^```(?:text)?\s*\n?([\s\S]*?)\n?```$/m)
        if (codeBlock) content = codeBlock[1].trim()
        return NextResponse.json({ content })
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return NextResponse.json({ error: `AI 다듬기 실패: ${msg}` }, { status: 500 })
    }
}
