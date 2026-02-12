"use client"

import { useState, useEffect } from "react"
import { Bell, Search, User, LogOut, Settings, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
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
    } | null>(null)

    useEffect(() => {
        const fetchUserAndNotifications = async () => {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (user?.email) {
                setUserEmail(user.email)
                setUserInitial(user.email.substring(0, 2).toUpperCase())
            }

            // 클라이언트에서만 localStorage 접근
            if (typeof window === "undefined") return

            const lastSeen = window.localStorage.getItem("cb_last_seen_notification_at")
            const params = new URLSearchParams()
            if (lastSeen) params.set("lastSeen", lastSeen)

            try {
                const res = await fetch(`/api/notifications?${params.toString()}`)
                if (!res.ok) return
                const data = await res.json()
                if (data.latestChange) {
                    setLatestChange(data.latestChange)
                }
                if (data.hasUpdates) {
                    setHasNotification(true)
                }
                setNotifDetail({
                    roadmapUpdated: !!data.roadmapUpdated,
                    resumeUpdated: !!data.resumeUpdated,
                    calendarUpdated: !!data.calendarUpdated,
                    consultationUpdated: !!data.consultationUpdated,
                })
            } catch {
                // 알림 조회 실패는 UI에 치명적이지 않으므로 조용히 무시
            }
        }
        fetchUserAndNotifications()
    }, [])

    return (
        <div className="flex h-16 items-center justify-between bg-white/90 px-6 shadow-[0_1px_0_rgba(148,163,184,0.16)] backdrop-blur-sm">
            <div className="flex items-center flex-1">
                {/* Breadcrumb removed as requested */}
            </div>

            <div className="flex items-center space-x-4">


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
                        className="w-72"
                        onInteractOutside={() => {
                            if (hasNotification) {
                                if (typeof window !== "undefined") {
                                    window.localStorage.setItem(
                                        "cb_last_seen_notification_at",
                                        latestChange || new Date().toISOString()
                                    )
                                }
                                setHasNotification(false)
                            }
                        }}
                    >
                        <div className="px-3 py-2 border-b">
                            <p className="text-xs font-semibold text-gray-500">알림</p>
                        </div>
                        {notifDetail && (notifDetail.roadmapUpdated || notifDetail.resumeUpdated || notifDetail.calendarUpdated || notifDetail.consultationUpdated) ? (
                            <div className="py-2 text-sm text-gray-700">
                                {notifDetail.calendarUpdated && (
                                    <div className="px-3 py-1.5 hover:bg-gray-50">새 상담 일정이 생성/변경되었습니다.</div>
                                )}
                                {notifDetail.roadmapUpdated && (
                                    <div className="px-3 py-1.5 hover:bg-gray-50">로드맵 내용이 업데이트되었습니다.</div>
                                )}
                                {notifDetail.resumeUpdated && (
                                    <div className="px-3 py-1.5 hover:bg-gray-50">자기소개서 초안이 작성/수정되었습니다.</div>
                                )}
                                {notifDetail.consultationUpdated && (
                                    <div className="px-3 py-1.5 hover:bg-gray-50">상담 기록이 추가/수정되었습니다.</div>
                                )}
                            </div>
                        ) : (
                            <div className="px-3 py-3 text-xs text-gray-500">
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
