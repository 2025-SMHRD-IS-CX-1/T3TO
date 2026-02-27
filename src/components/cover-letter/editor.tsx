"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import * as Diff from "diff"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Save, Sparkles, RefreshCw, FileEdit, Loader2, Download, ChevronDown, Trash2 } from "lucide-react"
import { cn, notifyNotificationCheck } from "@/lib/utils"
import { saveDraft, deleteDraft, generateAIDrafts, getDrafts, analyzeDraftScoring } from "@/app/(dashboard)/cover-letter/actions"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface Draft {
    id: string
    title: string
    date: string
    content: string
    tags: string[]
}

/** 화면에 표기되면 안 되는 스코어 메타데이터 주석 제거 (저장·표시 시 사용) */
function stripScoringComment(text: string): string {
    if (!text) return ""
    return text.replace(/<!-- scoring: \{[\s\S]*?\} -->/g, "").trim()
}

interface CoverLetterEditorProps {
    initialDrafts: Draft[]
    clientId?: string
    /** URL 등에서 지정된 초안 ID가 있으면 해당 초안을 선택한 상태로 열기 */
    initialSelectedDraftId?: string
}

export function CoverLetterEditor({ initialDrafts, clientId, initialSelectedDraftId }: CoverLetterEditorProps) {
    const router = useRouter()
    const [drafts, setDrafts] = useState<Draft[]>(initialDrafts)
    const resolvedInitialId =
        initialSelectedDraftId && initialDrafts.some((d) => d.id === initialSelectedDraftId)
            ? initialSelectedDraftId
            : initialDrafts.length > 0
                ? initialDrafts[0].id
                : ""
    const initialDraft = initialDrafts.find((d) => d.id === resolvedInitialId)
    const [selectedDraftId, setSelectedDraftId] = useState<string>(resolvedInitialId)
    const [content, setContent] = useState<string>(() =>
        stripScoringComment(initialDraft?.content ?? (initialDrafts.length > 0 ? initialDrafts[0].content : ""))
    )
    const [isEditing, setIsEditing] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [isGenerating, setIsGenerating] = useState(false)
    const [currentScoring, setCurrentScoring] = useState<any>(null)
    /** 실시간 분석 스코어 (DB 미저장, 화면 표시용) draftId -> scoring */
    const [liveScores, setLiveScores] = useState<Record<string, { type_similarity: number; aptitude_fit: number; competency_reflection: number; average: number }>>({})
    /** 실시간 분석 요청 중인 draftId 목록 (중복 요청 방지) */
    const [loadingScoreIds, setLoadingScoreIds] = useState<Set<string>>(new Set())
    const requestedScoreIds = useRef<Set<string>>(new Set())

    // --- 실시간 적합도 분석: 스코어 없으면 본문 기반으로 분석 요청 ---
    useEffect(() => {
        if (!drafts.length) return
        drafts.forEach((draft) => {
            if (parseScoring(draft.content) != null) return
            if (liveScores[draft.id] != null) return
            if (requestedScoreIds.current.has(draft.id)) return
            const content = stripScoringComment(draft.content)
            if (!content || content.length < 100) return
            requestedScoreIds.current.add(draft.id)
            setLoadingScoreIds((prev) => new Set(prev).add(draft.id))
            analyzeDraftScoring(content, draft.title).then((score) => {
                requestedScoreIds.current.delete(draft.id)
                setLoadingScoreIds((prev) => {
                    const next = new Set(prev)
                    next.delete(draft.id)
                    return next
                })
                if (score) setLiveScores((prev) => ({ ...prev, [draft.id]: score }))
            })
        })
    }, [drafts])

    // --- Helper functions for scoring metadata ---
    const parseScoring = (text: string) => {
        if (!text) return null
        const match = text.match(/<!-- scoring: (\{[\s\S]*?\}) -->/)
        if (match) {
            try { return JSON.parse(match[1]) } catch (e) { /* ignore parse error and fallback */ }
        }
        // 스코어 없음 → 미산출 표시 (가짜 85% 방지)
        return null
    }
    const cleanContent = stripScoringComment

    // Update state when initialDrafts changes (e.g. after save and revalidate)
    useEffect(() => {
        setDrafts(initialDrafts)
        if (initialDrafts.length > 0 && !selectedDraftId) {
            const id =
                initialSelectedDraftId && initialDrafts.some((d) => d.id === initialSelectedDraftId)
                    ? initialSelectedDraftId
                    : initialDrafts[0].id
            const draft = initialDrafts.find((d) => d.id === id) ?? initialDrafts[0]
            setSelectedDraftId(draft.id)
            setContent(cleanContent(draft.content))
            setCurrentScoring(parseScoring(draft.content))
        }
    }, [initialDrafts, selectedDraftId, initialSelectedDraftId])

    const handleSelectDraft = (draft: Draft) => {
        setSelectedDraftId(draft.id)
        setContent(cleanContent(draft.content))
        setCurrentScoring(parseScoring(draft.content))
        setIsEditing(false)
        setHighlightChunks(null)
    }

    const handleSave = async () => {
        setIsSaving(true)
        const title = drafts.find(d => d.id === selectedDraftId)?.title || "새로운 자기소개서"

        // 스코어 주석은 저장하지 않음 (화면에 표기되지 않도록)
        const result = await saveDraft(selectedDraftId, content, title, clientId)
        if (result.success) {
            notifyNotificationCheck()
            setIsEditing(false)
            alert("저장되었습니다.")
        } else {
            alert(result.error || "저장에 실패했습니다.")
        }
        setIsSaving(false)
    }

    const handleGenerateAIDrafts = async () => {
        if (!clientId) {
            alert("내담자를 먼저 선택해주세요.")
            return
        }

        setIsGenerating(true)
        const result = await generateAIDrafts(clientId)
        if (result.success) {
            notifyNotificationCheck()

            // 서버 강제 갱신 트리거
            router.refresh()

            // 즉시 반영을 위해 로컬에서 목록 다시 가져오기
            const updatedDrafts = await getDrafts(clientId)
            setDrafts(updatedDrafts)

            if (updatedDrafts.length > 0) {
                const latest = updatedDrafts[0]
                setSelectedDraftId(latest.id)
                setContent(cleanContent(latest.content))
                setCurrentScoring(parseScoring(latest.content))
            }

            alert("3가지 버전의 AI 초안이 생성되었습니다.")
        } else {
            alert(result.error || "생성에 실패했습니다.")
        }
        setIsGenerating(false)
    }

    // 다운로드용 파일명: 특수문자 제거
    const getDownloadFilename = (ext: string) => {
        const title = (drafts.find(d => d.id === selectedDraftId)?.title || "자기소개서")
            .replace(/[/\\:*?"<>|]/g, "_").trim() || "자기소개서"
        return `${title}_${new Date().toISOString().split("T")[0]}.${ext}`
    }

    const downloadBlob = (blob: Blob, filename: string) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    const handleDownloadTxt = () => {
        const blob = new Blob([content ?? ""], { type: "text/plain;charset=utf-8" })
        downloadBlob(blob, getDownloadFilename("txt"))
    }

    /** RTF: 한글 등 비ASCII를 \\uN? 유니코드 이스케이프로 출력해 인코딩 깨짐 방지 */
    const toRtfUnicode = (s: string): string => {
        let out = ""
        for (let i = 0; i < s.length; i++) {
            const code = s.charCodeAt(i)
            if (code >= 128) {
                out += "\\u" + code + "?"
            } else if (code === 92) {
                out += "\\\\"
            } else if (code === 123) {
                out += "\\{"
            } else if (code === 125) {
                out += "\\}"
            } else if (code === 10) {
                out += "\\par\n"
            } else if (code !== 13) {
                out += s[i]
            }
        }
        return out
    }

    const handleDownloadRtf = () => {
        const title = drafts.find(d => d.id === selectedDraftId)?.title || "자기소개서"
        const bodyRtf = toRtfUnicode(content ?? "")
        const titleRtf = toRtfUnicode(title)
        const rtfContent = `{\\rtf1\\ansi\\ansicpg65001\\deff0\n{\\fonttbl{\\f0\\fswiss Malgun Gothic;}}\n\\f0\\fs24\n{\\b ${titleRtf}}\\par\n\\par\n${bodyRtf}\n}`
        const blob = new Blob(["\uFEFF" + rtfContent], { type: "application/rtf;charset=utf-8" })
        downloadBlob(blob, getDownloadFilename("rtf"))
    }

    const handleDownloadPdf = async () => {
        const title = drafts.find(d => d.id === selectedDraftId)?.title || "자기소개서"
        const container = document.createElement("div")
        container.style.position = "absolute"
        container.style.left = "-9999px"
        container.style.top = "0"
        container.style.width = "210mm"
        container.style.padding = "20mm"
        container.style.fontFamily = "'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif"
        container.style.fontSize = "11pt"
        container.style.lineHeight = "1.8"
        container.style.color = "#1f2937"
        container.style.backgroundColor = "#fff"
        container.style.whiteSpace = "pre-wrap"
        container.style.wordBreak = "break-word"
        container.innerHTML = `<h1 style="font-size:18pt;margin-bottom:16px;font-weight:700">${title.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</h1><div>${(content ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>")}</div>`
        document.body.appendChild(container)
        try {
            const { default: html2canvas } = await import("html2canvas")
            const { jsPDF } = await import("jspdf")
            const canvas = await html2canvas(container, { scale: 2, backgroundColor: "#ffffff", logging: false })
            const imgData = canvas.toDataURL("image/png", 1.0)
            const pdf = new jsPDF({ unit: "mm", format: "a4" })
            const pageW = pdf.internal.pageSize.getWidth()
            const pageH = pdf.internal.pageSize.getHeight()
            const margin = 10
            const maxW = pageW - margin * 2
            const maxH = pageH - margin * 2
            const ratio = canvas.width / canvas.height
            const imgW = ratio >= maxW / maxH ? maxW : maxH * ratio
            const imgH = ratio >= maxW / maxH ? maxW / ratio : maxH
            pdf.addImage(imgData, "PNG", margin, margin, imgW, imgH, undefined, "FAST")
            const blob = pdf.output("blob")
            downloadBlob(blob, getDownloadFilename("pdf"))
        } finally {
            document.body.removeChild(container)
        }
    }

    const [isPolishing, setIsPolishing] = useState(false)
    /** 다듬기 후 원문 대비 변경된 구간 표시용 (added 청크만 하이라이트) */
    const [highlightChunks, setHighlightChunks] = useState<Diff.Change[] | null>(null)
    /** Radix DropdownMenu의 서버/클라이언트 id 불일치로 인한 hydration 오류 방지 */
    const [mounted, setMounted] = useState(false)
    useEffect(() => {
        setMounted(true)
    }, [])

    const handleAiPolish = async () => {
        if (!content?.trim()) return
        setIsPolishing(true)
        const originalContent = content
        try {
            const res = await fetch('/api/cover-letter/polish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: content }),
            })
            const data = (await res.json().catch(() => ({}))) as { content?: string; error?: string }
            if (!res.ok) {
                alert(data?.error ?? `요청 실패 (${res.status})`)
                return
            }
            const polishedContent = typeof data?.content === 'string' ? data.content.trim() : ''
            if (!polishedContent) {
                alert('AI가 수정된 내용을 반환하지 않았습니다.')
                return
            }
            const hasChange = polishedContent !== originalContent.trim()
            setContent(polishedContent)
            setHighlightChunks(hasChange ? Diff.diffWords(originalContent, polishedContent) : null)
            setIsEditing(true)

            // 스코어 주석 없이 본문만 유지 (화면에 표기되지 않도록)
            if (selectedDraftId) {
                setDrafts(prev => prev.map(d => d.id === selectedDraftId ? { ...d, content: polishedContent } : d))
            }
            if (hasChange) {
                alert('AI 다듬기가 완료되었습니다.')
            } else {
                alert('AI가 수정할 부분을 찾지 못했거나 동일한 내용으로 반환했습니다. 입력 내용을 확인해 주세요.')
            }
        } catch (e) {
            console.error('[AI 다듬기]', e)
            alert('AI 다듬기 중 오류가 났습니다. 네트워크 또는 콘솔을 확인해주세요.')
        } finally {
            setIsPolishing(false)
        }
    }

    const handleDelete = async (e: React.MouseEvent, draftId: string) => {
        e.stopPropagation()
        if (confirm("정말로 이 자기소개서를 삭제하시겠습니까?")) {
            const result = await deleteDraft(draftId)
            if (result.success) {
                notifyNotificationCheck()
                router.refresh()

                // 로컬 상태 즉시 반영
                setDrafts(prev => {
                    const filtered = prev.filter(d => d.id !== draftId)
                    if (selectedDraftId === draftId) {
                        if (filtered.length > 0) {
                            const next = filtered[0]
                            setSelectedDraftId(next.id)
                            setContent(cleanContent(next.content))
                            setCurrentScoring(parseScoring(next.content))
                        } else {
                            setSelectedDraftId("")
                            setContent("")
                            setCurrentScoring(null)
                        }
                    }
                    return filtered
                })
            } else {
                alert("삭제에 실패했습니다.")
            }
        }
    }

    return (
        <>
            {isGenerating && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <Card className="w-full max-w-md mx-4 shadow-2xl">
                        <CardContent className="pt-6 pb-8 px-6">
                            <div className="flex flex-col items-center gap-4">
                                <Loader2 className="h-12 w-12 animate-spin text-purple-600" />
                                <div className="text-center">
                                    <h3 className="text-lg font-semibold text-gray-900 mb-2">자기소개서 초안 생성 중</h3>
                                    <p className="text-sm text-gray-600">AI가 3가지 버전의 초안을 생성하고 있습니다...</p>
                                    <p className="text-xs text-gray-500 mt-2">잠시만 기다려주세요 (최대 약 1분 소요)</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        <div className="flex flex-col gap-4 h-[calc(100vh-140px)] min-h-[600px]">
            {/* 초안 목록: 가로 스크롤 */}
            <div className="flex flex-col gap-2 shrink-0">
                <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-lg">초안 목록</h2>
                    <Button
                        variant="outline"
                        size="default"
                        className="h-10 px-4 text-sm bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100"
                        onClick={handleGenerateAIDrafts}
                        disabled={isGenerating}
                    >
                        {isGenerating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                        초안 생성
                    </Button>
                </div>
                <div className="flex gap-3 overflow-x-auto p-1 pt-2 pb-2 min-h-[100px]">
                    {drafts.map((draft) => (
                        <div
                            key={draft.id}
                            onClick={() => handleSelectDraft(draft)}
                            className={cn(
                                "shrink-0 w-[200px] p-4 rounded-xl border cursor-pointer transition-all hover:border-purple-300 hover:bg-purple-50",
                                selectedDraftId === draft.id
                                    ? "border-purple-500 bg-purple-50 ring-2 ring-purple-500 ring-inset"
                                    : "bg-white"
                            )}
                        >
                            <div className="flex justify-between items-start mb-2 relative">
                                <h3 className={cn("font-medium text-sm line-clamp-2 pr-6", selectedDraftId === draft.id ? "text-purple-900" : "text-gray-900")}>
                                    {draft.title}
                                </h3>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 text-gray-400 hover:text-red-500 hover:bg-red-50 shrink-0 absolute right-0 top-0"
                                    onClick={(e) => handleDelete(e, draft.id)}
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                            <p className="text-xs text-gray-500 mb-2">{draft.date}</p>
                            {(() => {
                                const fromContent = parseScoring(draft.content)
                                const scoring = fromContent ?? liveScores[draft.id]
                                if (loadingScoreIds.has(draft.id)) {
                                    return (
                                        <div className="mt-2 flex items-center gap-1.5">
                                            <Loader2 className="h-3 w-3 animate-spin text-purple-500" />
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                                                적합도 분석 중...
                                            </span>
                                        </div>
                                    )
                                }
                                if (scoring?.average != null) {
                                    return (
                                        <div className="space-y-1.5 mt-1 border-t pt-2 border-gray-100">
                                            <div className="flex justify-between items-center text-[10px]">
                                                <span className="text-gray-500">유형 유사도</span>
                                                <span className="font-bold text-purple-700">{scoring.type_similarity ?? 0}%</span>
                                            </div>
                                            <div className="flex justify-between items-center text-[10px]">
                                                <span className="text-gray-500">적성 적합도</span>
                                                <span className="font-bold text-purple-700">{scoring.aptitude_fit ?? 0}%</span>
                                            </div>
                                            <div className="flex justify-between items-center text-[10px]">
                                                <span className="text-gray-500">역량 반영도</span>
                                                <span className="font-bold text-purple-700">{scoring.competency_reflection ?? 0}%</span>
                                            </div>
                                            <div className="pt-1 mt-1 border-t border-purple-100 flex justify-between items-center">
                                                <span className="text-[10px] font-bold text-purple-900">종합 적합도</span>
                                                <span className="text-[11px] font-black text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded">
                                                    {scoring.average}%
                                                </span>
                                            </div>
                                        </div>
                                    )
                                }
                                return (
                                    <div className="mt-2 flex items-center gap-1.5">
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                                            적합도 미산출
                                        </span>
                                    </div>
                                )
                            })()}
                        </div>
                    ))}
                </div>
            </div>

            {/* Editor */}
            <div className="flex-1 flex flex-col min-h-0">
                <Card className="flex-1 flex flex-col overflow-hidden shadow-sm border-gray-200">
                    <div className="border-b p-4 flex items-center justify-end bg-gray-50">
                        <div className="flex items-center gap-2">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                    setIsEditing(!isEditing)
                                    setHighlightChunks(null)
                                }}
                            >
                                <FileEdit className="mr-2 h-4 w-4" />
                                {isEditing ? "완료" : "직접 수정"}
                            </Button>
                            {mounted ? (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" size="sm">
                                            <Download className="mr-2 h-4 w-4" />
                                            다운로드
                                            <ChevronDown className="ml-2 h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onSelect={() => handleDownloadPdf()}>
                                            PDF 파일 (.pdf) - 바로 다운로드
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onSelect={() => handleDownloadTxt()}>
                                            텍스트 파일 (.txt)
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onSelect={() => handleDownloadRtf()}>
                                            RTF 파일 (.rtf) - Word/한글 호환
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            ) : (
                                <Button variant="outline" size="sm">
                                    <Download className="mr-2 h-4 w-4" />
                                    다운로드
                                    <ChevronDown className="ml-2 h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 p-6 overflow-hidden bg-white">
                        {isEditing ? (
                            <textarea
                                className="w-full h-full resize-none focus:outline-none text-base leading-relaxed text-gray-800 font-medium font-sans min-h-0"
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                placeholder="자기소개서 내용을 작성하세요..."
                            />
                        ) : (
                            <div className="h-full overflow-y-auto pr-2 prose prose-sm max-w-none text-gray-800 leading-relaxed whitespace-pre-line">
                                {content
                                    ? highlightChunks != null
                                        ? highlightChunks.map((part, i) => {
                                            if (part.added) {
                                                return (
                                                    <mark key={i} className="bg-amber-200/80 text-inherit rounded px-0.5">
                                                        {part.value}
                                                    </mark>
                                                )
                                            }
                                            if (part.removed) return null
                                            return <span key={i}>{part.value}</span>
                                        })
                                        : content
                                    : "등록된 내용이 없습니다."}
                            </div>
                        )}
                    </div>

                    <div className="border-t p-3 bg-gray-50 flex items-center justify-between text-xs text-gray-500">
                        <span>글자수: {content.length}자 (공백 포함)</span>
                    </div>
                </Card>
                <div className="flex justify-end gap-2 pt-3 shrink-0">
                    {selectedDraftId && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                            onClick={(e) => handleDelete(e, selectedDraftId)}
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            삭제
                        </Button>
                    )}
                    <Button size="sm" onClick={handleSave} disabled={isSaving}>
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        저장
                    </Button>
                </div>
            </div>
        </div>
        </>
    )
}
