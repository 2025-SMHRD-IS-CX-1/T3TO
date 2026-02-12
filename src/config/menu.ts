import {
    LayoutDashboard,
    Map,
    FileText,
    Calendar,
    Users,
    MessageSquare,
    type LucideIcon,
} from "lucide-react"

/**
 * DB 엔티티와 라우트에 맞춘 메뉴 정의.
 * - profiles_role.role === 'admin' 일 때만 adminOnly 메뉴 표시
 * - requiresClient: true 인 메뉴는 clientId 선택 시에만 활성화
 */
export type MenuItemDef = {
    name: string
    href: string
    icon: LucideIcon
    /** DB 테이블명 (calendar_events, users, consultations, career_roadmaps, resume_drafts 등) */
    dbEntity?: string
    /** true면 profiles_role.role === 'admin' 일 때만 표시 */
    adminOnly?: boolean
    /** true면 clientId 있을 때만 링크 활성화 */
    requiresClient?: boolean
}

/** 상시 메뉴 (내담자 선택 없이 접근) - DB: calendar_events, users/career_profiles */
export const globalMenuItems: MenuItemDef[] = [
    { name: "일정 관리", href: "/schedule", icon: Calendar, dbEntity: "calendar_events" },
    { name: "내담자 관리", href: "/admin/clients", icon: Users, dbEntity: "users", adminOnly: true },
]

/** 내담자별 메뉴 (clientId 필요) - DB: consultations, career_roadmaps, resume_drafts */
export const clientMenuItems: MenuItemDef[] = [
    { name: "대시보드", href: "/dashboard", icon: LayoutDashboard, requiresClient: true },
    { name: "상담 관리", href: "/consultations", icon: MessageSquare, dbEntity: "consultations", requiresClient: true },
    { name: "로드맵", href: "/roadmap", icon: Map, dbEntity: "career_roadmaps", requiresClient: true },
    { name: "자기소개서", href: "/cover-letter", icon: FileText, dbEntity: "resume_drafts", requiresClient: true },
]
