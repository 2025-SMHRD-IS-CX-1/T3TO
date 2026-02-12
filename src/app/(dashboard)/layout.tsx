import { Shell } from "@/components/layout/shell"
import { getAdminContext } from "@/lib/supabase/server"

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const adminContext = await getAdminContext()
    return <Shell adminContext={adminContext}>{children}</Shell>
}
