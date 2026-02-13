/**
 * 로드맵/자기소개서 등 AI 기능에서 사용할 모델명.
 * .env에 설정하지 않으면 기본값 사용.
 */
export function getRoadmapModel(): string {
    return process.env.OPENAI_ROADMAP_MODEL ?? 'gpt-4o-mini'
}

export function getCoverLetterModel(): string {
    return process.env.OPENAI_COVER_LETTER_MODEL ?? 'gpt-4o-mini'
}
