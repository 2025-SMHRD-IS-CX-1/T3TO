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
            <div className="flex h-screen overflow-hidden bg-gray-50">
                <Sidebar adminContext={adminContext} />
                <div className="flex flex-1 flex-col overflow-hidden">
                    <Navbar />
                    <main className="flex-1 overflow-y-auto p-6">
                        {children}
                    </main>
                </div>
            </div>
        </AdminContext.Provider>
    )
}
