"use client"

import { useState, useEffect, type ReactNode } from "react"

/**
 * 자식은 클라이언트 마운트 후에만 렌더링합니다.
 * Radix UI 등 서버/클라이언트에서 ID가 달라 하이드레이션 오류가 나는 컴포넌트를 감싸서 사용하세요.
 */
export function ClientOnly({
    children,
    fallback = null,
}: {
    children: ReactNode
    fallback?: ReactNode
}) {
    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])
    if (!mounted) return <>{fallback}</>
    return <>{children}</>
}
