"use client"

import React, { useState, useEffect, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import type { RoadmapStep } from "@/components/roadmap/timeline"
import { RoadmapGantt } from "@/components/roadmap/roadmap-gantt"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Download, Loader2, Sparkles, User, RefreshCw, Printer, Info } from "lucide-react"
import { getRoadmap, createInitialRoadmap, getClientProfile } from "./actions"
import { Badge } from "@/components/ui/badge"
import { cn, notifyNotificationCheck } from "@/lib/utils"
import { motion } from "motion/react"
import { useAdminContext } from "@/components/layout/shell"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"

export default function RoadmapPageClient() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const adminContext = useAdminContext()
    const clientId = searchParams.get('clientId')
    const counselorId = searchParams.get('counselorId')
    const isAdmin = adminContext?.role === 'admin'

    const [steps, setSteps] = useState<RoadmapStep[]>([])
    const [skills, setSkills] = useState<any[]>([])
    const [certs, setCerts] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isGenerating, setIsGenerating] = useState(false)
    const [generationStatus, setGenerationStatus] = useState<string>('')
    const [hasRoadmap, setHasRoadmap] = useState(false)
    const [clientData, setClientData] = useState<any>(null)
    const [roadmapViewMonth] = useState<Date>(() => new Date())
    const [selectedCert, setSelectedCert] = useState<any>(null)
    const [isCertDialogOpen, setIsCertDialogOpen] = useState(false)
    const [selectedStep, setSelectedStep] = useState<RoadmapStep | null>(null)
    const [isStepDialogOpen, setIsStepDialogOpen] = useState(false)

    // AI 자기소개서 관련 상태
    const [isGeneratingResume, setIsGeneratingResume] = useState(false)
    const [generatedResumes, setGeneratedResumes] = useState<{ title: string; draft: string; reasoning: string; scoring?: any }[]>([])
    const [activeResumeTab, setActiveResumeTab] = useState(0)
    const [isResumeDialogOpen, setIsResumeDialogOpen] = useState(false)

    useEffect(() => {
        const fetchData = async () => {
            if (!clientId) {
                setSteps([])
                setSkills([])
                setCerts([])
                setHasRoadmap(false)
                setClientData(null)
                setIsLoading(false)
                return
            }
            const profile = await getClientProfile(clientId, counselorId || undefined)
            setClientData(profile)
            const data = await getRoadmap(clientId, counselorId || undefined)
            if (data && data.milestones) {
                try {
                    setSteps(JSON.parse(data.milestones))
                    setSkills(data.required_skills ? JSON.parse(data.required_skills) : [])
                    setCerts(data.certifications != null && data.certifications !== ''
                        ? JSON.parse(data.certifications)
                        : [])
                    setHasRoadmap(true)
                } catch (e) {
                    console.error("Failed to parse roadmap data", e)
                    setSteps([])
                    setSkills([])
                    setCerts([])
                    setHasRoadmap(false)
                }
            } else {
                setSteps([])
                setSkills([])
                setCerts([])
                setHasRoadmap(false)
            }
            setIsLoading(false)
        }
        fetchData()
    }, [clientId, counselorId])

    // 로드맵 저장 후 공통 처리 로직
    const handleRoadmapSaveSuccess = async (successMessage: string) => {
        setGenerationStatus('로드맵 저장 중...')
        notifyNotificationCheck()

        const data = await getRoadmap(clientId || undefined, counselorId || undefined)
        if (data?.milestones) {
            setSteps(JSON.parse(data.milestones))
            if (data.required_skills) setSkills(JSON.parse(data.required_skills))
            if (data.certifications != null && data.certifications !== '') {
                try {
                    setCerts(JSON.parse(data.certifications))
                } catch {
                    setCerts([])
                }
            } else {
                setCerts([])
            }
            setHasRoadmap(true)
        }

        router.refresh()
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('roadmap-updated', { detail: { clientId } }))
        }

        setGenerationStatus(successMessage)
        setTimeout(() => setGenerationStatus(''), 1000)
    }

    const handleGenerateRoadmap = async () => {
        setIsGenerating(true)
        setGenerationStatus('로드맵 생성 중...')

        try {
            const result = await createInitialRoadmap(clientId || undefined, clientData, counselorId || undefined, false)
            if (result.success) {
                await handleRoadmapSaveSuccess('완료!')
            } else {
                setGenerationStatus(result.error || '생성 실패')
                setTimeout(() => setGenerationStatus(''), 2000)
            }
        } catch (error) {
            console.error('로드맵 생성 에러:', error)
            setGenerationStatus('에러 발생')
            setTimeout(() => setGenerationStatus(''), 2000)
        } finally {
            setIsGenerating(false)
        }
    }

    const handleRefreshRoadmap = async () => {
        setIsGenerating(true)
        setGenerationStatus('로드맵 갱신 중...')

        try {
            const result = await createInitialRoadmap(clientId || undefined, clientData, counselorId || undefined, true)
            if (result.success) {
                await handleRoadmapSaveSuccess('갱신 완료!')
            } else {
                setGenerationStatus(result.error || '갱신 실패')
                setTimeout(() => setGenerationStatus(''), 3000)
            }
        } catch (error) {
            console.error('로드맵 갱신 에러:', error)
            setGenerationStatus('에러 발생')
            setTimeout(() => setGenerationStatus(''), 2000)
        } finally {
            setIsGenerating(false)
        }
    }

    const handlePrint = () => {
        window.print()
    }

    const roadmapCaptureRef = useRef<HTMLDivElement>(null)

    const handleDownload = async () => {
        const el = roadmapCaptureRef.current
        if (!el) return
        try {
            const { toPng } = await import("html-to-image")
            const dataUrl = await toPng(el, {
                pixelRatio: 2,
                backgroundColor: "#ffffff",
                cacheBust: true,
            })
            const filename = `roadmap_${(clientData?.client_name || "career").replace(/[/\\:*?"<>|]/g, "_")}_${new Date().toISOString().split("T")[0]}.png`
            const link = document.createElement("a")
            link.download = filename
            link.href = dataUrl
            link.click()
        } catch (e) {
            console.error("로드맵 이미지 저장 실패:", e)
            alert("이미지 저장에 실패했습니다.")
        }
    }

    const handleGenerateResume = async () => {
        if (!clientId || !clientData) return

        setIsGeneratingResume(true)
        try {
            const roadmapData = await getRoadmap(clientId, counselorId || undefined)
            const baseUrl = 'http://localhost:8000'
            const payload = (focus: string) => ({
                counseling: { content: clientData.counseling_content || "" },
                ai_analysis: {
                    roles: roadmapData?.recommended_roles ? JSON.parse(roadmapData.recommended_roles) : [],
                    competencies: roadmapData?.required_skills ? JSON.parse(roadmapData.required_skills).map((s: any) => s.title) : [],
                    extracted_background: {
                        name: clientData.client_name,
                        education: clientData.education_level,
                        experiences: clientData.major ? [clientData.major] : [],
                        strengths: [],
                        career_values: ""
                    }
                },
                language: "ko",
                focus,
                min_word_count: 1000
            })

            const [res1, res2, res3] = await Promise.all([
                fetch(`${baseUrl}/api/self-intro/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload('strength')),
                }),
                fetch(`${baseUrl}/api/self-intro/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload('experience')),
                }),
                fetch(`${baseUrl}/api/self-intro/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload('values')),
                })
            ])

            if (res1.ok && res2.ok && res3.ok) {
                const [d1, d2, d3] = await Promise.all([res1.json(), res2.json(), res3.json()])
                setGeneratedResumes([
                    { title: "역량 중심", draft: d1.draft, reasoning: d1.reasoning, scoring: d1.scoring },
                    { title: "경험 중심", draft: d2.draft, reasoning: d2.reasoning, scoring: d2.scoring },
                    { title: "가치관 중심", draft: d3.draft, reasoning: d3.reasoning, scoring: d3.scoring },
                ])
                setIsResumeDialogOpen(true)
            } else {
                alert("자기소개서 생성에 실패했습니다.")
            }
        } catch (error) {
            console.error("AI Resume Generation Error:", error)
            alert("서버 연결에 실패했습니다. (포트 8000 확인 필요)")
        } finally {
            setIsGeneratingResume(false)
        }
    }

    if (isLoading) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
            </div>
        )
    }

    return (
        <main className="min-h-screen max-w-4xl mx-auto space-y-8">
            {isGenerating && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <Card className="w-full max-w-md mx-4 shadow-2xl">
                        <CardContent className="pt-6 pb-8 px-6">
                            <div className="flex flex-col items-center gap-4">
                                <Loader2 className="h-12 w-12 animate-spin text-purple-600" />
                                <div className="text-center">
                                    <h3 className="text-lg font-semibold text-gray-900 mb-2">로드맵 생성 중</h3>
                                    <p className="text-sm text-gray-600">{generationStatus || 'AI가 맞춤형 로드맵을 생성하고 있습니다...'}</p>
                                    <p className="text-xs text-gray-500 mt-2">잠시만 기다려주세요 (약 10-30초 소요)</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
            <article className="max-w-4xl mx-auto space-y-8">
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
                {counselorId && !clientId && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                        <div className="flex items-start gap-2">
                            <span className="text-lg">⚠️</span>
                            <div>
                                <p className="font-semibold mb-1">내담자를 선택해주세요</p>
                                <p className="text-xs">대시보드 또는 내담자 관리에서 내담자를 선택하면 해당 내담자의 맞춤형 로드맵을 확인할 수 있습니다.</p>
                            </div>
                        </div>
                    </div>
                )}
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
                                            <p className="text-muted-foreground">나이</p>
                                            <p className="font-medium">{/^\d+$/.test(String(clientData.age_group)) ? `${clientData.age_group}세` : clientData.age_group}</p>
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
                <div ref={roadmapCaptureRef} className="roadmap-print-area">
                    <div className="flex flex-row items-center justify-between gap-4 print:flex-col print:items-start">
                        <h1 className="text-3xl font-bold tracking-tight text-gray-900 whitespace-nowrap">
                            {clientData ? `${clientData.client_name}님의 커리어 로드맵` : "나의 커리어 로드맵"}
                        </h1>
                        {hasRoadmap && (
                            <div className="flex items-center gap-2 flex-shrink-0">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 px-2.5 text-xs gap-1"
                                    onClick={handleRefreshRoadmap}
                                    title="최신 상담 및 프로필 데이터로 로드맵 갱신"
                                    disabled={isLoading || isGenerating}
                                >
                                    <RefreshCw className={cn("h-3.5 w-3.5", (isLoading || isGenerating) && "animate-spin")} />
                                    갱신
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 px-2.5 text-xs gap-1 border-purple-200 hover:bg-purple-50 hover:text-purple-700"
                                    onClick={handleGenerateResume}
                                    disabled={isGeneratingResume || !hasRoadmap}
                                >
                                    {isGeneratingResume ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Sparkles className="h-3.5 w-3.5 text-purple-600" />
                                    )}
                                    AI 자소서
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
                </div>
                {hasRoadmap ? (
                    <div className="space-y-12">
                        <Card className="overflow-hidden border-2 border-gray-200 shadow-lg">
                            <CardContent className="p-0">
                                <RoadmapGantt steps={steps} year={roadmapViewMonth.getFullYear()} />
                            </CardContent>
                        </Card>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-6 print:grid-cols-1">
                            {[
                                { term: "단기", range: "1~3개월", color: "bg-blue-50 border-blue-200 text-blue-800", stepColor: "bg-blue-100/50 border-blue-100", steps: steps.slice(0, 1) },
                                { term: "중기", range: "3~12개월", color: "bg-purple-50 border-purple-200 text-purple-800", stepColor: "bg-purple-100/50 border-purple-100", steps: steps.slice(1, 2) },
                                { term: "장기", range: "1년 이상", color: "bg-amber-50 border-amber-200 text-amber-800", stepColor: "bg-amber-100/50 border-amber-100", steps: steps.slice(2) }
                            ].map((milestone, idx) => (
                                <div key={idx} className={cn("rounded-xl border-2 p-4 flex flex-col print-break-avoid", milestone.color)}>
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
                                                    <div className="relative">
                                                        <p
                                                            className={cn(
                                                                "text-xs text-gray-600 break-words roadmap-step-desc",
                                                                step.description && step.description.length > 100 ? "line-clamp-2 cursor-pointer" : ""
                                                            )}
                                                            onClick={() => {
                                                                if (step.description && step.description.length > 100) {
                                                                    setSelectedStep(step)
                                                                    setIsStepDialogOpen(true)
                                                                }
                                                            }}
                                                            onMouseEnter={(e) => {
                                                                if (step.description && step.description.length > 100) {
                                                                    e.currentTarget.classList.add('underline', 'text-purple-600')
                                                                }
                                                            }}
                                                            onMouseLeave={(e) => {
                                                                if (step.description && step.description.length > 100) {
                                                                    e.currentTarget.classList.remove('underline', 'text-purple-600')
                                                                }
                                                            }}
                                                        >
                                                            {step.description || '단계별 목표를 진행합니다.'}
                                                        </p>
                                                        {step.description && step.description.length > 100 && (
                                                            <button
                                                                className="text-[10px] text-purple-600 mt-1 hover:text-purple-700"
                                                                onClick={() => {
                                                                    setSelectedStep(step)
                                                                    setIsStepDialogOpen(true)
                                                                }}
                                                            >
                                                                더보기...
                                                            </button>
                                                        )}
                                                    </div>
                                                    {step.actionItems && step.actionItems.length > 0 && (
                                                        <ul className="mt-2 pt-2 border-t border-gray-200/60 space-y-1">
                                                            {step.actionItems.slice(0, 3).map((item, i) => (
                                                                <li key={i} className="text-[11px] text-gray-700 flex gap-1.5">
                                                                    <span className="text-purple-500 shrink-0">•</span>
                                                                    <span dangerouslySetInnerHTML={{ __html: item.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                                                                </li>
                                                            ))}
                                                            {step.actionItems.length > 3 && (
                                                                <li className="text-[10px] text-purple-600 cursor-pointer hover:text-purple-700"
                                                                    onClick={() => {
                                                                        setSelectedStep(step)
                                                                        setIsStepDialogOpen(true)
                                                                    }}
                                                                >
                                                                    + {step.actionItems.length - 3}개 더 보기
                                                                </li>
                                                            )}
                                                        </ul>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 print-grid-single">
                            <Card className="shadow-md border-gray-200 print-break-avoid">
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
                                            <li key={i} className="space-y-2 print-break-avoid">
                                                <div className="flex justify-between items-center gap-2 min-w-0">
                                                    <span className="font-semibold text-gray-800 tracking-tight print-text-wrap">{item.title}</span>
                                                    <span className="text-xs font-bold text-purple-600 shrink-0">{item.level}%</span>
                                                </div>
                                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden relative">
                                                    <motion.div
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${item.level}%` }}
                                                        transition={{ duration: 1, delay: i * 0.1 }}
                                                        className="h-full bg-gradient-to-r from-purple-500 to-indigo-600 print:hidden"
                                                    />
                                                    <div
                                                        className="hidden print:!block absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-600"
                                                        style={{ width: `${item.level}%` }}
                                                        aria-hidden
                                                    />
                                                </div>
                                                <p className="text-xs text-muted-foreground print-text-wrap break-words">{item.desc}</p>
                                            </li>
                                        ))}
                                    </ul>
                                </CardContent>
                            </Card>
                            <Card className="shadow-md border-gray-200 print-break-avoid">
                                <CardHeader className="bg-gray-50/50 border-b">
                                    <CardTitle className="text-lg flex items-center gap-2">
                                        <Download className="h-5 w-5 text-blue-600" />
                                        추천 자격증 및 교육
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="pt-6">
                                    {certs.length === 0 ? (
                                        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 space-y-3">
                                            <p className="text-sm text-amber-800">
                                                로드맵 생성 시 자격증 추천이 함께 산출됩니다. 로드맵을 생성하거나 갱신해 주세요.
                                            </p>
                                            <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/50 p-3 space-y-1.5">
                                                <p className="text-xs text-blue-800 leading-relaxed">
                                                    <span className="font-semibold">💡 안내:</span> 더 많은 자격증 정보는 <a
                                                        href="https://www.q-net.or.kr"
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="font-semibold underline hover:text-blue-900"
                                                    >Q-Net(한국산업인력공단)</a>에서 확인하실 수 있습니다.
                                                </p>
                                                <p className="text-xs text-blue-800 leading-relaxed">
                                                    연간 시험일정(기사·산업기사·기능사 등):{' '}
                                                    <a
                                                        href="https://www.q-net.or.kr/crf021.do?id=crf02101&scheType=03"
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="font-semibold underline hover:text-blue-900"
                                                    >연간 국가기술자격 시험일정</a>
                                                </p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {certs.map((cert, i) => (
                                                <div
                                                    key={i}
                                                    className={cn(
                                                        "flex items-center justify-between p-3 rounded-lg border border-gray-100 bg-gray-50/30 transition-all",
                                                        cert.type === '자격증' && cert.details ? "cursor-pointer hover:bg-gray-100 hover:shadow-md" : ""
                                                    )}
                                                    onClick={() => {
                                                        if (cert.type === '자격증' && cert.details) {
                                                            setSelectedCert(cert)
                                                            setIsCertDialogOpen(true)
                                                        }
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        if (cert.type === '자격증' && cert.details) {
                                                            e.currentTarget.classList.add('ring-2', 'ring-purple-200')
                                                        }
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        if (cert.type === '자격증' && cert.details) {
                                                            e.currentTarget.classList.remove('ring-2', 'ring-purple-200')
                                                        }
                                                    }}
                                                >
                                                    <div className="flex items-center gap-3 flex-1">
                                                        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0", cert.color)}>
                                                            {cert.type}
                                                        </span>
                                                        <span className="text-sm font-medium text-gray-800">{cert.name}</span>
                                                        {cert.type === '자격증' && cert.details && (
                                                            <Info className="h-4 w-4 text-gray-400 shrink-0" />
                                                        )}
                                                    </div>
                                                    <span className="text-xs text-gray-500 font-medium shrink-0">{cert.status}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <Dialog open={isCertDialogOpen} onOpenChange={setIsCertDialogOpen}>
                                        <DialogContent className="max-w-md">
                                            <DialogHeader>
                                                <DialogTitle className="text-xl">{selectedCert?.name}</DialogTitle>
                                                <DialogDescription>
                                                    {selectedCert?.details?.description || '자격증 상세 정보'}
                                                </DialogDescription>
                                            </DialogHeader>
                                            {selectedCert?.details && (
                                                <div className="space-y-3 mt-4">
                                                    {selectedCert.details.written && (
                                                        <div className="flex items-start gap-2">
                                                            <span className="font-semibold text-sm text-gray-700 min-w-[60px]">필기:</span>
                                                            <span className="text-sm text-gray-600">{selectedCert.details.written}</span>
                                                        </div>
                                                    )}
                                                    {selectedCert.details.practical && (
                                                        <div className="flex items-start gap-2">
                                                            <span className="font-semibold text-sm text-gray-700 min-w-[60px]">실기:</span>
                                                            <span className="text-sm text-gray-600">{selectedCert.details.practical}</span>
                                                        </div>
                                                    )}
                                                    {selectedCert.details.difficulty && (
                                                        <div className="flex items-start gap-2">
                                                            <span className="font-semibold text-sm text-gray-700 min-w-[60px]">난이도:</span>
                                                            <span className="text-sm text-gray-600">{selectedCert.details.difficulty}</span>
                                                        </div>
                                                    )}
                                                    {selectedCert?.type === '자격증' && (
                                                        <div className="flex items-start gap-2">
                                                            <a
                                                                href="https://www.q-net.or.kr/crf021.do?id=crf02101&scheType=03"
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-sm font-medium text-amber-700 underline hover:text-amber-900"
                                                            >
                                                                시험일정 확인
                                                            </a>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </DialogContent>
                                    </Dialog>
                                    <Dialog open={isStepDialogOpen} onOpenChange={setIsStepDialogOpen}>
                                        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                                            <DialogHeader>
                                                <DialogTitle className="text-xl">{selectedStep?.title}</DialogTitle>
                                                <DialogDescription className="text-base mt-2">
                                                    {selectedStep?.description || '단계별 상세 정보'}
                                                </DialogDescription>
                                            </DialogHeader>
                                            {selectedStep && (
                                                <div className="space-y-4 mt-4">
                                                    {selectedStep.actionItems && selectedStep.actionItems.length > 0 && (
                                                        <div>
                                                            <h4 className="font-semibold text-sm text-gray-900 mb-2">추천 활동</h4>
                                                            <ul className="space-y-2">
                                                                {selectedStep.actionItems.map((item, i) => (
                                                                    <li key={i} className="text-sm text-gray-700 flex gap-2">
                                                                        <span className="text-purple-600 shrink-0 font-bold">•</span>
                                                                        <span dangerouslySetInnerHTML={{ __html: item.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}
                                                    {selectedStep.resources && selectedStep.resources.length > 0 && (
                                                        <div>
                                                            <h4 className="font-semibold text-sm text-gray-900 mb-2">추천 자료</h4>
                                                            <ul className="space-y-3">
                                                                {selectedStep.resources.map((resource, i) => (
                                                                    <li key={i} className="text-sm">
                                                                        <span className="font-medium text-gray-800">• {resource.title}</span>
                                                                        {'content' in resource && resource.content && (
                                                                            <div className="mt-1.5 pl-4 pr-2 py-2 bg-gray-50 rounded-md border border-gray-100 text-gray-700 whitespace-pre-wrap max-h-48 overflow-y-auto text-xs leading-relaxed">
                                                                                {resource.content}
                                                                            </div>
                                                                        )}
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </DialogContent>
                                    </Dialog>
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
                        <Button onClick={handleGenerateRoadmap} disabled={!clientId || isGenerating}>
                            {isGenerating ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    생성 중...
                                </>
                            ) : (
                                '로드맵 생성하기'
                            )}
                        </Button>
                    </div>
                )}
                <Dialog open={isResumeDialogOpen} onOpenChange={setIsResumeDialogOpen}>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="text-xl flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Sparkles className="h-5 w-5 text-purple-600" />
                                    AI 맞춤형 자기소개서 초안 (3종)
                                </div>
                            </DialogTitle>
                            <DialogDescription>
                                AI가 분석한 {clientData?.client_name}님의 역량을 바탕으로 세 가지 테마의 초안을 생성했습니다.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="mt-4">
                            <div className="flex w-full border-b border-gray-200 mb-6 gap-2">
                                {generatedResumes.map((res, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setActiveResumeTab(i)}
                                        className={cn(
                                            "flex-1 pb-3 text-xs sm:text-sm font-medium transition-all relative",
                                            activeResumeTab === i
                                                ? "text-purple-600 border-b-2 border-purple-600"
                                                : "text-gray-500 hover:text-gray-700 hover:border-b-2 hover:border-gray-300"
                                        )}
                                    >
                                        <div className="flex items-center justify-center gap-1.5">
                                            {res.title}
                                            {res.scoring?.average && (
                                                <span className={cn(
                                                    "px-1.5 py-0.5 rounded-full font-bold text-[10px]",
                                                    activeResumeTab === i ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-500"
                                                )}>
                                                    {res.scoring.average}%
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                ))}
                            </div>
                            {generatedResumes[activeResumeTab] && (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="md:col-span-1 space-y-4">
                                            <div className="p-4 bg-purple-50 rounded-lg border border-purple-100">
                                                <h4 className="text-sm font-bold text-purple-900 mb-2 whitespace-nowrap">AI 적합도 분석</h4>
                                                <div className="space-y-2">
                                                    <div className="flex justify-between text-[11px]">
                                                        <span className="text-purple-700">유형 유사도</span>
                                                        <span className="font-bold text-purple-900">{generatedResumes[activeResumeTab].scoring?.type_similarity ?? 0}%</span>
                                                    </div>
                                                    <div className="flex justify-between text-[11px]">
                                                        <span className="text-purple-700">적성 적합도</span>
                                                        <span className="font-bold text-purple-900">{generatedResumes[activeResumeTab].scoring?.aptitude_fit ?? 0}%</span>
                                                    </div>
                                                    <div className="flex justify-between text-[11px]">
                                                        <span className="text-purple-700">역량 반영도</span>
                                                        <span className="font-bold text-purple-900">{generatedResumes[activeResumeTab].scoring?.competency_reflection ?? 0}%</span>
                                                    </div>
                                                    <div className="pt-2 border-t border-purple-200 mt-2 flex justify-between text-xs font-bold">
                                                        <span className="text-purple-900">평균 적합도</span>
                                                        <span className="text-purple-900">{generatedResumes[activeResumeTab].scoring?.average ?? 0}%</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="p-4 bg-gray-50 rounded-lg border border-gray-100 italic">
                                                <h4 className="text-sm font-bold text-gray-900 mb-2 not-italic">분석 코멘트</h4>
                                                <p className="text-[11px] text-gray-700 leading-relaxed max-h-48 overflow-y-auto">
                                                    {generatedResumes[activeResumeTab].reasoning || "직무 역량과 경험을 효과적으로 구성한 초안입니다."}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="md:col-span-2">
                                            <div className="p-6 bg-white rounded-lg border border-gray-200 shadow-sm relative h-full">
                                                <div className="prose prose-sm max-w-none text-gray-800 whitespace-pre-wrap leading-relaxed text-sm">
                                                    {generatedResumes[activeResumeTab].draft}
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="absolute top-2 right-2 h-8 text-xs gap-1 opacity-70 hover:opacity-100"
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(generatedResumes[activeResumeTab].draft)
                                                        alert("클립보드에 복사되었습니다.")
                                                    }}
                                                >
                                                    <Download className="h-3.5 w-3.5" />
                                                    복사
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </DialogContent>
                </Dialog>
            </article>
        </main>
    );
}
