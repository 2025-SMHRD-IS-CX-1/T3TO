"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Map, FileText, Calendar, ArrowRight, User, Plus, Loader2 } from "lucide-react"
import Link from "next/link"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { getClients, createClientProfile, deleteClient, updateClientProfile } from "../admin/clients/actions"
import { getLatestEvent } from "../schedule/actions"
import { getRoadmap } from "../roadmap/actions"
import { getDrafts } from "../cover-letter/actions"
import { useAdminContext } from "@/components/layout/shell"
import { notifyNotificationCheck } from "@/lib/utils"

export default function DashboardPage() {
    const [clients, setClients] = useState<any[]>([])
    const [selectedClientId, setSelectedClientId] = useState<string>("")
    const [selectedClient, setSelectedClient] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [upcomingEvent, setUpcomingEvent] = useState<any>(null)
    const [roadmapData, setRoadmapData] = useState<any>(null)
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
    const [isSavingEdit, setIsSavingEdit] = useState(false)
    const [draftCount, setDraftCount] = useState(0)

    const searchParams = useSearchParams()
    const router = useRouter()
    const adminContext = useAdminContext()
    const urlClientId = searchParams.get('clientId')
    const counselorId = searchParams.get('counselorId')
    const isAdmin = adminContext?.role === 'admin'

    useEffect(() => {
        fetchClients()
    }, [counselorId])

    useEffect(() => {
        if (clients.length > 0 && urlClientId) {
            handleClientSelect(urlClientId)
        }
    }, [clients, urlClientId])

    // URL에서 clientId가 변경되면 로드맵 다시 가져오기
    useEffect(() => {
        if (urlClientId && selectedClientId) {
            fetchRoadmap(urlClientId)
        } else {
            setRoadmapData(null)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [urlClientId, counselorId, selectedClientId])

    // 선택된 내담자의 자기소개서 초안 개수
    useEffect(() => {
        if (!selectedClientId) {
            setDraftCount(0)
            return
        }
        getDrafts(selectedClientId, counselorId || undefined).then((list) => setDraftCount(list.length))
    }, [selectedClientId, counselorId])

    const fetchClients = async () => {
        setLoading(true)
        console.log('fetchClients: 내담자 목록 조회 시작', { counselorId })
        const data = await getClients(counselorId || undefined)
        console.log('fetchClients: 내담자 목록 조회 완료', { count: data.length, counselorId })
        setClients(data)
        setLoading(false)
    }

    const fetchUpcomingEvent = async (clientId: string) => {
        const event = await getLatestEvent(clientId)
        setUpcomingEvent(event)
    }

    const fetchRoadmap = async (clientId: string) => {
        const roadmap = await getRoadmap(clientId, counselorId || undefined)
        setRoadmapData(roadmap)
    }

    const handleClientSelect = (clientId: string) => {
        setSelectedClientId(clientId)
        const client = clients.find(c => c.id === clientId)
        setSelectedClient(client)
        if (clientId) {
            fetchUpcomingEvent(clientId)
            fetchRoadmap(clientId)
        } else {
            setRoadmapData(null)
        }

        // URL 동기화: 선택 시 URL 파라미터를 업데이트하여 사이드바 등과 세션 유지
        const params = new URLSearchParams()
        params.set('clientId', clientId)
        if (counselorId) params.set('counselorId', counselorId)
        router.push(`/dashboard?${params.toString()}`)
    }

    const handleAddClient = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        
        setIsSubmitting(true)

        const form = e.currentTarget
        const formData = new FormData(form)

        // counselorId는 관리자가 상담사를 선택했을 때만 전달, 상담사 계정은 undefined
        const result = await createClientProfile(formData, counselorId || undefined)

        if (result.success) {
            setIsAddDialogOpen(false)
            form?.reset()
            notifyNotificationCheck()
            setTimeout(async () => {
                await fetchClients()
                router.refresh()
            }, 100)
        } else {
            alert("내담자 추가에 실패했습니다: " + result.error)
        }
        setIsSubmitting(false)
    }

    const handleEditProfile = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        if (!selectedClientId) return
        setIsSavingEdit(true)
        const form = e.currentTarget
        const formData = new FormData(form)
        const result = await updateClientProfile(selectedClientId, formData, counselorId || undefined)
        setIsSavingEdit(false)
        if (result.success) {
            setIsEditDialogOpen(false)
            notifyNotificationCheck()
            const updated = await getClients(counselorId || undefined)
            setClients(updated)
            const next = updated.find((c: { id: string }) => c.id === selectedClientId)
            if (next) setSelectedClient(next)
            router.refresh()
        } else {
            alert("수정에 실패했습니다: " + (result as { error?: string }).error)
        }
    }

    const handleConfirmDelete = async () => {
        if (!selectedClientId) return
        setIsDeleting(true)
        const result = await deleteClient(selectedClientId, counselorId || undefined)
        setIsDeleting(false)
        setDeleteConfirmOpen(false)
        if (result.success) {
            notifyNotificationCheck()
            await fetchClients()
            setSelectedClientId("")
            setSelectedClient(null)
            const params = new URLSearchParams()
            if (counselorId) params.set("counselorId", counselorId)
            router.push(params.toString() ? `/dashboard?${params.toString()}` : "/dashboard")
        } else {
            alert("삭제에 실패했습니다: " + result.error)
        }
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
            {/* 관리자가 상담사를 선택하지 않았을 때 안내 */}
            {isAdmin && !counselorId && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                    <div className="flex items-start gap-2">
                        <span className="text-lg">⚠️</span>
                        <div>
                            <p className="font-semibold mb-1">상담사를 선택해주세요</p>
                            <p className="text-xs">왼쪽 사이드바에서 상담사를 선택하면 해당 상담사의 내담자 정보를 확인할 수 있습니다.</p>
                        </div>
                    </div>
                </div>
            )}
            
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
                        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                            <Button variant="secondary" onClick={() => setIsAddDialogOpen(true)}>
                                <Plus className="h-4 w-4" /> 내담자 추가
                            </Button>
                            <DialogContent className="sm:max-w-[600px]">
                                <DialogHeader>
                                    <DialogTitle>신규 내담자 등록</DialogTitle>
                                    <DialogDescription>
                                        새로운 내담자의 기본 정보를 입력하여 시스템에 등록합니다.
                                    </DialogDescription>
                                </DialogHeader>
                                <form onSubmit={handleAddClient} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="name">이름 *</Label>
                                            <Input id="name" name="name" placeholder="홍길동" required />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="email">이메일 *</Label>
                                            <Input id="email" name="email" type="email" placeholder="hong@example.com" required />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="gender">성별</Label>
                                            <select id="gender" name="gender" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                                                <option value="">선택 안 함</option>
                                                <option value="남성">남성</option>
                                                <option value="여성">여성</option>
                                                <option value="기타">기타</option>
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="age_group">나이</Label>
                                            <Input
                                                id="age_group"
                                                name="age_group"
                                                type="number"
                                                min={15}
                                                max={100}
                                                placeholder="만 25"
                                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="education_level">학력</Label>
                                            <select id="education_level" name="education_level" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                                                <option value="">선택 안 함</option>
                                                <option value="고등학교 졸업">고등학교 졸업</option>
                                                <option value="전문대 졸업">전문대 졸업</option>
                                                <option value="대학교 재학">대학교 재학</option>
                                                <option value="대학교 졸업">대학교 졸업</option>
                                                <option value="석사">석사</option>
                                                <option value="박사">박사</option>
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="major">전공</Label>
                                            <Input id="major" name="major" placeholder="컴퓨터공학" />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="work_experience">경력 사항 (경력 기술서 내용 등)</Label>
                                        <Textarea
                                            id="work_experience"
                                            name="work_experience"
                                            placeholder="본인의 주요 경력 사항을 기술해주세요. (예: OO사 서비스 기획 3년, OO 프로젝트 리딩 등)"
                                            className="h-24"
                                        />
                                    </div>

                                    <div className="space-y-4 pt-2 border-t mt-4">
                                        <h4 className="text-sm font-bold text-gray-900">추가 분석 정보</h4>
                                        <div className="space-y-2">
                                            <Label htmlFor="career_orientation">진로 성향</Label>
                                            <Textarea id="career_orientation" name="career_orientation" placeholder="예: 안정적인 대기업 환경 선호, 대인 관계 중시" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="skill_vector">보유 기술 (스택)</Label>
                                            <Textarea id="skill_vector" name="skill_vector" placeholder="예: React, Node.js, Python, SQL" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="recommended_careers">희망 직무</Label>
                                            <Input id="recommended_careers" name="recommended_careers" placeholder="예: 프론트엔드 개발자, 데이터 엔지니어" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="target_company">목표 기업</Label>
                                            <Input id="target_company" name="target_company" placeholder="예: 네이버, 토스, 구글 코리아" />
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                                            취소
                                        </Button>
                                        <Button type="submit" disabled={isSubmitting}>
                                            {isSubmitting ? (
                                                <>
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 저장 중...
                                                </>
                                            ) : (
                                                "등록하기"
                                            )}
                                        </Button>
                                    </DialogFooter>
                                </form>
                            </DialogContent>
                        </Dialog>
                        <Button
                            type="button"
                            variant="outline"
                            className="shrink-0 bg-white text-red-600 border-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-700 disabled:opacity-60 disabled:cursor-not-allowed"
                            disabled={!selectedClientId}
                            onClick={() => setDeleteConfirmOpen(true)}
                        >
                            삭제
                        </Button>
                        {selectedClient && (
                            <Button asChild>
                                <Link href={`/roadmap?clientId=${selectedClientId}${counselorId ? `&counselorId=${counselorId}` : ''}`}>
                                    새 목표 생성
                                </Link>
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* 내담자 삭제 확인 다이얼로그 */}
            <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>내담자 삭제</DialogTitle>
                        <DialogDescription className="pt-1">
                            정말로 이 내담자를 삭제하시겠습니까? 이 작업은 되돌릴 수 없으며, 해당 내담자의 모든 데이터가 삭제됩니다.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-0 pt-4">
                        <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)} disabled={isDeleting}>
                            취소
                        </Button>
                        <Button
                            className="bg-red-600 hover:bg-red-700 text-white"
                            onClick={handleConfirmDelete}
                            disabled={isDeleting}
                        >
                            {isDeleting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 삭제 중...
                                </>
                            ) : (
                                "삭제"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 내담자 정보 수정 다이얼로그 */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className="sm:max-w-[600px]">
                    <DialogHeader>
                        <DialogTitle>내담자 정보 수정</DialogTitle>
                        <DialogDescription>
                            {selectedClient?.name}님의 정보를 수정합니다.
                        </DialogDescription>
                    </DialogHeader>
                    {selectedClient && (
                        <form onSubmit={handleEditProfile} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="edit-name">이름 *</Label>
                                    <Input id="edit-name" name="name" defaultValue={selectedClient.name} placeholder="홍길동" required />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="edit-email">이메일 *</Label>
                                    <Input id="edit-email" name="email" type="email" defaultValue={selectedClient.email} placeholder="hong@example.com" required />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="edit-gender">성별</Label>
                                    <select id="edit-gender" name="gender" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" defaultValue={selectedClient.gender ?? ''}>
                                        <option value="">선택 안 함</option>
                                        <option value="남성">남성</option>
                                        <option value="여성">여성</option>
                                        <option value="기타">기타</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="edit-age_group">연령대</Label>
                                    <select id="edit-age_group" name="age_group" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" defaultValue={selectedClient.age_group ?? ''}>
                                        <option value="">선택 안 함</option>
                                        <option value="10대">10대</option>
                                        <option value="20대">20대</option>
                                        <option value="30대">30대</option>
                                        <option value="40대">40대</option>
                                        <option value="50대 이상">50대 이상</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="edit-education_level">학력</Label>
                                    <select id="edit-education_level" name="education_level" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" defaultValue={selectedClient.education_level ?? ''}>
                                        <option value="">선택 안 함</option>
                                        <option value="고등학교 졸업">고등학교 졸업</option>
                                        <option value="전문대 졸업">전문대 졸업</option>
                                        <option value="대학교 재학">대학교 재학</option>
                                        <option value="대학교 졸업">대학교 졸업</option>
                                        <option value="석사">석사</option>
                                        <option value="박사">박사</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="edit-major">전공</Label>
                                    <Input id="edit-major" name="major" defaultValue={selectedClient.major ?? ''} placeholder="컴퓨터공학" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-work_experience">경력 연차 (숫자)</Label>
                                <Input id="edit-work_experience" name="work_experience" type="text" defaultValue={selectedClient.work_experience_years ?? ''} placeholder="0" />
                            </div>
                            <div className="space-y-4 pt-2 border-t mt-4">
                                <h4 className="text-sm font-bold text-gray-900">추가 분석 정보</h4>
                                <div className="space-y-2">
                                    <Label htmlFor="edit-career_orientation">진로 성향</Label>
                                    <Textarea id="edit-career_orientation" name="career_orientation" defaultValue={selectedClient.career_orientation ?? ''} placeholder="예: 안정적인 대기업 환경 선호" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="edit-skill_vector">보유 기술 (스택)</Label>
                                    <Textarea id="edit-skill_vector" name="skill_vector" defaultValue={selectedClient.skill_vector ?? ''} placeholder="예: React, Node.js, Python" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="edit-recommended_careers">희망 직무</Label>
                                    <Input id="edit-recommended_careers" name="recommended_careers" defaultValue={selectedClient.recommended_careers ?? ''} placeholder="예: 프론트엔드 개발자" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="edit-target_company">목표 기업</Label>
                                    <Input id="edit-target_company" name="target_company" defaultValue={selectedClient.target_company ?? ''} placeholder="예: 네이버, 토스" />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                                    취소
                                </Button>
                                <Button type="submit" disabled={isSavingEdit}>
                                    {isSavingEdit ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 저장 중...
                                        </>
                                    ) : (
                                        "저장"
                                    )}
                                </Button>
                            </DialogFooter>
                        </form>
                    )}
                </DialogContent>
            </Dialog>

            {!selectedClient ? (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-16">
                        <User className="h-12 w-12 text-muted-foreground mb-4" />
                        <p className="text-lg font-medium text-gray-900">내담자를 선택해주세요</p>
                        <p className="text-sm text-muted-foreground mt-2 mb-4">
                            위에서 내담자를 선택하면 해당 내담자의 진로 정보가 표시됩니다.
                        </p>
                        {clients.length === 0 && (
                            <Button onClick={() => setIsAddDialogOpen(true)}>
                                <Plus className="h-4 w-4" /> 내담자 추가하기
                            </Button>
                        )}
                    </CardContent>
                </Card>
            ) : (
                <>
                    {/* Stats Cards - 클릭 시 수정/조회 페이지로 이동 */}
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <Card
                            className="cursor-pointer transition-colors hover:bg-gray-50/80"
                            onClick={() => setIsEditDialogOpen(true)}
                        >
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">{selectedClient.name}님 정보</CardTitle>
                                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                                    <User className="h-4 w-4" />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-gray-900">{selectedClient.name}</div>
                                <p className="text-xs text-muted-foreground mt-1">클릭하여 정보 수정</p>
                            </CardContent>
                        </Card>
                        <Link href={`/roadmap?clientId=${selectedClientId}${counselorId ? `&counselorId=${counselorId}` : ''}`}>
                            <Card className="cursor-pointer transition-colors hover:bg-gray-50/80">
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">로드맵 진행률</CardTitle>
                                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                                        <Map className="h-4 w-4" />
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    {roadmapData && roadmapData.milestones ? (() => {
                                        try {
                                            const milestones = JSON.parse(roadmapData.milestones)
                                            const completed = milestones.filter((m: any) => m.status === 'completed' || m.status === 'in-progress').length
                                            const total = milestones.length
                                            return <div className="text-2xl font-bold text-gray-900">{completed}/{total} 단계</div>
                                        } catch {
                                            return <div className="text-2xl font-bold text-gray-900">0/0 단계</div>
                                        }
                                    })() : (
                                        <div className="text-2xl font-bold text-gray-900">0/0 단계</div>
                                    )}
                                    <p className="text-xs text-muted-foreground mt-1">클릭하여 로드맵 조회</p>
                                </CardContent>
                            </Card>
                        </Link>
                        <Link href={`/cover-letter?clientId=${selectedClientId}${counselorId ? `&counselorId=${counselorId}` : ''}`}>
                            <Card className="cursor-pointer transition-colors hover:bg-gray-50/80">
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">자기소개서</CardTitle>
                                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                                        <FileText className="h-4 w-4" />
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-gray-900">{draftCount}개 초안</div>
                                    <p className="text-xs text-muted-foreground mt-1">클릭하여 작성·조회</p>
                                </CardContent>
                            </Card>
                        </Link>
                        <Link href={`/schedule?clientId=${selectedClientId}${counselorId ? `&counselorId=${counselorId}` : ''}`}>
                            <Card className="cursor-pointer transition-colors hover:bg-gray-50/80">
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">다가오는 일정</CardTitle>
                                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                                        <Calendar className="h-4 w-4" />
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-xl font-bold text-gray-900 truncate">
                                        {upcomingEvent ? upcomingEvent.title : "-"}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">클릭하여 일정 조회</p>
                                </CardContent>
                            </Card>
                        </Link>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                        <Card className="col-span-4">
                            <CardHeader>
                                <CardTitle>추천 로드맵</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {roadmapData && roadmapData.milestones ? (() => {
                                    try {
                                        const milestones = JSON.parse(roadmapData.milestones)
                                        const firstStep = milestones[0]
                                        return (
                                            <div className="space-y-4">
                                                <div className="border-l-4 border-purple-600 pl-4">
                                                    <h3 className="font-semibold text-gray-900 mb-2">{firstStep?.title || '로드맵'}</h3>
                                                    <p className="text-sm text-gray-600 line-clamp-2">{firstStep?.description || ''}</p>
                                                    {roadmapData.target_job && (
                                                        <div className="mt-2 flex items-center gap-2">
                                                            <Badge variant="outline" className="text-xs">
                                                                목표: {roadmapData.target_job}
                                                                {roadmapData.target_company && ` @ ${roadmapData.target_company}`}
                                                            </Badge>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 pt-2 border-t">
                                                    <Button variant="outline" size="sm" asChild>
                                                        <Link
                                                            href={
                                                                (() => {
                                                                    const params = new URLSearchParams()
                                                                    const cid = selectedClientId || urlClientId
                                                                    if (cid) params.set("clientId", cid)
                                                                    if (counselorId) params.set("counselorId", counselorId)
                                                                    const qs = params.toString()
                                                                    return qs ? `/roadmap?${qs}` : "/roadmap"
                                                                })()
                                                            }
                                                        >
                                                            전체 로드맵 보기 <ArrowRight className="ml-2 h-4 w-4" />
                                                        </Link>
                                                    </Button>
                                                </div>
                                            </div>
                                        )
                                    } catch {
                                        return (
                                            <div className="flex flex-col items-center justify-center py-8 text-center">
                                                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-50 text-purple-600">
                                                    <Map className="h-6 w-6" />
                                                </div>
                                                <p className="text-sm font-medium text-gray-900">로드맵이 아직 생성되지 않았습니다</p>
                                                <p className="text-xs text-muted-foreground mt-2 mb-4">
                                                    "새 목표 생성" 버튼을 클릭하여 로드맵을 만들어보세요.
                                                </p>
                                                <Button variant="outline" asChild>
                                                    <Link
                                                        href={
                                                            (() => {
                                                                const params = new URLSearchParams()
                                                                const cid = selectedClientId || urlClientId
                                                                if (cid) params.set("clientId", cid)
                                                                if (counselorId) params.set("counselorId", counselorId)
                                                                const qs = params.toString()
                                                                return qs ? `/roadmap?${qs}` : "/roadmap"
                                                            })()
                                                        }
                                                    >
                                                        로드맵 페이지로 이동 <ArrowRight className="ml-2 h-4 w-4" />
                                                    </Link>
                                                </Button>
                                            </div>
                                        )
                                    }
                                })() : (
                                    <div className="flex flex-col items-center justify-center py-8 text-center">
                                        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-50 text-purple-600">
                                            <Map className="h-6 w-6" />
                                        </div>
                                        <p className="text-sm font-medium text-gray-900">로드맵이 아직 생성되지 않았습니다</p>
                                        <p className="text-xs text-muted-foreground mt-2 mb-4">
                                            "새 목표 생성" 버튼을 클릭하여 로드맵을 만들어보세요.
                                        </p>
                                        <Button variant="outline" asChild>
                                            <Link
                                                href={
                                                    (() => {
                                                        const params = new URLSearchParams()
                                                        const cid = selectedClientId || urlClientId
                                                        if (cid) params.set("clientId", cid)
                                                        if (counselorId) params.set("counselorId", counselorId)
                                                        const qs = params.toString()
                                                        return qs ? `/roadmap?${qs}` : "/roadmap"
                                                    })()
                                                }
                                            >
                                                로드맵 페이지로 이동 <ArrowRight className="ml-2 h-4 w-4" />
                                            </Link>
                                        </Button>
                                    </div>
                                )}
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
