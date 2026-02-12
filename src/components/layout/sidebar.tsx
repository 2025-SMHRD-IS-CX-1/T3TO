"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { LayoutDashboard, Map, FileText, Calendar, Users, Settings, LogOut, MessageSquare } from "lucide-react"
import { cn } from "@/lib/utils"

const globalNavigation = [
    { name: "내담자 관리", href: "/admin/clients", icon: Users },
    { name: "일정 관리", href: "/schedule", icon: Calendar },
]

const clientSpecificNavigation = [
    { name: "대시보드", href: "/dashboard", icon: LayoutDashboard },
    { name: "상담 관리", href: "/consultations", icon: MessageSquare },
    { name: "로드맵", href: "/roadmap", icon: Map },
    { name: "자기소개서", href: "/cover-letter", icon: FileText },
]

export function Sidebar() {
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const clientId = searchParams.get('clientId')

    const getHref = (href: string) => {
        if (!clientId || href.startsWith('/admin') || href === '/settings') return href
        return `${href}?clientId=${clientId}`
    }

    return (
        <div className="flex w-[280px] flex-col border-r bg-[#FAFBFC]">
            <div className="flex h-16 items-center px-6 border-b">
                <span className="text-xl font-bold text-purple-900">Career Bridge</span>
            </div>
            <div className="flex-1 overflow-y-auto py-4">
                <nav className="space-y-6 px-3">
                    {/* Global Menu */}
                    <div>
                        <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                            상시 메뉴
                        </h3>
                        <div className="space-y-1">
                            {globalNavigation.map((item) => {
                                const isActive = pathname === item.href
                                const Icon = item.icon
                                return (
                                    <Link
                                        key={item.name}
                                        href={getHref(item.href)}
                                        className={cn(
                                            "group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors",
                                            isActive
                                                ? "bg-purple-100 text-purple-900"
                                                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                                        )}
                                    >
                                        <Icon
                                            className={cn(
                                                "mr-3 h-5 w-5 flex-shrink-0 transition-colors",
                                                isActive ? "text-purple-700" : "text-gray-400 group-hover:text-gray-500"
                                            )}
                                        />
                                        {item.name}
                                    </Link>
                                )
                            })}
                        </div>
                    </div>

                    {/* Client Context Menu */}
                    <div>
                        <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                            내담자별 관리
                        </h3>
                        <div className="space-y-1">
                            {clientSpecificNavigation.map((item) => {
                                const isActive = pathname === item.href
                                const Icon = item.icon

                                if (!clientId) {
                                    return (
                                        <div
                                            key={item.name}
                                            className="flex items-center px-3 py-2.5 text-sm font-medium text-gray-300 cursor-not-allowed"
                                        >
                                            <Icon className="mr-3 h-5 w-5 text-gray-200" />
                                            {item.name}
                                        </div>
                                    )
                                }

                                return (
                                    <Link
                                        key={item.name}
                                        href={getHref(item.href)}
                                        className={cn(
                                            "group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors",
                                            isActive
                                                ? "bg-purple-100 text-purple-900"
                                                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                                        )}
                                    >
                                        <Icon
                                            className={cn(
                                                "mr-3 h-5 w-5 flex-shrink-0 transition-colors",
                                                isActive ? "text-purple-700" : "text-gray-400 group-hover:text-gray-500"
                                            )}
                                        />
                                        {item.name}
                                    </Link>
                                )
                            })}
                        </div>
                    </div>
                </nav>
            </div>
            <div className="border-t p-4">
                <button
                    onClick={async () => {
                        const { createClient } = await import('@/lib/supabase/client')
                        const supabase = createClient()
                        await supabase.auth.signOut()
                        window.location.href = '/login'
                    }}
                    className="w-full group flex items-center px-3 py-2.5 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-100 hover:text-gray-900"
                >
                    <LogOut className="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500" />
                    로그아웃
                </button>
            </div>
        </div>
    )
}
