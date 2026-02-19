'use server'

import { createClient, getEffectiveUserId } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { createInitialRoadmap } from '../roadmap/actions'

/** 자기소개서 본문에서 시스템 플레이스홀더·부적절한 문구 제거 */
function sanitizeDraftContent(text: string): string {
    if (!text || typeof text !== 'string') return text
    return text
        .split('\n')
        .filter(line => {
            const t = line.trim()
            if (!t) return true
            if (/\[기지란\s*공백\s*보전\]/i.test(t)) return false
            if (/\[기존\s*공백\s*보전\]/i.test(t)) return false
            if (/^\[.*초안\]\s*$/i.test(t)) return false
            return true
        })
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

/** 상담 분석 문구가 placeholder일 때 제거 (실제 강점/가치관만 사용) */
function useInsightLine(insights: string, lineIndex: number, fallback: string): string {
    if (!insights) return fallback
    const line = insights.split('\n')[lineIndex]?.trim()
    if (!line || line.includes('추가로 파악할 예정')) return fallback
    return line.replace(/^(강점|가치관):\s*/i, '').trim() || fallback
}

/** RAG/mk_resume_model 미사용 시 쓰는 기본 템플릿 3종 (약 600자 분량) */
function getTemplateVersions(
    profile: { client_name: string; major?: string; education_level?: string },
    targetJob: string,
    insights: string
): { type: string; title: string; content: string }[] {
    const majorLabel = (profile.major && profile.major.trim() && !/^text$/i.test(profile.major))
        ? profile.major.trim()
        : (profile.education_level || '해당 분야')
    const strengthLine = useInsightLine(insights, 0, '실무 역량')
    const valueLine = useInsightLine(insights, 1, '책임감과 소통')
    return [
        {
            type: 'Version 1',
            title: `${targetJob} - 역량 중심`,
            content: `안녕하세요, ${targetJob} 지원자 ${profile.client_name}입니다.\n\n저는 ${majorLabel}을 통해 다져온 기초 지식과 ${strengthLine}을 바탕으로 팀에 기여하고 싶습니다. 특히 복잡한 문제를 논리적으로 해결하는 것에 강점이 있으며, 팀과 함께 성과를 내는 것을 중요하게 생각합니다. 지원 직무에 필요한 역량을 꾸준히 쌓아왔으며, 프로젝트와 실무 경험을 통해 데이터 기반의 사고와 실행력을 키워왔습니다. 당시 주어진 과제를 단순히 수행하는 데 그치지 않고, 문제의 구조를 파악하고 핵심 이슈를 정의하는 데 집중했으며, 그 과정에서 팀 내 소통과 협업의 중요성을 체득했습니다. 새로운 기술과 도메인을 배울 때에도 핵심 개념을 먼저 이해하고, 이를 실제 업무에 적용해 보며 검증하는 방식을 유지해 왔습니다. 앞으로도 직무 역량을 꾸준히 보완하며, 귀사에 도움이 되는 인재로 남고 싶습니다. 입사 후에는 주어진 업무를 성실히 수행하는 것을 넘어, 동료들과 협업하며 조직의 성장에 기여하고, 끊임없이 배우며 성장하는 구성원이 되겠습니다. 귀사의 ${targetJob} 직무에 제가 쌓아온 역량이 잘 맞을 것으로 확신하며, 기회를 주시면 보답하겠습니다.`
        },
        {
            type: 'Version 2',
            title: `${targetJob} - 경험 중심`,
            content: `안녕하세요, ${profile.client_name}입니다.\n\n저의 강점인 ${strengthLine}을 실무와 팀 활동에서 발휘해 온 경험을 바탕으로 말씀드립니다. ${strengthLine}을 살릴 수 있는 프로젝트와 과제에 적극 참여하며, 목표 설정과 일정 조율을 맡아 결과물을 완성해 온 경험이 있습니다. 사용자나 동료의 피드백을 반영해 개선했던 일, 일정 지연 시 원인을 함께 분석하고 대안을 모색했던 역할도 경험했습니다. 이러한 경험이 귀사 ${targetJob} 직무에서 기여로 이어질 수 있다고 믿으며, 입사 후에는 제 강점을 바탕으로 빠르게 적응해 팀에 실질적인 가치를 더하는 인재가 되겠습니다. 감사합니다.`
        },
        {
            type: 'Version 3',
            title: `${targetJob} - 가치관 중심`,
            content: `함께 성장하는 즐거움을 아는 ${profile.client_name}입니다.\n\n저의 핵심 가치관은 ${valueLine}입니다. 기술적인 완성도뿐만 아니라 동료와의 원활한 협업을 통해 시너지를 내는 것을 중요하게 생각하며, 귀사의 문화와 방향성에 맞춰 기여하고 싶습니다. 실패와 한계를 성장의 기회로 바라보고, 피드백을 적극 수용하며 스스로를 개선해 나가는 편입니다. 주어진 역할에 최선을 다하는 동시에 주변과 소통해 함께 더 나은 결과를 만드는 것을 지향하고, 새로운 도구나 방법을 접할 때에도 효과와 한계를 비판적으로 바라보려 노력해 왔습니다. 귀사에서도 제 가치관을 바탕으로 팀에 신뢰와 동기를 더하는 구성원이 되겠습니다. 기회를 주시면 감사하겠습니다.`
        }
    ]
}

export async function getDrafts(profileId?: string, counselorId?: string | null) {
    const supabase = await createClient()
    const userIdStr = await getEffectiveUserId(counselorId)
    if (!userIdStr) return []

    // user_id 컬럼 유무와 관계없이 동작: 해당 상담사의 roadmap_id 목록으로 draft 조회
    const { data: roadmaps } = await supabase
        .from('career_roadmaps')
        .select('roadmap_id')
        .eq('user_id', userIdStr)
    const roadmapIds = (roadmaps || []).map((r: { roadmap_id: string }) => r.roadmap_id)
    if (roadmapIds.length === 0) return []

    let query = supabase
        .from('resume_drafts')
        .select('*, career_roadmaps(user_id, target_job)')
        .in('roadmap_id', roadmapIds)

    if (profileId) {
        query = query.eq('profile_id', profileId)
    }

    const { data, error } = await query.order('created_at', { ascending: false })

    if (error) {
        console.error('Error fetching drafts:', error?.message ?? 'Unknown error', error?.code, error?.details)
        return []
    }

    const list = data ?? []
    // 최신 3개만 유지, 그 외 예전 버전은 DB에서 삭제
    const latest = list.slice(0, 3)
    const toDelete = list.slice(3)
    if (toDelete.length > 0) {
        const idsToDelete = toDelete.map((d: { draft_id: string }) => d.draft_id)
        await supabase.from('resume_drafts').delete().in('draft_id', idsToDelete)
    }

    return latest.map((draft: any) => ({
        id: draft.draft_id,
        title: draft.target_position || (Array.isArray(draft.career_roadmaps) ? draft.career_roadmaps[0]?.target_job : draft.career_roadmaps?.target_job) || '제목 없음',
        date: new Date(draft.created_at).toLocaleDateString(),
        content: draft.draft_content,
        tags: [draft.version_type]
    }))
}

export async function generateAIDrafts(clientId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: 'Unauthorized' }

    // 1. Fetch Client Profile
    const { data: profile, error: profileError } = await supabase
        .from('career_profiles')
        .select('*')
        .eq('profile_id', clientId)
        .eq('user_id', user.id)
        .single()

    if (profileError || !profile) {
        return { error: '내담자 프로필을 찾을 수 없습니다. 등록 정보를 확인해주세요.' }
    }

    // 2. Fetch or Create Active Roadmap
    let { data: roadmap } = await supabase
        .from('career_roadmaps')
        .select('*')
        .eq('profile_id', clientId)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (!roadmap) {
        // Create initial roadmap automatically if it doesn't exist
        const initResult = await createInitialRoadmap(clientId, profile)
        if (initResult.error) {
            return { error: '로드맵 초기화 중 오류가 발생했습니다: ' + initResult.error }
        }

        // Re-fetch the newly created roadmap
        const { data: newRoadmap } = await supabase
            .from('career_roadmaps')
            .select('*')
            .eq('profile_id', clientId)
            .eq('user_id', user.id)
            .eq('is_active', true)
            .single()
        roadmap = newRoadmap
    }

    if (!roadmap) {
        return { error: '로드맵을 생성할 수 없습니다.' }
    }

    // 2. 최신 상담 기록 + 상담 분석
    const { data: latestConsultation } = await supabase
        .from('consultations')
        .select('consultation_id, consultation_content')
        .eq('profile_id', clientId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    let insights = ""
    let consultationContent = ''
    let analysisStrengths: string[] = []
    let careerValues = ''
    if (latestConsultation?.consultation_id) {
        consultationContent = (latestConsultation as { consultation_content?: string }).consultation_content ?? ''
        const { data: latestAnalysis } = await supabase
            .from('consultation_analysis')
            .select('*')
            .eq('consultation_id', latestConsultation.consultation_id)
            .maybeSingle()
        if (latestAnalysis) {
            insights = `강점: ${latestAnalysis.strengths}\n가치관: ${latestAnalysis.career_values}`
            if (typeof latestAnalysis.strengths === 'string') {
                analysisStrengths = latestAnalysis.strengths.split(/[,，、\s]+/).filter(Boolean)
            }
            careerValues = typeof (latestAnalysis as { career_values?: string }).career_values === 'string'
                ? (latestAnalysis as { career_values: string }).career_values.trim()
                : ''
        }
    }

    const targetJob = roadmap.target_job || '프론트엔드 개발자'
    let competenciesFromRoadmap: string[] = []
    try {
        if (roadmap.required_skills && typeof roadmap.required_skills === 'string') {
            const skills = JSON.parse(roadmap.required_skills) as { title?: string }[]
            competenciesFromRoadmap = (skills || []).map((s: { title?: string }) => s.title).filter((t): t is string => !!t)
        }
    } catch {
        // ignore
    }
    const competencies = competenciesFromRoadmap.length > 0
        ? competenciesFromRoadmap
        : analysisStrengths.length > 0
            ? analysisStrengths
            : [targetJob + ' 역량', '문제해결', '커뮤니케이션']

    // 3. mk_resume_model API 우선 → RAG API → 템플릿
    const mkResumeApiUrl = process.env.MK_RESUME_MODEL_API_URL
    const ragApiUrl = process.env.RAG_COVER_LETTER_API_URL
    let versions: { type: string; title: string; content: string }[] | null = null

    if (mkResumeApiUrl) {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 120_000) // 3회 호출 여유로 120초
        const baseUrl = mkResumeApiUrl.replace(/\/$/, '')
        const extractedBackground = {
            name: profile.client_name ?? null,
            education: profile.major ?? profile.education_level ?? null,
            experiences: (profile.work_experience && String(profile.work_experience).trim())
                ? [String(profile.work_experience).trim()]
                : [],
            strengths: analysisStrengths.length > 0 ? analysisStrengths : null,
            career_values: careerValues || undefined,
        }
        const payload = (focus: string) => ({
            counseling: {
                content: consultationContent || '상담 기록이 아직 없습니다. 프로필과 로드맵 정보를 바탕으로 작성합니다.',
                session_date: null,
                notes: null,
            },
            ai_analysis: {
                roles: [targetJob],
                competencies,
                extracted_background: extractedBackground,
            },
            language: 'ko',
            min_word_count: 600,
            focus,
        })
        try {
            const [res1, res2, res3] = await Promise.all([
                fetch(`${baseUrl}/api/self-intro/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload('strength')),
                    signal: controller.signal,
                }),
                fetch(`${baseUrl}/api/self-intro/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload('experience')),
                    signal: controller.signal,
                }),
                fetch(`${baseUrl}/api/self-intro/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload('values')),
                    signal: controller.signal,
                }),
            ])
            clearTimeout(timeoutId)
            if (!res1.ok || !res2.ok || !res3.ok) {
                const t1 = await res1.text()
                const t2 = await res2.text()
                const t3 = await res3.text()
                throw new Error(`API 응답 오류: ${res1.status} ${t1.slice(0, 80)} / ${res2.status} ${t2.slice(0, 80)} / ${res3.status} ${t3.slice(0, 80)}`)
            }
            const [data1, data2, data3] = await Promise.all([
                res1.json() as Promise<{ draft?: string }>,
                res2.json() as Promise<{ draft?: string }>,
                res3.json() as Promise<{ draft?: string }>,
            ])
            const d1 = data1?.draft ?? ''
            const d2 = data2?.draft ?? ''
            const d3 = data3?.draft ?? ''
            if (d1 && d2 && d3) {
                versions = [
                    { type: 'Version 1', title: `${targetJob} - 역량 중심`, content: d1 },
                    { type: 'Version 2', title: `${targetJob} - 경험 중심`, content: d2 },
                    { type: 'Version 3', title: `${targetJob} - 가치관 중심`, content: d3 },
                ]
            } else {
                throw new Error('응답에 draft가 없습니다.')
            }
        } catch (e) {
            clearTimeout(timeoutId)
            const msg = e instanceof Error ? e.message : String(e)
            console.error('mk_resume_model API 호출 실패:', msg)
            if (e instanceof Error && e.name === 'AbortError') {
                return { error: '자기소개서 생성 시간이 초과되었습니다. mk_resume_model 서버가 실행 중인지 확인해주세요.' }
            }
            return { error: `자기소개서 생성 실패: ${msg}. mk_resume_model 서버(${mkResumeApiUrl})가 켜져 있는지, GET ${mkResumeApiUrl}/health 로 확인해주세요.` }
        }
    }

    if (versions == null || versions.length === 0) {
        if (ragApiUrl) {
            try {
                const res = await fetch(ragApiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        client_name: profile.client_name,
                        major: profile.major ?? '',
                        target_job: targetJob,
                        insights,
                        age_group: profile.age_group,
                        education_level: profile.education_level,
                    }),
                })
                if (!res.ok) throw new Error(`RAG API ${res.status}`)
                const data = await res.json()
                if (data?.drafts && Array.isArray(data.drafts) && data.drafts.length >= 3) {
                    versions = data.drafts.slice(0, 3).map((d: { type?: string; title?: string; content?: string }) => ({
                        type: d.type ?? 'Version',
                        title: d.title ?? targetJob,
                        content: d.content ?? '',
                    }))
                } else {
                    versions = getTemplateVersions(profile, targetJob, insights)
                }
            } catch (e) {
                console.error('RAG API 호출 실패, 템플릿 사용:', e)
                versions = getTemplateVersions(profile, targetJob, insights)
            }
        } else {
            versions = getTemplateVersions(profile, targetJob, insights)
        }
    }

    if (!versions) {
        versions = getTemplateVersions(profile, targetJob, insights)
    }
    versions = versions.map(v => ({ ...v, content: sanitizeDraftContent(v.content) }))

    // 4. 해당 내담자(profile_id) + 현재 로드맵의 기존 초안 전부 삭제 후, 새 3종만 삽입 (갱신)
    const { error: deleteError } = await supabase
        .from('resume_drafts')
        .delete()
        .eq('profile_id', clientId)
        .eq('roadmap_id', roadmap.roadmap_id)
    if (deleteError) return { error: '기존 초안 삭제 실패: ' + deleteError.message }

    const versionTypeMap: Record<string, string> = { 'Version 1': 'initial', 'Version 2': 'revised', 'Version 3': 'final' }
    const rows = versions.map(v => ({
        draft_id: crypto.randomUUID(),
        roadmap_id: roadmap.roadmap_id,
        profile_id: clientId,
        target_position: v.title,
        version_type: versionTypeMap[v.type] ?? 'custom',
        draft_content: v.content,
        is_selected: false
    }))
    const { error } = await supabase.from('resume_drafts').insert(rows)
    if (error) return { error: error.message }

    revalidatePath('/cover-letter')
    return { success: true }
}

export async function saveDraft(draftId: string | null, content: string, title: string, profileId?: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: 'Unauthorized' }

    const userIdStr = typeof user.id === 'string' ? user.id : String(user.id)

    if (draftId && draftId !== "") {
        const draftRow = await supabase.from('resume_drafts').select('roadmap_id').eq('draft_id', draftId).single()
        const ok = draftRow.data && (await supabase.from('career_roadmaps').select('roadmap_id').eq('roadmap_id', draftRow.data.roadmap_id).eq('user_id', userIdStr).single()).data
        if (!ok) return { error: '권한이 없거나 초안을 찾을 수 없습니다.' }
        const { error } = await supabase
            .from('resume_drafts')
            .update({
                draft_content: content,
                target_position: title,
                updated_at: new Date().toISOString()
            })
            .eq('draft_id', draftId)
        if (error) return { error: error.message }
    } else {
        const { data: roadmap } = await supabase
            .from('career_roadmaps')
            .select('roadmap_id, profile_id')
            .eq('profile_id', profileId)
            .eq('user_id', userIdStr)
            .single()
        if (!roadmap) return { error: '로드맵 정보가 필요합니다.' }
        const insertRow = {
            draft_id: crypto.randomUUID(),
            roadmap_id: roadmap.roadmap_id,
            profile_id: roadmap.profile_id,
            target_position: title,
            version_type: 'custom',
            draft_content: content
        }
        const { error } = await supabase.from('resume_drafts').insert([insertRow])
        if (error) return { error: error.message }
    }

    revalidatePath('/cover-letter')
    return { success: true }
}

export async function deleteDraft(draftId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }
    const userIdStr = typeof user.id === 'string' ? user.id : String(user.id)
    const draft = await supabase.from('resume_drafts').select('roadmap_id').eq('draft_id', draftId).single()
    if (!draft.data) return { error: '초안을 찾을 수 없습니다.' }
    const ok = (await supabase.from('career_roadmaps').select('roadmap_id').eq('roadmap_id', draft.data.roadmap_id).eq('user_id', userIdStr).single()).data
    if (!ok) return { error: '권한이 없습니다.' }
    const { error } = await supabase.from('resume_drafts').delete().eq('draft_id', draftId)
    if (error) return { error: error.message }

    revalidatePath('/cover-letter')
    return { success: true }
}
