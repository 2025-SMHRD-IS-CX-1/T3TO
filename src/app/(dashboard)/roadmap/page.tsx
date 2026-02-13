"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import type { RoadmapStep } from "@/components/roadmap/timeline"
import { RoadmapGantt } from "@/components/roadmap/roadmap-gantt"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Download, Loader2, Sparkles, User, RefreshCw, Printer } from "lucide-react"
import { getRoadmap, createInitialRoadmap, getClientProfile } from "./actions"
import { Badge } from "@/components/ui/badge"
import { cn, notifyNotificationCheck } from "@/lib/utils"
import { motion } from "motion/react"
import { useAdminContext } from "@/components/layout/shell"

export default function RoadmapPage() {
    const searchParams = useSearchParams()
    const adminContext = useAdminContext()
    const clientId = searchParams.get('clientId')
    const counselorId = searchParams.get('counselorId')
    const isAdmin = adminContext?.role === 'admin'

    const [steps, setSteps] = useState<RoadmapStep[]>([])
    const [skills, setSkills] = useState<any[]>([])
    const [certs, setCerts] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [hasRoadmap, setHasRoadmap] = useState(false)
    const [clientData, setClientData] = useState<any>(null)
    const [roadmapViewMonth] = useState<Date>(() => new Date())

    useEffect(() => {
        const fetchData = async () => {
            if (clientId) {
                const profile = await getClientProfile(clientId, counselorId || undefined)
                setClientData(profile)
            }
            const data = await getRoadmap(clientId || undefined, counselorId || undefined)
            if (data && data.milestones) {
                try {
                    setSteps(JSON.parse(data.milestones))
                    if (data.required_skills) setSkills(JSON.parse(data.required_skills))
                    if (data.certifications) setCerts(JSON.parse(data.certifications))
                    setHasRoadmap(true)
                } catch (e) {
                    console.error("Failed to parse roadmap data", e)
                }
            } else {
                setHasRoadmap(false)
            }
            setIsLoading(false)
        }
        fetchData()
    }, [clientId, counselorId])

    const handleGenerateRoadmap = async () => {
        setIsLoading(true)
        const result = await createInitialRoadmap(clientId || undefined, clientData, counselorId || undefined)
        if (result.success) {
            notifyNotificationCheck()
            const data = await getRoadmap(clientId || undefined, counselorId || undefined)
            if (data && data.milestones) {
                setSteps(JSON.parse(data.milestones))
                if (data.required_skills) setSkills(JSON.parse(data.required_skills))
                if (data.certifications) setCerts(JSON.parse(data.certifications))
                setHasRoadmap(true)
            }
        }
        setIsLoading(false)
    }

    const handlePrint = () => {
        window.print()
    }

    const handleDownload = () => {
        // Create a text representation of the roadmap
        const roadmapText = steps.map((step, index) => {
            return `${index + 1}. ${step.title}\n   ${step.description}\n   상태: ${step.status}\n   ${step.date ? `날짜: ${step.date}` : ''}\n`
        }).join('\n')

        const fullText = `커리어 로드맵\n${'='.repeat(50)}\n\n${roadmapText}`

        // Create blob and download
        const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `roadmap_${new Date().toISOString().split('T')[0]}.txt`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    if (isLoading) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
            </div>
        )
    }

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            {/* 관리자가 상담사를 선택하지 않았을 때 안내 */}
            {isAdmin && !counselorId && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                    <div className="flex items-start gap-2">
                        <span className="text-lg">⚠️</span>
                        <div>
                            <p className="font-semibold mb-1">상담사를 선택해주세요</p>
                            <p className="text-xs">왼쪽 사이드바에서 상담사를 선택하면 해당 상담사의 로드맵을 확인할 수 있습니다.</p>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Client Info Card */}
            {clientData && (
                <Card className="bg-purple-50 border-purple-200">
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <User className="h-4 w-4" />
                            {clientData.client_name}님 정보
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                                <p className="text-muted-foreground">이름</p>
                                <p className="font-medium">{clientData.client_name}</p>
                                {clientData.major && (
                                    <div className="mt-4">
                                        <p className="text-muted-foreground">전공</p>
                                        <p className="font-medium">{clientData.major}</p>
                                    </div>
                                )}
                            </div>
                            <div>
                                {clientData.age_group && (
                                    <>
                                        <p className="text-muted-foreground">연령대</p>
                                        <p className="font-medium">{clientData.age_group}</p>
                                    </>
                                )}
                                <div className="mt-4">
                                    <p className="text-muted-foreground">이메일</p>
                                    <p className="font-medium">{clientData.client_email}</p>
                                </div>
                            </div>
                            <div>
                                {clientData.education_level && (
                                    <>
                                        <p className="text-muted-foreground">학력</p>
                                        <p className="font-medium">{clientData.education_level}</p>
                                    </>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="flex flex-row items-center justify-between gap-4">
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 whitespace-nowrap">
                    {clientData ? `${clientData.client_name}님의 커리어 로드맵` : "나의 커리어 로드맵"}
                </h1>
                {hasRoadmap && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2.5 text-xs gap-1"
                            onClick={handleGenerateRoadmap}
                            title="최신 상담 및 프로필 데이터로 로드맵 갱신"
                            disabled={isLoading}
                        >
                            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
                            AI 갱신
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs gap-1" onClick={handlePrint}>
                            <Printer className="h-3.5 w-3.5" />
                            출력
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs gap-1" onClick={handleDownload}>
                            <Download className="h-3.5 w-3.5" />
                            저장
                        </Button>
                    </div>
                )}
            </div>

            {hasRoadmap ? (
                <div className="space-y-12">
                    {/* 커리어 로드맵 - 가로 타임라인(분기) + 카테고리 그리드 */}
                    <Card className="overflow-hidden border-2 border-gray-200 shadow-lg">
                        <CardContent className="p-0">
                            <RoadmapGantt steps={steps} year={roadmapViewMonth.getFullYear()} />
                        </CardContent>
                    </Card>

                    {/* 구간별 상세 카드 (단기·중기·장기) */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-6">
                        {[
                            { term: "단기", range: "1~3개월", color: "bg-blue-50 border-blue-200 text-blue-800", stepColor: "bg-blue-100/50 border-blue-100", steps: steps.slice(0, 1) },
                            { term: "중기", range: "3~12개월", color: "bg-purple-50 border-purple-200 text-purple-800", stepColor: "bg-purple-100/50 border-purple-100", steps: steps.slice(1, 2) },
                            { term: "장기", range: "1년 이상", color: "bg-amber-50 border-amber-200 text-amber-800", stepColor: "bg-amber-100/50 border-amber-100", steps: steps.slice(2) }
                        ].map((milestone, idx) => (
                            <div key={idx} className={cn("rounded-xl border-2 p-4 flex flex-col", milestone.color)}>
                                <div className="font-bold text-sm mb-1">{milestone.term}</div>
                                <div className="text-xs opacity-90 mb-3">{milestone.range}</div>
                                <div className="space-y-3 flex-1 overflow-y-auto min-h-0">
                                    {milestone.steps.length === 0 ? (
                                        <p className="text-xs text-gray-500">해당 구간 목표 없음</p>
                                    ) : (
                                        milestone.steps.map((step, stepIdx) => (
                                            <div key={step.id} className={cn("rounded-lg border p-3 text-left", milestone.stepColor)}>
                                                <div className="flex items-start justify-between gap-2 mb-1">
                                                    <span className="text-[10px] font-semibold text-gray-500 uppercase">
                                                        {step.date || `단계 ${stepIdx + 1}`}
                                                    </span>
                                                    <Badge variant={step.status === 'completed' ? 'success' : step.status === 'in-progress' ? 'purple' : 'secondary'} className="text-[10px] shrink-0">
                                                        {step.status === 'completed' ? '완료' : step.status === 'in-progress' ? '진행중' : '대기'}
                                                    </Badge>
                                                </div>
                                                <h4 className="font-bold text-gray-900 text-sm mb-1">{step.title}</h4>
                                                <p className="text-xs text-gray-600 line-clamp-3">{step.description}</p>
                                                {step.actionItems && step.actionItems.length > 0 && (
                                                    <ul className="mt-2 pt-2 border-t border-gray-200/60 space-y-1">
                                                        {step.actionItems.slice(0, 3).map((item, i) => (
                                                            <li key={i} className="text-[11px] text-gray-700 flex gap-1.5">
                                                                <span className="text-purple-500 shrink-0">•</span>
                                                                <span dangerouslySetInnerHTML={{ __html: item.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Detailed Analysis Sections */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Competencies */}
                        <Card className="shadow-md border-gray-200">
                            <CardHeader className="bg-gray-50/50 border-b">
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Sparkles className="h-5 w-5 text-purple-600" />
                                    핵심 직무 역량 (Competencies)
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-6">
                                <ul className="space-y-4">
                                    {(skills.length > 0 ? skills : [
                                        { title: "데이터 파악 중", desc: "내담자 분석을 통해 역량을 도출하고 있습니다.", level: 50 }
                                    ]).map((item, i) => (
                                        <li key={i} className="space-y-2">
                                            <div className="flex justify-between items-center">
                                                <span className="font-semibold text-gray-800 tracking-tight">{item.title}</span>
                                                <span className="text-xs font-bold text-purple-600">{item.level}%</span>
                                            </div>
                                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${item.level}%` }}
                                                    transition={{ duration: 1, delay: i * 0.1 }}
                                                    className="h-full bg-gradient-to-r from-purple-500 to-indigo-600"
                                                />
                                            </div>
                                            <p className="text-xs text-muted-foreground">{item.desc}</p>
                                        </li>
                                    ))}
                                </ul>
                            </CardContent>
                        </Card>

                        {/* Certificates & Qualifications */}
                        <Card className="shadow-md border-gray-200">
                            <CardHeader className="bg-gray-50/50 border-b">
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Download className="h-5 w-5 text-blue-600" />
                                    추천 자격증 및 교육
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-6">
                                <div className="space-y-4">
                                    {(certs.length > 0 ? certs : [
                                        { type: "알림", name: "추천 항목을 생성 중입니다.", status: "-", color: "text-gray-600 bg-gray-50" }
                                    ]).map((cert, i) => (
                                        <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 bg-gray-50/30">
                                            <div className="flex items-center gap-3">
                                                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-md border", cert.color)}>
                                                    {cert.type}
                                                </span>
                                                <span className="text-sm font-medium text-gray-800">{cert.name}</span>
                                            </div>
                                            <span className="text-xs text-gray-500 font-medium">{cert.status}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-100">
                                    <p className="text-xs text-blue-800 leading-relaxed font-medium">
                                        💡 <strong>Tip:</strong> {certs.some(c => c.name === '정보처리기사')
                                            ? "전공 지식을 증명할 수 있는 정보처리기사를 최우선으로 취득하시는 것을 추천드립니다."
                                            : "목표 직무에 필요한 핵심 도구 활용 능력을 우선적으로 확보하는 것이 중요합니다."}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-dashed shadow-sm text-center">
                    <div className="rounded-full bg-purple-100 p-4 mb-4">
                        <Sparkles className="h-8 w-8 text-purple-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">아직 로드맵이 없습니다</h3>
                    <p className="text-gray-500 max-w-md mb-6">
                        AI 분석을 통해 {clientData ? `${clientData.client_name} 님` : "나"}에게 딱 맞는 맞춤형 커리어 로드맵을 생성해보세요.
                    </p>
                    <Button onClick={handleGenerateRoadmap}>
                        로드맵 생성하기
                    </Button>
                </div>
            )}
        </div>
    )
}
