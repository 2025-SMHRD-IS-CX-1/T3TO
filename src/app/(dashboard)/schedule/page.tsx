"use client"

import { useState, useEffect } from "react"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Clock, MapPin, Video, MoreHorizontal, Check, X, Plus, Loader2, Calendar as CalendarIcon, Trash2 } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useSearchParams } from "next/navigation"
import { getEvents, createEvent, deleteEvent } from "./actions"
import { getClients } from "../admin/clients/actions"
import { useAdminContext } from "@/components/layout/shell"

export default function SchedulePage() {
    const [date, setDate] = useState<Date | undefined>(new Date())
    const [selectedDate, setSelectedDate] = useState<string>("")
    const [events, setEvents] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [ampm, setAmpm] = useState<"오전" | "오후">("오전")
    const [hours, setHours] = useState("09")
    const [minutes, setMinutes] = useState("00")
    const [availableClients, setAvailableClients] = useState<any[]>([])

    const searchParams = useSearchParams()
    const adminContext = useAdminContext()
    const counselorId = searchParams.get('counselorId')
    const isAdmin = adminContext?.role === 'admin'

    useEffect(() => {
        fetchEvents()
        fetchAvailableClients()
    }, [counselorId])

    const fetchAvailableClients = async () => {
        const data = await getClients(counselorId || undefined)
        setAvailableClients(data)
    }

    const fetchEvents = async () => {
        setIsLoading(true)
        const data = await getEvents(counselorId || undefined)
        setEvents(data)
        setIsLoading(false)
    }

    const handleDateSelect = (newDate: Date | undefined) => {
        setDate(newDate)
        if (newDate) {
            // Format date as YYYY-MM-DD for input field
            const formatted = newDate.toLocaleDateString('en-CA') // YYYY-MM-DD in local time
            setSelectedDate(formatted)
        }
    }

    const handleCreateEvent = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setIsSubmitting(true)
        const form = e.currentTarget
        const formData = new FormData(form)

        try {
            const result = await createEvent(formData)
            if (result.success) {
                await fetchEvents()
                setIsAddDialogOpen(false)
                form?.reset()
            } else {
                alert(result.error || "일정 추가에 실패했습니다.")
            }
        } catch (e: any) {
            console.error(e)
            alert(e.message || "알 수 없는 오류가 발생했습니다.")
        }
        setIsSubmitting(false)
    }

    const handleDeleteEvent = async (eventId: string) => {
        if (!confirm("정말 이 일정을 삭제하시겠습니까?")) return

        const result = await deleteEvent(eventId)
        if (result.success) {
            await fetchEvents()
        } else {
            alert(result.error || "일정 삭제에 실패했습니다.")
        }
    }

    // Filter events for selected date
    const selectedDateEvents = events.filter(event => {
        if (!date) return false
        const eventDate = new Date(event.date)
        return eventDate.getDate() === date.getDate() &&
            eventDate.getMonth() === date.getMonth() &&
            eventDate.getFullYear() === date.getFullYear()
    })

    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            {/* 관리자가 상담사를 선택하지 않았을 때 안내 */}
            {isAdmin && !counselorId && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                    <div className="flex items-start gap-2">
                        <span className="text-lg">⚠️</span>
                        <div>
                            <p className="font-semibold mb-1">상담사를 선택해주세요</p>
                            <p className="text-xs">왼쪽 사이드바에서 상담사를 선택하면 해당 상담사의 일정을 확인할 수 있습니다.</p>
                        </div>
                    </div>
                </div>
            )}
            
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">일정 관리</h1>
                    <p className="text-muted-foreground">멘토링 일정과 주요 커리어 이벤트를 확인하세요.</p>
                </div>

                <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                    <DialogTrigger asChild>
                        <Button>+ 새 일정 추가</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>새 일정 추가</DialogTitle>
                            <DialogDescription>
                                새로운 멘토링이나 커리어 관련 일정을 등록합니다.
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleCreateEvent} className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="title">일정 제목</Label>
                                <Input id="title" name="title" placeholder="홍길동님 멘토링 3회차" required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="clientId">내담자 선택 (필요시)</Label>
                                <select
                                    id="clientId"
                                    name="clientId"
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                >
                                    <option value="">내담자 선택 안 함</option>
                                    {availableClients.map(client => (
                                        <option key={client.id} value={client.id}>
                                            {client.name} ({client.email})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="content">상세 내용</Label>
                                <Textarea id="content" name="content" placeholder="상담 시 논의할 주요 안건을 입력하세요." className="h-24" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="date">날짜</Label>
                                    <Input
                                        id="date"
                                        name="date"
                                        type="date"
                                        defaultValue={selectedDate}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="time">시간</Label>
                                    <div className="flex items-center gap-2">
                                        <select
                                            value={ampm}
                                            onChange={(e) => setAmpm(e.target.value as "오전" | "오후")}
                                            className="w-20 flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        >
                                            <option value="오전">오전</option>
                                            <option value="오후">오후</option>
                                        </select>
                                        <div className="flex items-center gap-1 flex-1">
                                            <Input
                                                type="text"
                                                inputMode="numeric"
                                                value={hours}
                                                onChange={(e) => {
                                                    const val = e.target.value.replace(/[^0-9]/g, "").slice(0, 2);
                                                    if (val === "" || (parseInt(val) >= 1 && parseInt(val) <= 12)) {
                                                        setHours(val);
                                                    }
                                                }}
                                                className="w-16 text-center"
                                                placeholder="시"
                                                maxLength={2}
                                            />
                                            <span>:</span>
                                            <Input
                                                type="text"
                                                inputMode="numeric"
                                                value={minutes}
                                                onChange={(e) => {
                                                    const val = e.target.value.replace(/[^0-9]/g, "").slice(0, 2);
                                                    if (val === "" || (parseInt(val) >= 0 && parseInt(val) <= 59)) {
                                                        setMinutes(val);
                                                    }
                                                }}
                                                className="w-16 text-center"
                                                placeholder="분"
                                                maxLength={2}
                                            />
                                        </div>
                                    </div>
                                    {/* Calculated HH:mm for the server action */}
                                    <input
                                        type="hidden"
                                        name="time"
                                        value={`${(() => {
                                            let h = parseInt(hours || "0");
                                            if (ampm === "오후" && h < 12) h += 12;
                                            if (ampm === "오전" && h === 12) h = 0;
                                            return h.toString().padStart(2, '0');
                                        })()}:${(minutes || "00").padStart(2, '0')}`}
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button type="submit" disabled={isSubmitting}>
                                    {isSubmitting ? "저장 중..." : "저장"}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Calendar View */}
                <div className="lg:col-span-8 xl:col-span-8">
                    <Card className="shadow-lg border-purple-100 overflow-hidden bg-white">
                        <CardHeader className="bg-purple-50/50 border-b pb-6 pt-8">
                            <CardTitle className="text-xl font-bold flex items-center justify-center gap-2 text-gray-900">
                                <CalendarIcon className="h-6 w-6 text-purple-600" />
                                멘토링 캘린더
                            </CardTitle>
                            <CardDescription className="text-center text-muted-foreground mt-1">
                                날짜를 선택하여 실시간 일정을 관리하세요
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-10 flex justify-center bg-white">
                            <div className="w-full max-w-3xl">
                                <Calendar
                                    mode="single"
                                    selected={date}
                                    onSelect={handleDateSelect}
                                    className="w-full"
                                    modifiers={{
                                        hasEvent: (d) => events.some(e => {
                                            const ed = new Date(e.date)
                                            return ed.getDate() === d.getDate() &&
                                                ed.getMonth() === d.getMonth() &&
                                                ed.getFullYear() === d.getFullYear()
                                        })
                                    }}
                                    modifiersClassNames={{
                                        hasEvent: "after:content-[''] after:absolute after:top-1 after:right-1 after:w-2 after:h-2 after:bg-purple-500 after:rounded-full"
                                    }}
                                />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Events List */}
                <div className="lg:col-span-4 xl:col-span-4 space-y-6">
                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        <Clock className="h-5 w-5 text-purple-600" />
                        {date ? `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일` : '선택된 날짜'} 일정
                    </h2>

                    {isLoading ? (
                        <div className="flex justify-center py-10">
                            <Loader2 className="h-8 w-8 animate-spin text-[#0078d4]" />
                        </div>
                    ) : selectedDateEvents.length > 0 ? (
                        selectedDateEvents.map((event) => (
                            <Card key={event.id} className="border-l-4 border-l-purple-500">
                                <CardHeader className="pb-3 px-4 sm:px-6">
                                    <div className="flex flex-wrap justify-between items-start gap-2">
                                        <div className="min-w-0 flex-1">
                                            <CardTitle className="text-base font-semibold break-words">{event.title}</CardTitle>
                                            <CardDescription className="flex flex-wrap items-center mt-1 gap-x-2 gap-y-1">
                                                <span className="flex items-center">
                                                    <Clock className="w-3 h-3 mr-1" /> {event.time}
                                                </span>
                                                <span className="hidden sm:inline text-gray-300">•</span>
                                                <span className="flex items-center">
                                                    {event.type === 'online' ? <Video className="w-3 h-3 mr-1" /> : <MapPin className="w-3 h-3 mr-1" />}
                                                    {event.type === 'online' ? 'Google Meet' : '오프라인'}
                                                </span>
                                            </CardDescription>
                                        </div>
                                        {event.status === 'confirmed' ? (
                                            <Badge variant="success" className="shrink-0">확정됨</Badge>
                                        ) : (
                                            <Badge variant="warning" className="shrink-0">대기 중</Badge>
                                        )}
                                    </div>
                                    {event.content && (
                                        <p className="mt-3 text-sm text-gray-600 border-t pt-2 line-clamp-2">
                                            {event.content}
                                        </p>
                                    )}
                                </CardHeader>
                                <CardContent className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">
                                            {event.mentor[0]}
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2 sm:justify-end flex-1">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-gray-400 hover:text-red-600 h-8 w-8 p-0 shrink-0"
                                            onClick={() => handleDeleteEvent(event.id)}
                                            title="일정 삭제"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="text-xs sm:text-sm h-8"
                                            onClick={() => alert(`[상세 내용]\n${event.content || '등록된 상세 내용이 없습니다.'}`)}
                                        >
                                            자료 확인
                                        </Button>
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            className="text-xs sm:text-sm h-8"
                                            onClick={() => {
                                                if (event.type === 'online') {
                                                    window.open('https://meet.google.com/new', '_blank')
                                                } else {
                                                    alert('오프라인 일정입니다. 장소를 확인해 주세요.')
                                                }
                                            }}
                                        >
                                            입장하기
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))
                    ) : (
                        <Card className="bg-gray-50 border-dashed">
                            <CardContent className="py-8 flex flex-col items-center justify-center text-gray-500">
                                <p className="text-sm">등록된 추가 일정이 없습니다.</p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    )
}
