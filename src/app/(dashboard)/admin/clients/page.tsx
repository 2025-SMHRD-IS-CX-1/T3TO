"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { cn, notifyNotificationCheck } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { Search, MoreHorizontal, FileText, Map, Crown, Plus, Loader2, User, Mail, GraduationCap, Briefcase, Calendar, LayoutDashboard } from "lucide-react"
import { createClientProfile, getClients, deleteClient, updateClientProfile } from "./actions"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"

export default function ClientsPage() {
    const [clients, setClients] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [selectedClient, setSelectedClient] = useState<any>(null)
    const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false)
    const [isEditing, setIsEditing] = useState(false)
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)
    const router = useRouter()
    const searchParams = useSearchParams()
    const clientId = searchParams.get('clientId')
    const counselorId = searchParams.get('counselorId')
    const shouldAdd = searchParams.get('add') === 'true'

    useEffect(() => {
        fetchClientsData()
    }, [counselorId])

    useEffect(() => {
        // URL 파라미터에 add=true가 있으면 다이얼로그 열기
        if (shouldAdd) {
            setIsAddDialogOpen(true)
            // URL에서 add 파라미터 제거
            const params = new URLSearchParams(searchParams.toString())
            params.delete('add')
            const newUrl = params.toString() ? `?${params.toString()}` : ''
            router.replace(`/admin/clients${newUrl}`)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shouldAdd])

    const fetchClientsData = async () => {
        setIsLoading(true)
        console.log('fetchClientsData: 내담자 목록 조회 시작', { counselorId })
        const data = await getClients(counselorId || undefined)
        console.log('fetchClientsData: 내담자 목록 조회 완료', { count: data.length, counselorId })
        setClients(data)
        setIsLoading(false)
    }

    // Filter clients based on search query
    const filteredClients = clients.filter(client =>
        client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        client.email.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const handleAddClient = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        
        // 관리자가 상담사를 선택하지 않았을 때 경고
        if (!isEditing && !counselorId) {
            alert("⚠️ 내담자를 추가하려면 먼저 왼쪽 사이드바에서 상담사를 선택해주세요.")
            return
        }
        
        setIsSubmitting(true)

        const form = e.currentTarget
        const formData = new FormData(form)

        let result;
        if (isEditing && selectedClient) {
            result = await updateClientProfile(selectedClient.id, formData, counselorId || undefined)
        } else {
            result = await createClientProfile(formData, counselorId || undefined)
        }

        if (result.success) {
            setIsAddDialogOpen(false)
            form?.reset()
            setSelectedClient(null)
            setIsEditing(false)
            notifyNotificationCheck()
            setTimeout(async () => {
                await fetchClientsData()
                router.refresh()
            }, 100)
        } else {
            alert((isEditing ? "프로필 수정에 실패했습니다: " : "내담자 추가에 실패했습니다: ") + result.error)
        }
        setIsSubmitting(false)
    }

    const handleOpenAddDialog = () => {
        setIsEditing(false)
        setSelectedClient(null)
        setIsAddDialogOpen(true)
    }

    const handleOpenEditDialog = (e: React.MouseEvent, client: any) => {
        e.stopPropagation()
        setIsEditing(true)
        setSelectedClient(client)
        setIsAddDialogOpen(true)
    }

    const queryWithContext = (clientIdParam: string) => {
        const p = new URLSearchParams()
        p.set('clientId', clientIdParam)
        if (counselorId) p.set('counselorId', counselorId)
        return p.toString()
    }

    const handleWriteConsultation = (e: React.MouseEvent, clientId: string) => {
        e.stopPropagation()
        router.push(`/consultations?${queryWithContext(clientId)}`)
    }

    const handleOpenDetail = (client: any) => {
        setSelectedClient(client)
        setIsDetailDialogOpen(true)
    }

    const goToDashboard = (e: React.MouseEvent, clientId: string) => {
        e.stopPropagation()
        router.push(`/dashboard?${queryWithContext(clientId)}`)
    }

    const handleOpenDeleteConfirm = (e: React.MouseEvent, id: string) => {
        e.stopPropagation()
        setDeleteConfirmId(id)
    }

    const handleConfirmDelete = async () => {
        if (!deleteConfirmId) return
        setIsDeleting(true)
        const result = await deleteClient(deleteConfirmId, counselorId || undefined)
        setIsDeleting(false)
        setDeleteConfirmId(null)
        if (result.success) {
            notifyNotificationCheck()
            await fetchClientsData()
            if (deleteConfirmId === clientId) {
                const params = new URLSearchParams(searchParams.toString())
                params.delete("clientId")
                router.push(params.toString() ? `/admin/clients?${params.toString()}` : "/admin/clients")
            }
        } else {
            alert("삭제에 실패했습니다: " + result.error)
        }
    }

    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">내담자 관리</h1>
                    <p className="text-muted-foreground">상담 중인 내담자의 진척도와 상태를 관리합니다.</p>
                </div>

                <div className="flex flex-nowrap items-center gap-2">
                    <div className="flex items-center gap-2 flex-shrink-0">
                    <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
                        setIsAddDialogOpen(open)
                        if (!open) {
                            setSelectedClient(null)
                            setIsEditing(false)
                        }
                    }}>
                    <Button onClick={handleOpenAddDialog}>
                        <Plus className="mr-2 h-4 w-4" /> 신규 내담자 등록
                    </Button>
                    <DialogContent className="sm:max-w-[600px]">
                        <DialogHeader>
                            <DialogTitle>{isEditing ? "내담자 프로필 수정" : "신규 내담자 등록"}</DialogTitle>
                            <DialogDescription>
                                {isEditing ? "내담자의 정보를 최신 상태로 업데이트합니다." : "새로운 내담자의 기본 정보를 입력하여 시스템에 등록합니다."}
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleAddClient} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name">이름 *</Label>
                                    <Input id="name" name="name" placeholder="홍길동" defaultValue={selectedClient?.name || ""} required />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="email">이메일 *</Label>
                                    <Input id="email" name="email" type="email" placeholder="hong@example.com" defaultValue={selectedClient?.email || ""} required />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="gender">성별</Label>
                                    <select id="gender" name="gender" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" defaultValue={selectedClient?.gender || ""}>
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
                                        defaultValue={selectedClient?.age_group && /^\d+$/.test(String(selectedClient.age_group)) ? selectedClient.age_group : ""}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="education_level">학력</Label>
                                    <select id="education_level" name="education_level" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" defaultValue={selectedClient?.education_level || ""}>
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
                                    <Input id="major" name="major" placeholder="컴퓨터공학" defaultValue={selectedClient?.major || ""} />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="work_experience">경력 사항 (경력 기술서 내용 등)</Label>
                                <Textarea
                                    id="work_experience"
                                    name="work_experience"
                                    placeholder="본인의 주요 경력 사항을 기술해주세요. (예: OO사 서비스 기획 3년, OO 프로젝트 리딩 등)"
                                    defaultValue={selectedClient?.work_experience || ""}
                                    className="h-24"
                                />
                            </div>

                            <div className="space-y-4 pt-2 border-t mt-4">
                                <h4 className="text-sm font-bold text-gray-900">추가 분석 정보</h4>
                                <div className="space-y-2">
                                    <Label htmlFor="career_orientation">진로 성향</Label>
                                    <Textarea id="career_orientation" name="career_orientation" placeholder="예: 안정적인 대기업 환경 선호, 대인 관계 중시" defaultValue={selectedClient?.career_orientation || ""} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="skill_vector">보유 기술 (스택)</Label>
                                    <Textarea id="skill_vector" name="skill_vector" placeholder="예: React, Node.js, Python, SQL" defaultValue={selectedClient?.skill_vector || ""} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="recommended_careers">희망 직무</Label>
                                    <Input id="recommended_careers" name="recommended_careers" placeholder="예: 프론트엔드 개발자, 데이터 엔지니어" defaultValue={selectedClient?.recommended_careers || ""} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="target_company">목표 기업</Label>
                                    <Input id="target_company" name="target_company" placeholder="예: 네이버, 토스, 구글 코리아" defaultValue={selectedClient?.target_company || ""} />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button type="submit" disabled={isSubmitting}>
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 저장 중...
                                        </>
                                    ) : (
                                        isEditing ? "수정하기" : "등록하기"
                                    )}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        className="shrink-0 bg-white text-red-600 border-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-700 disabled:opacity-60 disabled:cursor-not-allowed"
                        disabled={!clientId}
                        onClick={(e) => clientId && handleOpenDeleteConfirm(e, clientId)}
                    >
                        삭제
                    </Button>
                </div>

                {/* Detail Dialog */}
                <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2 text-2xl font-bold">
                                <div className="h-12 w-12 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center">
                                    {selectedClient?.name[0]}
                                </div>
                                {selectedClient?.name} 님의 상세 정보
                            </DialogTitle>
                        </DialogHeader>
                        {selectedClient && (
                            <div className="space-y-6 py-4">
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        <div className="flex items-start gap-3">
                                            <Mail className="h-5 w-5 text-gray-400 mt-0.5" />
                                            <div>
                                                <p className="text-xs text-gray-400">이메일</p>
                                                <p className="text-sm font-medium">{selectedClient.email}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-3">
                                            <User className="h-5 w-5 text-gray-400 mt-0.5" />
                                            <div>
                                                <p className="text-xs text-gray-400">성별 / 나이</p>
                                                <p className="text-sm font-medium">{selectedClient.gender || '미정'} / {selectedClient.age_group && /^\d+$/.test(String(selectedClient.age_group)) ? `${selectedClient.age_group}세` : (selectedClient.age_group || '미정')}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="flex items-start gap-3">
                                            <GraduationCap className="h-5 w-5 text-gray-400 mt-0.5" />
                                            <div>
                                                <p className="text-xs text-gray-400">학력 / 전공</p>
                                                <p className="text-sm font-medium">{selectedClient.education_level || '미정'} / {selectedClient.major || '미정'}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-3 col-span-2">
                                            <Briefcase className="h-5 w-5 text-gray-400 mt-0.5" />
                                            <div className="flex-1">
                                                <p className="text-xs text-gray-400">경력 사항 및 기술서</p>
                                                <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 mt-1 max-h-32 overflow-y-auto">
                                                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedClient.work_experience || '기재된 경력이 없습니다.'}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <Separator />

                                <div>
                                    <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                                        <Calendar className="h-4 w-4 text-purple-600" />
                                        분석 정보
                                    </h4>
                                    <div className="space-y-4">
                                        {selectedClient.career_orientation && (
                                            <div className="bg-gray-50 p-4 rounded-xl text-sm border border-gray-100">
                                                <p className="text-xs text-gray-400 mb-1">진로 성향</p>
                                                <p className="text-gray-700">{selectedClient.career_orientation}</p>
                                            </div>
                                        )}
                                        {selectedClient.skill_vector && (
                                            <div className="bg-blue-50 p-4 rounded-xl text-sm border border-blue-100">
                                                <p className="text-xs text-blue-400 mb-1">보유 기술</p>
                                                <p className="text-blue-700">{selectedClient.skill_vector}</p>
                                            </div>
                                        )}
                                        {(selectedClient.recommended_careers || selectedClient.target_company) && (
                                            <div className="bg-purple-50 p-4 rounded-xl text-sm border border-purple-100">
                                                <p className="text-xs text-purple-400 mb-1">희망 직무 / 목표 기업</p>
                                                <p className="text-purple-700 font-medium">{selectedClient.recommended_careers || '미정'} / {selectedClient.target_company || '미정'}</p>
                                            </div>
                                        )}
                                        {!selectedClient.career_orientation && !selectedClient.skill_vector && (
                                            <div className="bg-gray-50 p-4 rounded-xl text-sm text-gray-600 leading-relaxed border border-gray-100">
                                                데이터가 부족합니다. 상담을 통해 정보를 추가해주세요.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsDetailDialogOpen(false)}>닫기</Button>
                            <Button
                                className="bg-purple-600 hover:bg-purple-700"
                                onClick={(e) => {
                                    if (selectedClient) {
                                        handleWriteConsultation(e, selectedClient.id)
                                        setIsDetailDialogOpen(false)
                                    }
                                }}
                            >
                                상담 일지 작성하기
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* 내담자 삭제 확인 다이얼로그 */}
                <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
                    <DialogContent className="sm:max-w-[400px]">
                        <DialogHeader>
                            <DialogTitle>내담자 삭제</DialogTitle>
                            <DialogDescription className="pt-1">
                                정말로 이 내담자를 삭제하시겠습니까? 이 작업은 되돌릴 수 없으며, 해당 내담자의 모든 데이터가 삭제됩니다.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter className="gap-2 sm:gap-0 pt-4">
                            <Button variant="outline" onClick={() => setDeleteConfirmId(null)} disabled={isDeleting}>
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
            </div>

            <div className="flex items-center gap-2">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                    <Input
                        placeholder="이름 또는 이메일 검색..."
                        className="pl-9"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <Button variant="outline">필터</Button>
            </div>

            {!counselorId && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                    <div className="flex items-start gap-2">
                        <span className="text-lg">⚠️</span>
                        <div>
                            <p className="font-semibold mb-1">상담사를 선택해주세요</p>
                            <p className="text-xs">왼쪽 사이드바에서 상담사를 선택하면 해당 상담사의 내담자 목록이 표시됩니다.</p>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid gap-4">
                {isLoading ? (
                    <div className="flex justify-center py-10">
                        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
                    </div>
                ) : filteredClients.length === 0 ? (
                    <div className="text-center py-10 text-gray-500">
                        {!counselorId ? (
                            <div>
                                <p className="text-lg mb-2">상담사를 선택해주세요</p>
                                <p className="text-sm">왼쪽 사이드바에서 상담사를 선택하면 내담자 목록이 표시됩니다.</p>
                            </div>
                        ) : clients.length === 0 ? (
                            "등록된 내담자가 없습니다."
                        ) : (
                            "검색 결과가 없습니다."
                        )}
                    </div>
                ) : (
                    filteredClients.map((client) => (
                        <Card
                            key={client.id}
                            className={cn(
                                "flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4 cursor-pointer transition-all group border-2",
                                clientId === client.id
                                    ? "border-purple-600 bg-purple-50/50 shadow-md"
                                    : "hover:border-purple-300 border-white hover:bg-purple-50/30"
                            )}
                            onClick={() => router.push(`/admin/clients?${queryWithContext(client.id)}`)}
                        >
                            <div className="flex items-center gap-4">
                                <div className="h-10 w-10 rounded-full bg-purple-100 text-purple-700 font-bold flex items-center justify-center">
                                    {client.name[0]}
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                                        {client.name}
                                        {client.plan === 'Premium' && <Crown className="h-3 w-3 text-yellow-500" />}
                                        {client.hasRoadmap && (
                                            <Badge variant="outline" className="text-xs border-blue-300 text-blue-700 bg-blue-50 flex items-center gap-1">
                                                <Map className="h-3 w-3" />
                                                로드맵
                                            </Badge>
                                        )}
                                    </h3>
                                    <p className="text-sm text-gray-500">{client.email}</p>
                                    {client.roadmap && (
                                        <p className="text-xs text-gray-600 mt-1">
                                            목표: {client.roadmap.target_job || '미정'}
                                            {client.roadmap.target_company && ` @ ${client.roadmap.target_company}`}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center gap-6 flex-1 sm:justify-end">
                                <div className="text-center sm:text-right">
                                    <p className="text-xs text-gray-500">진행률</p>
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-gray-900">{client.progress}</span>
                                        <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                                            <div className="h-full bg-purple-500" style={{ width: client.progress }} />
                                        </div>
                                    </div>
                                </div>

                                <div className="text-center sm:text-right min-w-[80px]">
                                    {client.status === 'active' ? (
                                        <Badge variant="success" className="bg-green-100 text-green-700 hover:bg-green-200">활동 중</Badge>
                                    ) : (
                                        <Badge variant="secondary">휴면</Badge>
                                    )}
                                </div>

                                <div className="flex gap-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-xs font-semibold px-4 border-purple-200 text-purple-700 hover:bg-purple-50"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            handleOpenDetail(client)
                                        }}
                                    >
                                        프로필 확인
                                    </Button>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                            <Button size="sm" variant="ghost">
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                            <DropdownMenuItem onClick={(e) => handleWriteConsultation(e, client.id)}>상담 일지 작성</DropdownMenuItem>
                                            <DropdownMenuItem onClick={(e) => handleOpenEditDialog(e, client)}>프로필 수정</DropdownMenuItem>
                                            <DropdownMenuItem
                                                className="text-red-600"
                                                onClick={(e) => handleOpenDeleteConfirm(e, client.id)}
                                            >
                                                삭제
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>
                        </Card>
                    ))
                )}
            </div>
        </div>
    )
}
