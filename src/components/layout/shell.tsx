"use client"

import { Suspense, useEffect } from "react"
import { Sidebar } from "@/components/layout/sidebar"
import { Navbar } from "@/components/layout/navbar"
import { createContext, useContext } from "react"
import { createClient } from "@/lib/supabase/client"

type AdminContextType = { role: 'admin' | 'user' | null; counselors: { id: string; email: string | null }[] }

const AdminContext = createContext<AdminContextType | null>(null)

export function useAdminContext() {
    return useContext(AdminContext)
}

/** 로그아웃/회원탈퇴 후 뒤로가기·앞으로가기·다른 탭 복귀 시에도 세션 없으면 로그인으로 보냄 (다른 계정으로 보이는 것 방지) */
function useEnsureSession() {
    useEffect(() => {
        const check = async () => {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                window.location.replace('/login')
            }
        }
        check()
        const onPageShow = (e: PageTransitionEvent) => {
            if (e.persisted) check()
        }
        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') check()
        }
        window.addEventListener('pageshow', onPageShow)
        document.addEventListener('visibilitychange', onVisibilityChange)
        return () => {
            window.removeEventListener('pageshow', onPageShow)
            document.removeEventListener('visibilitychange', onVisibilityChange)
        }
    }, [])
}

export function Shell({
    children,
    adminContext,
}: {
    children: React.ReactNode
    adminContext: AdminContextType
}) {
    useEnsureSession()
    return (
        <AdminContext.Provider value={adminContext}>
            <div className="flex h-screen overflow-hidden bg-[#F5F3FF] print:h-auto print:min-h-0 print:overflow-visible">
                <Suspense fallback={<div className="w-56 shrink-0 bg-[#F5F3FF]" />}>
                    <Sidebar adminContext={adminContext} />
                </Suspense>
                <div className="flex flex-1 flex-col overflow-hidden print:overflow-visible">
                    <Navbar />
                    <main className="flex-1 overflow-y-auto p-8 print:overflow-visible print:min-h-0">
                        <div className="mx-auto max-w-6xl rounded-3xl bg-white/90 shadow-[0_18px_60px_rgba(148,163,184,0.25)] border border-purple-50">
                            <div className="p-8">
                                {children}
                            </div>
                        </div>
                    </main>
                </div>
            </div>
        </AdminContext.Provider>
    )
}
