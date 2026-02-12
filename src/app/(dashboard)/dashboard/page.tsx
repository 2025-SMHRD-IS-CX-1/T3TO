"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Map, FileText, Calendar, ArrowRight, User } from "lucide-react"
import Link from "next/link"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { getClients } from "../admin/clients/actions"
import { getLatestEvent } from "../schedule/actions"

export default function DashboardPage() {
    const [clients, setClients] = useState<any[]>([])
    const [selectedClientId, setSelectedClientId] = useState<string>("")
    const [selectedClient, setSelectedClient] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [upcomingEvent, setUpcomingEvent] = useState<any>(null)

    const searchParams = useSearchParams()
    const router = useRouter()
    const urlClientId = searchParams.get('clientId')

    useEffect(() => {
        fetchClients()
    }, [])

    useEffect(() => {
        if (clients.length > 0 && urlClientId) {
            handleClientSelect(urlClientId)
        }
    }, [clients, urlClientId])

    const fetchClients = async () => {
        setLoading(true)
        const data = await getClients()
        setClients(data)
        setLoading(false)
    }

    const fetchUpcomingEvent = async (clientId: string) => {
        const event = await getLatestEvent(clientId)
        setUpcomingEvent(event)
    }

    const handleClientSelect = (clientId: string) => {
        setSelectedClientId(clientId)
        const client = clients.find(c => c.id === clientId)
        setSelectedClient(client)
        if (clientId) fetchUpcomingEvent(clientId)

        // URL 동기화: 선택 시 URL 파라미터를 업데이트하여 사이드바 등과 세션 유지
        router.push(`/dashboard?clientId=${clientId}`)
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <p className="text-muted-foreground">로딩 중...</p>
            </div>
        )
    }

    return (
        <div className="space-y-10 pb-10">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                        {selectedClient ? `${selectedClient.name} 님의 현황` : "대시보드"}
                    </h1>
                    <p className="text-muted-foreground">
                        {selectedClient ? `${selectedClient.name} 님의 진로 진행 상황을 한눈에 확인하세요.` : "내담자를 선택하여 진로 진행 상황을 확인하세요."}
                    </p>
                </div>
            </div>

            {/* Client Selector */}
            <Card className="bg-white shadow-md border-gray-200">
                <CardHeader>
                    <CardTitle className="text-base">내담자 선택</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-4">
                        <Select value={selectedClientId} onValueChange={handleClientSelect}>
                            <SelectTrigger className="w-full max-w-md">
                                <SelectValue placeholder="내담자를 선택하세요" />
                            </SelectTrigger>
                            <SelectContent>
                                {clients.map((client) => (
                                    <SelectItem key={client.id} value={client.id}>
                                        {client.name} ({client.email})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {selectedClient && (
                            <Button asChild>
                                <Link href={`/roadmap?clientId=${selectedClientId}`}>
                                    새 목표 생성
                                </Link>
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            {!selectedClient ? (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-16">
                        <User className="h-12 w-12 text-muted-foreground mb-4" />
                        <p className="text-lg font-medium text-gray-900">내담자를 선택해주세요</p>
                        <p className="text-sm text-muted-foreground mt-2">
                            위에서 내담자를 선택하면 해당 내담자의 진로 정보가 표시됩니다.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <>
                    {/* Stats Cards */}
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">내담자 정보</CardTitle>
                                <User className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-gray-900">{selectedClient.name}</div>
                                <p className="text-xs text-muted-foreground">
                                    {selectedClient.email}
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">로드맵 진행률</CardTitle>
                                <Map className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-gray-900">0/0 단계</div>
                                <p className="text-xs text-muted-foreground">
                                    로드맵 미생성
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">자기소개서</CardTitle>
                                <FileText className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-gray-900">0개 초안</div>
                                <p className="text-xs text-muted-foreground">
                                    초안 미생성
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">다가오는 일정</CardTitle>
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-xl font-bold text-gray-900 truncate">
                                    {upcomingEvent ? upcomingEvent.title : "-"}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {upcomingEvent
                                        ? `${upcomingEvent.date} ${upcomingEvent.time || ''}`
                                        : "예정된 일정 없음"}
                                </p>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                        <Card className="col-span-4">
                            <CardHeader>
                                <CardTitle>추천 로드맵</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex flex-col items-center justify-center py-8 text-center">
                                    <Map className="h-12 w-12 text-muted-foreground mb-4" />
                                    <p className="text-sm font-medium text-gray-900">로드맵이 아직 생성되지 않았습니다</p>
                                    <p className="text-xs text-muted-foreground mt-2 mb-4">
                                        "새 목표 생성" 버튼을 클릭하여 로드맵을 만들어보세요.
                                    </p>
                                    <Button variant="outline" asChild>
                                        <Link href="/roadmap">로드맵 페이지로 이동 <ArrowRight className="ml-2 h-4 w-4" /></Link>
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="col-span-3">
                            <CardHeader>
                                <CardTitle>최근 활동</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex flex-col items-center justify-center py-8 text-center">
                                    <p className="text-sm text-muted-foreground">
                                        아직 활동 기록이 없습니다
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </>
            )}
        </div>
    )
}
