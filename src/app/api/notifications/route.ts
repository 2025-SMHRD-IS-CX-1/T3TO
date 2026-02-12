import { NextRequest, NextResponse } from "next/server"
import { createClient, getEffectiveUserId } from "@/lib/supabase/server"

// DB 구조는 변경하지 않고, 기존 테이블의 updated_at/created_at만 이용해서
// \"마지막 확인 시점 이후 변경사항이 있는지\" 여부만 알려주는 경량 API입니다.

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(req.url)

  // 클라이언트에서 localStorage에 저장해둔 마지막 확인 시각 (ISO 문자열)
  const lastSeenParam = searchParams.get("lastSeen")
  const lastSeen = lastSeenParam ? new Date(lastSeenParam) : null

  // 현재 로그인 사용자 가져오기
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ hasUpdates: false })
  }

  // 관리자일 경우, 쿼리스트링의 counselorId 기준으로 실제 대상 user_id를 결정
  const counselorId = searchParams.get("counselorId")
  const effectiveUserId = await getEffectiveUserId(counselorId)
  if (!effectiveUserId) {
    return NextResponse.json({ hasUpdates: false })
  }

  // 각 테이블에서 해당 상담사(user_id)의 최신 변경 시각을 가져옵니다.
  // DB 스키마는 건드리지 않고, 이미 존재하는 updated_at / created_at만 사용합니다.

  async function getLatestTimestamp(
    table: string,
    dateColumn: "updated_at" | "created_at" = "updated_at"
  ): Promise<Date | null> {
    const { data, error } = await supabase
      .from(table)
      .select(dateColumn)
      .eq("user_id", effectiveUserId)
      .order(dateColumn, { ascending: false })
      .limit(1)

    if (error || !data || data.length === 0) return null
    const value = data[0][dateColumn] as string | null
    return value ? new Date(value) : null
  }

  const [roadmapTs, resumeTs, calendarTs, consultationTs] = await Promise.all([
    getLatestTimestamp("career_roadmaps"),
    getLatestTimestamp("resume_drafts"),
    getLatestTimestamp("calendar_events"),
    getLatestTimestamp("consultations"),
  ])

  const timestamps = [roadmapTs, resumeTs, calendarTs, consultationTs].filter(
    (d): d is Date => d !== null
  )

  if (timestamps.length === 0) {
    return NextResponse.json({ hasUpdates: false })
  }

  const latestChange = new Date(
    Math.max(...timestamps.map((d) => d.getTime()))
  )

  // 카테고리별 업데이트 여부 계산
  const isAfter = (ts: Date | null, base: Date | null) =>
    ts && base ? ts.getTime() > base.getTime() : !!ts && !base

  const base = lastSeen

  const roadmapUpdated = isAfter(roadmapTs, base)
  const resumeUpdated = isAfter(resumeTs, base)
  const calendarUpdated = isAfter(calendarTs, base)
  const consultationUpdated = isAfter(consultationTs, base)

  const hasUpdates =
    roadmapUpdated || resumeUpdated || calendarUpdated || consultationUpdated

  // lastSeen이 없으면, 데이터가 하나라도 있으면 hasUpdates true
  // (isAfter 로직에서 base가 null일 때 ts가 존재하면 true)

  return NextResponse.json({
    hasUpdates,
    latestChange: latestChange.toISOString(),
    roadmapUpdated,
    resumeUpdated,
    calendarUpdated,
    consultationUpdated,
  })
}

