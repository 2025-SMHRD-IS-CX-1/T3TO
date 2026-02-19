"use client"

import { useState, useEffect } from "react"
import { Bell, Search, User, LogOut, Settings, Trash2, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { ClientOnly } from "@/components/client-only"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { deleteAccount } from "@/app/(auth)/actions"

const NOTIFICATION_EVENT = "cb-notification-check"

export function Navbar() {
    const [userInitial, setUserInitial] = useState("JD")
    const [userEmail, setUserEmail] = useState("")
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [hasNotification, setHasNotification] = useState(false)
    const [latestChange, setLatestChange] = useState<string | null>(null)
    const [notifDetail, setNotifDetail] = useState<{
        roadmapUpdated: boolean
        resumeUpdated: boolean
        calendarUpdated: boolean
        consultationUpdated: boolean
        clientsUpdated: boolean
        roadmapLatest: string | null
        resumeLatest: string | null
        calendarLatest: string | null
        consultationLatest: string | null
        clientsLatest: string | null
    } | null>(null)
    const [readAt, setReadAt] = useState<Record<string, string>>({})

    const markAllAsRead = () => {
        if (typeof window === "undefined" || !notifDetail) return
        const next: Record<string, string> = {
            ...(notifDetail.roadmapLatest && { roadmap: notifDetail.roadmapLatest }),
            ...(notifDetail.resumeLatest && { resume: notifDetail.resumeLatest }),
            ...(notifDetail.calendarLatest && { calendar: notifDetail.calendarLatest }),
            ...(notifDetail.consultationLatest && { consultation: notifDetail.consultationLatest }),
            ...(notifDetail.clientsLatest && { clients: notifDetail.clientsLatest }),
        }
        const stored = window.localStorage.getItem("cb_notification_read")
        const prev = stored ? (() => { try { return JSON.parse(stored) as Record<string, string> } catch { return {} } })() : {}
        const merged = { ...prev, ...next }
        window.localStorage.setItem("cb_notification_read", JSON.stringify(merged))
        setReadAt(merged)
        window.localStorage.setItem("cb_last_seen_notification_at", latestChange || new Date().toISOString())
        setHasNotification(false)
    }

    const isUnread = (key: string, latest: string | null) => {
        if (!latest) return false
        const read = readAt[key]
        if (!read) return true
        const tLatest = new Date(latest).getTime()
        const tRead = new Date(read).getTime()
        return Number.isNaN(tLatest) || Number.isNaN(tRead) || tLatest > tRead
    }


    const fetchNotifications = async () => {
        if (typeof window === "undefined") return
        const lastSeen = window.localStorage.getItem("cb_last_seen_notification_at")
        const readRaw = window.localStorage.getItem("cb_notification_read")
        const readObj = readRaw ? (() => { try { return JSON.parse(readRaw) as Record<string, string> } catch { return {} } })() : {}
        setReadAt(readObj)
        const params = new URLSearchParams()
        if (lastSeen) params.set("lastSeen", lastSeen)
        try {
            const res = await fetch(`/api/notifications?${params.toString()}`)
            const data = res.ok ? await res.json() : {}
            if (data.latestChange) setLatestChange(data.latestChange)
            if (data.hasUpdates) setHasNotification(true)
            setNotifDetail({
                roadmapUpdated: !!data.roadmapUpdated,
                resumeUpdated: !!data.resumeUpdated,
                calendarUpdated: !!data.calendarUpdated,
                consultationUpdated: !!data.consultationUpdated,
                clientsUpdated: !!data.clientsUpdated,
                roadmapLatest: data.roadmapLatest ?? null,
                resumeLatest: data.resumeLatest ?? null,
                calendarLatest: data.calendarLatest ?? null,
                consultationLatest: data.consultationLatest ?? null,
                clientsLatest: data.clientsLatest ?? null,
            })
        } catch {
            setNotifDetail({
                roadmapUpdated: false,
                resumeUpdated: false,
                calendarUpdated: false,
                consultationUpdated: false,
                clientsUpdated: false,
                roadmapLatest: null,
                resumeLatest: null,
                calendarLatest: null,
                consultationLatest: null,
                clientsLatest: null,
            })
        }
    }

    useEffect(() => {
        const supabase = createClient()
        const init = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (user?.email) {
                setUserEmail(user.email)
                setUserInitial(user.email.substring(0, 2).toUpperCase())
            }
            fetchNotifications()
        }
        init()
    }, [])

    useEffect(() => {
        const handler = () => { fetchNotifications() }
        window.addEventListener(NOTIFICATION_EVENT, handler)
        return () => window.removeEventListener(NOTIFICATION_EVENT, handler)
    }, [])

    return (
        <div className="flex h-16 items-center justify-between bg-white/90 px-6 shadow-[0_1px_0_rgba(148,163,184,0.16)] backdrop-blur-sm">
            <div className="flex items-center flex-1">
                {/* Breadcrumb removed as requested */}
            </div>

            <div className="flex items-center space-x-4">
                <ClientOnly
                    fallback={
                        <>
                            <div className="relative flex h-10 w-10 items-center justify-center rounded-md border-0 bg-transparent">
                                <Bell className="h-5 w-5 text-gray-600" />
                            </div>
                            <div className="h-8 w-8 rounded-full bg-purple-100 border border-purple-200 flex items-center justify-center text-purple-700 font-bold text-xs" />
                        </>
                    }
                >
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="relative group"
                        >
                            <Bell className="h-5 w-5 text-gray-600 transition-colors group-hover:text-purple-600" />
                            {hasNotification && (
                                <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white animate-pulse" />
                            )}
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        align="end"
                        className="w-80 p-0"
                        onInteractOutside={() => {
                            if (hasNotification && typeof window !== "undefined" && notifDetail && (notifDetail.roadmapUpdated || notifDetail.resumeUpdated || notifDetail.calendarUpdated || notifDetail.consultationUpdated || notifDetail.clientsUpdated)) {
                                markAllAsRead()
                            }
                        }}
                    >
                        {/* 헤더 + 구분선 */}
                        <div className="px-3 py-3 shadow-[0_1px_0_rgba(148,163,184,0.12)]">
                            <p className="text-sm font-semibold text-black">알림</p>
                        </div>
                        {/* 액션: 모두 읽음만 */}
                        <div className="flex items-center justify-end px-3 py-2.5 bg-slate-50/60 shadow-[0_1px_0_rgba(148,163,184,0.1)]">
                            <button
                                type="button"
                                className="flex items-center gap-1.5 text-xs text-purple-600 hover:underline"
                                onClick={markAllAsRead}
                            >
                                <Check className="h-3.5 w-3.5" />
                                모두 읽음
                            </button>
                        </div>
                        {notifDetail && (notifDetail.roadmapUpdated || notifDetail.resumeUpdated || notifDetail.calendarUpdated || notifDetail.consultationUpdated || notifDetail.clientsUpdated) ? (
                            <div key={`read-${JSON.stringify(readAt)}`} className="text-sm text-black max-h-80 overflow-y-auto">
                                {notifDetail.clientsUpdated && (
                                    <div className={`flex items-center gap-2 px-3 py-2.5 hover:bg-purple-100/50 shadow-[0_1px_0_rgba(148,163,184,0.08)] last:shadow-none ${isUnread("clients", notifDetail.clientsLatest) ? "font-semibold" : "font-light"}`}><span className="text-[10px] text-gray-500 shrink-0">•</span>내담자가 추가/변경되었습니다.</div>
                                )}
                                {notifDetail.calendarUpdated && (
                                    <div className={`flex items-center gap-2 px-3 py-2.5 hover:bg-purple-100/50 shadow-[0_1px_0_rgba(148,163,184,0.08)] last:shadow-none ${isUnread("calendar", notifDetail.calendarLatest) ? "font-semibold" : "font-light"}`}><span className="text-[10px] text-gray-500 shrink-0">•</span>새 상담 일정이 생성/변경되었습니다.</div>
                                )}
                                {notifDetail.roadmapUpdated && (
                                    <div className={`flex items-center gap-2 px-3 py-2.5 hover:bg-purple-100/50 shadow-[0_1px_0_rgba(148,163,184,0.08)] last:shadow-none ${isUnread("roadmap", notifDetail.roadmapLatest) ? "font-semibold" : "font-light"}`}><span className="text-[10px] text-gray-500 shrink-0">•</span>로드맵 내용이 업데이트되었습니다.</div>
                                )}
                                {notifDetail.resumeUpdated && (
                                    <div className={`flex items-center gap-2 px-3 py-2.5 hover:bg-purple-100/50 shadow-[0_1px_0_rgba(148,163,184,0.08)] last:shadow-none ${isUnread("resume", notifDetail.resumeLatest) ? "font-semibold" : "font-light"}`}><span className="text-[10px] text-gray-500 shrink-0">•</span>자기소개서 초안이 작성/수정되었습니다.</div>
                                )}
                                {notifDetail.consultationUpdated && (
                                    <div className={`flex items-center gap-2 px-3 py-2.5 hover:bg-purple-100/50 shadow-[0_1px_0_rgba(148,163,184,0.08)] last:shadow-none ${isUnread("consultation", notifDetail.consultationLatest) ? "font-semibold" : "font-light"}`}><span className="text-[10px] text-gray-500 shrink-0">•</span>상담 기록이 추가/수정되었습니다.</div>
                                )}
                            </div>
                        ) : (
                            <div className="px-3 py-6 text-xs text-black text-center">
                                새로운 알림이 없습니다.
                            </div>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>

                    <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <div className="h-8 w-8 rounded-full bg-purple-100 border border-purple-200 flex items-center justify-center text-purple-700 font-bold text-xs shadow-sm cursor-pointer hover:bg-purple-200 transition-colors">
                            {userInitial}
                        </div>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                        <div className="flex items-center gap-3 p-3">
                            <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-bold">
                                {userInitial}
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-semibold text-gray-900">상담사 계정</span>
                                <span className="text-[10px] text-gray-500 truncate w-32">{userEmail}</span>
                            </div>
                        </div>
                        <Separator className="my-1" />
                        <DropdownMenuItem className="cursor-pointer">
                            <User className="mr-2 h-4 w-4" />
                            <span>내 프로필 설정</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem className="cursor-pointer">
                            <Settings className="mr-2 h-4 w-4" />
                            <span>시스템 설정</span>
                        </DropdownMenuItem>
                        <Separator className="my-1" />
                        <DropdownMenuItem
                            className="text-red-600 cursor-pointer focus:bg-red-50 focus:text-red-600"
                            onClick={async () => {
                                const supabase = createClient()
                                await supabase.auth.signOut()
                                window.location.href = '/login'
                            }}
                        >
                            <LogOut className="mr-2 h-4 w-4" />
                            <span>로그아웃</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className="text-red-600 cursor-pointer focus:bg-red-50 focus:text-red-600"
                            onClick={() => setIsDeleteDialogOpen(true)}
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            <span>회원탈퇴</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                    </DropdownMenu>
                </ClientOnly>
            </div>

            {/* 회원탈퇴 확인 다이얼로그 */}
            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>회원탈퇴</DialogTitle>
                        <DialogDescription>
                            정말로 회원탈퇴를 하시겠습니까? 이 작업은 되돌릴 수 없으며, 모든 데이터가 삭제됩니다.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setIsDeleteDialogOpen(false)}
                            disabled={isDeleting}
                        >
                            취소
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={async () => {
                                setIsDeleting(true)
                                const result = await deleteAccount()
                                
                                if (result.error) {
                                    alert(`회원탈퇴 실패: ${result.error}`)
                                    setIsDeleting(false)
                                    setIsDeleteDialogOpen(false)
                                } else {
                                    // 성공 시 로그인 페이지로 이동
                                    window.location.href = '/login'
                                }
                            }}
                            disabled={isDeleting}
                        >
                            {isDeleting ? '처리 중...' : '회원탈퇴'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
