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

    useEffect(() => {
        const fetchUser = async () => {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (user?.email) {
                setUserEmail(user.email)
                setUserInitial(user.email.substring(0, 2).toUpperCase())
            }
        }
        fetchUser()
    }, [])

    return (
        <div className="flex h-16 items-center justify-between border-b bg-white px-6">
            <div className="flex items-center flex-1">
                {/* Breadcrumb removed as requested */}
            </div>

            <div className="flex items-center space-x-4">


                <Button
                    variant="ghost"
                    size="icon"
                    className="relative group"
                    onClick={() => alert("현재 새로운 알림이 없습니다.")}
                >
                    <Bell className="h-5 w-5 text-gray-600 transition-colors group-hover:text-purple-600" />
                    <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white animate-pulse" />
                </Button>

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
