"use client"

import { Sidebar } from "@/components/layout/sidebar"
import { Navbar } from "@/components/layout/navbar"
import { createContext, useContext } from "react"

type AdminContextType = { role: 'admin' | 'user' | null; counselors: { id: string; email: string | null }[] }

const AdminContext = createContext<AdminContextType | null>(null)

export function useAdminContext() {
    return useContext(AdminContext)
}

export function Shell({
    children,
    adminContext,
}: {
    children: React.ReactNode
    adminContext: AdminContextType
}) {
    return (
        <AdminContext.Provider value={adminContext}>
            <div className="flex h-screen overflow-hidden bg-[#F5F3FF]">
                <Sidebar adminContext={adminContext} />
                <div className="flex flex-1 flex-col overflow-hidden">
                    <Navbar />
                    <main className="flex-1 overflow-y-auto p-8">
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
