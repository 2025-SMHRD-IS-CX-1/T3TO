import { Shell } from "@/components/layout/shell"
import { getAdminContext } from "@/lib/supabase/server"

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    try {
        const adminContext = await getAdminContext()
        return <Shell adminContext={adminContext}>{children}</Shell>
    } catch (error: any) {
        console.error('[DashboardLayout] 에러 발생:', {
            error: error.message,
            code: error.code
        })
        // 에러가 발생해도 기본 컨텍스트로 페이지 렌더링
        return <Shell adminContext={{ role: null, counselors: [] }}>{children}</Shell>
    }
}
