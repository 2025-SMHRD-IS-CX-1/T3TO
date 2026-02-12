"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, Search, Calendar as CalendarIcon, MessageSquare, Brain, FileText, ChevronRight, Trash2, Pencil, Loader2, RefreshCw, Sparkles } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { usePathname, useSearchParams } from "next/navigation"
import { getConsultations, createConsultation, updateConsultation, deleteConsultation } from "./actions"

export default function ConsultationsPage() {
    const [consultations, setConsultations] = useState<any[]>([])
    const [clients, setClients] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [isAddOpen, setIsAddOpen] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    const searchParams = useSearchParams()
    const clientId = searchParams.get('clientId')

    useEffect(() => {
        fetchData()
    }, [clientId])

    const fetchData = async () => {
        setLoading(true)
        const [consultationData, clientData] = await Promise.all([
            getConsultations(clientId || undefined),
            import('../admin/clients/actions').then(m => m.getClients())
        ])
        setConsultations(consultationData)
        setClients(clientData)
        setLoading(false)
    }

    const fetchConsultations = async () => {
        const data = await getConsultations(clientId || undefined)
        setConsultations(data)
    }

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setSubmitting(true)
        const formData = new FormData(e.currentTarget)
        const result = await createConsultation(formData)
        if (result.success) {
            await fetchConsultations()
            setIsAddOpen(false)
        } else {
            alert(result.error)
        }
        setSubmitting(false)
    }

    const [selectedConsultation, setSelectedConsultation] = useState<any>(null)
    const [isDetailOpen, setIsDetailOpen] = useState(false)
    const [analysis, setAnalysis] = useState<any>(null)
    const [loadingAnalysis, setLoadingAnalysis] = useState(false)

    const [editingConsultation, setEditingConsultation] = useState<any>(null)
    const [isEditOpen, setIsEditOpen] = useState(false)
    const [editSubmitting, setEditSubmitting] = useState(false)

    const handleViewDetail = async (consultation: any) => {
        setSelectedConsultation(consultation)
        setIsDetailOpen(true)
        setLoadingAnalysis(true)

        // Fetch analysis from supabase
        const { createClient } = await import('@/lib/supabase/client')
        const supabase = createClient()
        const { data } = await supabase
            .from('consultation_analysis')
            .select('*')
            .eq('consultation_id', consultation.consultation_id)
            .single()

        setAnalysis(data)
        setLoadingAnalysis(false)
    }

    const handleEditClick = (e: React.MouseEvent, item: any) => {
        e.stopPropagation()
        setEditingConsultation(item)
        setIsEditOpen(true)
    }

    const handleEditSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        if (!editingConsultation) return
        setEditSubmitting(true)
        const formData = new FormData(e.currentTarget)
        const result = await updateConsultation(editingConsultation.consultation_id, {
            content: (formData.get('content') as string) || '',
            round: parseInt((formData.get('round') as string) || '1') || 1,
            sessionDate: (formData.get('sessionDate') as string) || '',
            clientId: (formData.get('clientId') as string) || null,
        })
        if (result.success) {
            await fetchData()
            setIsEditOpen(false)
            setEditingConsultation(null)
        } else {
            alert(result.error)
        }
        setEditSubmitting(false)
    }

    const handleDeleteConsultation = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation()
        if (!confirm("정말 이 상담 기록을 삭제하시겠습니까?")) return

        const result = await deleteConsultation(id)
        if (result.success) {
            fetchData()
        } else {
            alert("삭제에 실패했습니다: " + result.error)
        }
    }

    if (loading) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">상담 관리</h1>
                    <p className="text-muted-foreground">내담자와의 상담 기록을 관리하고 AI 분석을 통해 인사이트를 얻으세요.</p>
                </div>
                <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-purple-600 hover:bg-purple-700">
                            <Plus className="mr-2 h-4 w-4" />
                            새 상담 기록하기
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>새 상담 기록</DialogTitle>
                            <DialogDescription>
                                오늘 진행한 상담 내용을 상세히 기록해 주세요. 저장 시 AI가 자동으로 분석을 시작합니다.
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="clientId">내담자 선택</Label>
                                <Select name="clientId" defaultValue={clientId || undefined} required>
                                    <SelectTrigger>
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
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="sessionDate">상담 일자</Label>
                                    <Input id="sessionDate" name="sessionDate" type="date" defaultValue={new Date().toISOString().split('T')[0]} required />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="round">상담 차수</Label>
                                    <Input id="round" name="round" type="number" defaultValue={(consultations.length + 1).toString()} required />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="content">상담 상세 내용</Label>
                                <Textarea
                                    id="content"
                                    name="content"
                                    placeholder="상담 과정에서 파악된 내담자의 관심사, 고민, 핵심 대화 내용을 입력하세요..."
                                    className="min-h-[200px]"
                                    required
                                />
                            </div>
                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>취소</Button>
                                <Button type="submit" disabled={submitting} className="bg-purple-600 hover:bg-purple-700">
                                    {submitting ? "분석 및 저장 중..." : "저장 및 AI 분석 시작"}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            {/* List and Cards */}
            {consultations.length === 0 ? (
                <Card className="border-dashed py-12">
                    <CardContent className="flex flex-col items-center justify-center text-center">
                        <MessageSquare className="h-12 w-12 text-gray-300 mb-4" />
                        <h3 className="text-lg font-medium text-gray-900">등록된 상담 기록이 없습니다</h3>
                        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                            첫 상담 기록을 작성해 보세요. AI가 내담자의 성향과 역량을 자동으로 분석해 줍니다.
                        </p>
                        <Button variant="outline" className="mt-6" onClick={() => setIsAddOpen(true)}>
                            지금 작성하기
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4">
                    {consultations.map((item) => (
                        <Card key={item.consultation_id} className="hover:shadow-md transition-shadow">
                            <CardContent className="p-0">
                                <div className="flex flex-col md:flex-row md:items-center">
                                    <div className="p-6 flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-100">
                                                {item.consultation_round}회차
                                            </Badge>
                                            {item.career_profile?.client_name && (
                                                <Badge variant="secondary" className="bg-gray-100 text-gray-700">
                                                    {item.career_profile.client_name}
                                                </Badge>
                                            )}
                                            <div className="flex items-center text-sm text-muted-foreground">
                                                <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                                                {item.session_date}
                                            </div>
                                            <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-none">
                                                분석 완료
                                            </Badge>
                                            <div className="flex-1" />
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-gray-400 hover:text-purple-600 h-8 w-8 p-0"
                                                onClick={(e) => handleEditClick(e, item)}
                                                title="상담 기록 수정"
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-gray-400 hover:text-red-600 h-8 w-8 p-0"
                                                onClick={(e) => handleDeleteConsultation(e, item.consultation_id)}
                                                title="상담 기록 삭제"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                        <h3 className="text-lg font-bold text-gray-900 mb-2 line-clamp-1">
                                            {item.consultation_content.split('\n')[0] || "상담 기록"}
                                        </h3>
                                        <p className="text-sm text-gray-600 line-clamp-2">
                                            {item.consultation_content}
                                        </p>
                                    </div>
                                    <div className="border-t md:border-t-0 md:border-l p-6 md:w-56 bg-gray-50/50 flex flex-col justify-center">
                                        <Button
                                            variant="outline"
                                            className="h-14 border-purple-100 hover:border-purple-300 hover:bg-purple-50 group transition-all"
                                            onClick={() => handleViewDetail(item)}
                                        >
                                            <div className="flex items-center w-full">
                                                <div className="bg-purple-50 p-2 rounded-lg mr-3 group-hover:bg-purple-100 transition-colors">
                                                    <RefreshCw className="h-4 w-4 text-purple-600 group-hover:rotate-180 transition-transform duration-500" />
                                                </div>
                                                <div className="flex-1 text-left">
                                                    <p className="text-xs font-bold text-gray-900">AI 분석 및 상세</p>
                                                    <p className="text-[10px] text-purple-600 font-medium">분석 결과 보기</p>
                                                </div>
                                                <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-purple-500 transition-colors" />
                                            </div>
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Edit Dialog */}
            <Dialog open={isEditOpen} onOpenChange={(open) => { if (!open) setEditingConsultation(null); setIsEditOpen(open) }}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>상담 기록 수정</DialogTitle>
                        <DialogDescription>
                            상담 일자, 회차, 내담자, 상세 내용을 수정할 수 있습니다. 저장 후 기존 AI 분석 결과는 그대로 유지됩니다.
                        </DialogDescription>
                    </DialogHeader>
                    {editingConsultation && (
                        <form key={editingConsultation.consultation_id} onSubmit={handleEditSubmit} className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="edit-clientId">내담자 선택</Label>
                                <Select name="clientId" defaultValue={editingConsultation.profile_id || clientId || undefined} required>
                                    <SelectTrigger id="edit-clientId">
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
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="edit-sessionDate">상담 일자</Label>
                                    <Input
                                        id="edit-sessionDate"
                                        name="sessionDate"
                                        type="date"
                                        defaultValue={editingConsultation.session_date || new Date().toISOString().split('T')[0]}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="edit-round">상담 차수</Label>
                                    <Input
                                        id="edit-round"
                                        name="round"
                                        type="number"
                                        defaultValue={editingConsultation.consultation_round}
                                        min={1}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-content">상담 상세 내용</Label>
                                <Textarea
                                    id="edit-content"
                                    name="content"
                                    placeholder="상담 과정에서 파악된 내담자의 관심사, 고민, 핵심 대화 내용을 입력하세요..."
                                    className="min-h-[200px]"
                                    defaultValue={editingConsultation.consultation_content}
                                    required
                                />
                            </div>
                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => { setIsEditOpen(false); setEditingConsultation(null) }}>취소</Button>
                                <Button type="submit" disabled={editSubmitting} className="bg-purple-600 hover:bg-purple-700">
                                    {editSubmitting ? "저장 중..." : "수정 저장"}
                                </Button>
                            </DialogFooter>
                        </form>
                    )}
                </DialogContent>
            </Dialog>

            {/* Detail Dialog */}
            <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <MessageSquare className="h-5 w-5 text-purple-600" />
                            상담 상세 및 AI 분석 결과
                        </DialogTitle>
                    </DialogHeader>
                    {selectedConsultation && (
                        <div className="space-y-6 py-4">
                            <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg text-sm">
                                <div>
                                    <p className="text-gray-500">상담 일자</p>
                                    <p className="font-semibold">{selectedConsultation.session_date}</p>
                                </div>
                                <div>
                                    <p className="text-gray-500">상담 회차</p>
                                    <p className="font-semibold">{selectedConsultation.consultation_round}회차</p>
                                </div>
                            </div>

                            <section>
                                <h4 className="font-bold mb-2 flex items-center gap-2">
                                    <FileText className="h-4 w-4 text-gray-500" />
                                    상담 원문
                                </h4>
                                <div className="p-4 border rounded-lg bg-white whitespace-pre-line text-sm text-gray-700 leading-relaxed">
                                    {selectedConsultation.consultation_content}
                                </div>
                            </section>

                            <section>
                                <h4 className="font-bold mb-4 flex items-center gap-2">
                                    <Brain className="h-4 w-4 text-blue-500" />
                                    AI 역량 및 성향 분석
                                </h4>
                                {loadingAnalysis ? (
                                    <div className="flex justify-center py-8">
                                        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                                    </div>
                                ) : analysis ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <Card>
                                            <CardHeader className="p-4 pb-0">
                                                <CardTitle className="text-sm">관심 키워드</CardTitle>
                                            </CardHeader>
                                            <CardContent className="p-4 text-sm text-gray-700">
                                                {analysis.interest_keywords}
                                            </CardContent>
                                        </Card>
                                        <Card>
                                            <CardHeader className="p-4 pb-0">
                                                <CardTitle className="text-sm">핵심 가치관</CardTitle>
                                            </CardHeader>
                                            <CardContent className="p-4 text-sm text-gray-700">
                                                {analysis.values}
                                            </CardContent>
                                        </Card>
                                        <Card>
                                            <CardHeader className="p-4 pb-0">
                                                <CardTitle className="text-sm">강점 (Strengths)</CardTitle>
                                            </CardHeader>
                                            <CardContent className="p-4 text-sm text-green-700">
                                                {analysis.strengths}
                                            </CardContent>
                                        </Card>
                                        <Card>
                                            <CardHeader className="p-4 pb-0">
                                                <CardTitle className="text-sm">약점 (Weaknesses)</CardTitle>
                                            </CardHeader>
                                            <CardContent className="p-4 text-sm text-red-700">
                                                {analysis.weaknesses}
                                            </CardContent>
                                        </Card>
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground text-center py-8">분석 정보를 불러올 수 없습니다.</p>
                                )}
                            </section>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}

