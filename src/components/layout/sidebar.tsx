"use client"

import Link from "next/link"
import { usePathname, useSearchParams, useRouter } from "next/navigation"
import { LayoutDashboard, Map, Sparkles, Calendar, Users, Settings, MessageSquare, UserCog, Shield } from "lucide-react"
import { cn } from "@/lib/utils"

import { ClientOnly } from "@/components/client-only"

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

// 상담사(user) 전용 메뉴
const counselorNavigation = [
    { name: "내담자 관리", href: "/dashboard", icon: Users },
    { name: "일정 관리", href: "/schedule", icon: Calendar },
]

// 관리자(admin) 전용 메뉴
const adminNavigation = [
    { name: "내담자 관리", href: "/admin/clients", icon: Users },
    { name: "일정 관리", href: "/schedule", icon: Calendar },
]

const clientSpecificNavigation = [
    { name: "대시보드", href: "/dashboard", icon: LayoutDashboard },
    { name: "상담 관리", href: "/consultations", icon: MessageSquare },
    { name: "로드맵", href: "/roadmap", icon: Map },
    { name: "AI자기소개서", href: "/cover-letter", icon: Sparkles },
]

type AdminContext = { role: 'admin' | 'user' | null; counselors: { id: string; email: string | null }[] }

export function Sidebar({ adminContext }: { adminContext: AdminContext }) {
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const router = useRouter()

    const clientId = searchParams.get('clientId')
    const counselorId = searchParams.get('counselorId')
    const isAdmin = adminContext?.role === 'admin'
    const counselors = adminContext?.counselors ?? []

    const getHref = (href: string) => {
        const params = new URLSearchParams()
        // 관리자가 상담사를 선택했을 때 counselorId 유지
        if (isAdmin && counselorId) params.set('counselorId', counselorId)
        // clientId는 /admin 경로가 아닌 경우에만 추가
        if (clientId && !href.startsWith('/admin') && href !== '/settings') params.set('clientId', clientId)
        const qs = params.toString()
        return qs ? `${href}?${qs}` : href
    }

    const onCounselorChange = (value: string) => {
        const params = new URLSearchParams(searchParams.toString())
        if (value) params.set('counselorId', value)
        else params.delete('counselorId')
        router.push(`${pathname}?${params.toString()}`)
    }

    return (
        <div className="flex w-[280px] flex-col bg-white shadow-[4px_0_18px_rgba(148,163,184,0.16)]">
            <div className="flex h-16 items-center px-4 border-b border-gray-100">
                <Link href={getHref('/dashboard')} className="flex items-center justify-center">
                    <img src="/logo.png" alt="Career Bridge" className="h-12 w-auto object-contain mix-blend-multiply" />
                </Link>
            </div>
            <div className="flex-1 overflow-y-auto py-4">
                {isAdmin && counselors.length > 0 && (
                    <div className="px-3 mb-4">
                        <label className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
                            상담사 선택
                        </label>
                        <ClientOnly
                            fallback={
                                <div className="flex h-10 w-full items-center rounded-md border border-input bg-white px-3 py-2 text-sm">
                                    <UserCog className="mr-2 h-4 w-4 text-gray-500" />
                                    <span className="text-muted-foreground">상담사를 선택하세요</span>
                                </div>
                            }
                        >
                            <Select value={counselorId || ''} onValueChange={onCounselorChange}>
                                <SelectTrigger className="w-full bg-white cursor-pointer">
                                    <UserCog className="mr-2 h-4 w-4 text-gray-500" />
                                    <SelectValue placeholder="상담사를 선택하세요" />
                                </SelectTrigger>
                                <SelectContent>
                                    {counselors.map((c) => (
                                        <SelectItem key={c.id} value={c.id}>
                                            {c.email || c.id.slice(0, 8)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </ClientOnly>
                        {!counselorId && (
                            <p className="px-3 mt-2 text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
                                ⚠️ 상담사를 선택하면 해당 상담사의 내담자 목록이 표시됩니다.
                            </p>
                        )}
                    </div>
                )}
                {isAdmin && counselors.length === 0 && (
                    <div className="px-3 mb-4">
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-800">
                            ⚠️ 등록된 상담사가 없습니다. 상담사를 먼저 등록해주세요.
                        </div>
                    </div>
                )}
                <nav className="space-y-6 px-3">
                    {/* 관리자 전용 메뉴 섹션 */}
                    {isAdmin && (
                        <div>
                            <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                                <Shield className="h-3 w-3" />
                                관리자 메뉴
                            </h3>
                            <div className="space-y-1">
                                {adminNavigation.map((item) => {
                                    const isActive = pathname === item.href
                                    const Icon = item.icon
                                    return (
                                        <Link
                                            key={item.name}
                                            href={getHref(item.href)}
                                            className={cn(
                                                "group flex items-center px-3 py-2.5 text-sm font-medium rounded-xl transition-colors",
                                                isActive
                                                    ? "bg-purple-50 text-purple-900"
                                                    : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                                            )}
                                        >
                                            <div
                                                className={cn(
                                                    "mr-3 flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 text-purple-600 transition-colors",
                                                    isActive && "bg-purple-600 text-white"
                                                )}
                                            >
                                                <Icon className="h-4 w-4" />
                                            </div>
                                            {item.name}
                                        </Link>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* 상담사 전용 메뉴 섹션 */}
                    {!isAdmin && (
                        <div>
                            <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                상시 메뉴
                            </h3>
                            <div className="space-y-1">
                                {counselorNavigation.map((item) => {
                                    // 내담자 관리 메뉴는 하위 페이지(로드맵, 상담일지 등)에서도 활성화
                                    const isClientManagement = item.href === '/dashboard'
                                    const isRelatedPage = ['/consultations', '/roadmap', '/cover-letter'].some(path => pathname?.startsWith(path))
                                    const isActive = pathname === item.href || (isClientManagement && isRelatedPage)
                                    const Icon = item.icon
                                    return (
                                        <Link
                                            key={item.name}
                                            href={getHref(item.href)}
                                            className={cn(
                                                "group flex items-center px-3 py-2.5 text-sm font-medium rounded-xl transition-colors",
                                                isActive
                                                    ? "bg-purple-50 text-purple-900"
                                                    : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                                            )}
                                        >
                                            <div
                                                className={cn(
                                                    "mr-3 flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 text-purple-600 transition-colors",
                                                    isActive && "bg-purple-600 text-white"
                                                )}
                                            >
                                                <Icon className="h-4 w-4" />
                                            </div>
                                            {item.name}
                                        </Link>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* 내담자별 관리 - 상담사는 항상 접근 가능, 관리자는 상담사 선택 후 접근 가능 */}
                    <div>
                        <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                            내담자별 관리
                        </h3>
                        <div className="space-y-1">
                            {clientSpecificNavigation.map((item) => {
                                const isActive = pathname === item.href
                                const Icon = item.icon

                                // 관리자는 상담사 선택 없이도 접근 가능 (자신의 데이터는 없지만 페이지는 볼 수 있음)
                                // 상담사는 clientId 없으면 비활성화
                                if (!isAdmin && !clientId) {
                                    return (
                                        <div
                                            key={item.name}
                                            className="flex items-center px-3 py-2.5 text-sm font-medium text-gray-300 cursor-not-allowed"
                                        >
                                            <div className="mr-3 flex h-8 w-8 items-center justify-center rounded-xl bg-gray-100 text-gray-300">
                                                <Icon className="h-4 w-4" />
                                            </div>
                                            {item.name}
                                        </div>
                                    )
                                }

                                return (
                                    <Link
                                        key={item.name}
                                        href={getHref(item.href)}
                                        className={cn(
                                            "group flex items-center px-3 py-2.5 text-sm font-medium rounded-xl transition-colors",
                                            isActive
                                                ? "bg-purple-50 text-purple-900"
                                                : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                                        )}
                                    >
                                        <div
                                            className={cn(
                                                "mr-3 flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 text-purple-600 transition-colors",
                                                isActive && "bg-purple-600 text-white"
                                            )}
                                        >
                                            <Icon className="h-4 w-4" />
                                        </div>
                                        {item.name}
                                    </Link>
                                )
                            })}
                        </div>
                    </div>
                </nav>
            </div>

        </div>
    )
}
