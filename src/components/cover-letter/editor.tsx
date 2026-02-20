"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import * as Diff from "diff"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Save, Sparkles, RefreshCw, FileEdit, Loader2, Download, ChevronDown, Trash2 } from "lucide-react"
import { cn, notifyNotificationCheck } from "@/lib/utils"
import { saveDraft, deleteDraft, generateAIDrafts } from "@/app/(dashboard)/cover-letter/actions"
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
    const [content, setContent] = useState<string>(initialDraft?.content ?? (initialDrafts.length > 0 ? initialDrafts[0].content : ""))
    const [isEditing, setIsEditing] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [isGenerating, setIsGenerating] = useState(false)

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
            setContent(draft.content)
        }
    }, [initialDrafts, selectedDraftId, initialSelectedDraftId])

    const handleSelectDraft = (draft: Draft) => {
        setSelectedDraftId(draft.id)
        setContent(draft.content)
        setIsEditing(false)
        setHighlightChunks(null)
    }

    const handleSave = async () => {
        setIsSaving(true)
        const title = drafts.find(d => d.id === selectedDraftId)?.title || "새로운 자기소개서"
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
            router.refresh()
            setDrafts([])
            setSelectedDraftId("")
            setContent("")
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

    const handleDownloadHtml = () => {
        const title = drafts.find(d => d.id === selectedDraftId)?.title || "자기소개서"
        const escapedTitle = title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        const escapedContent = (content ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        const htmlContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${escapedTitle}</title>
<style>
body { font-family: 'Malgun Gothic', sans-serif; padding: 40px; line-height: 1.8; }
h1 { font-size: 24px; margin-bottom: 20px; }
p { white-space: pre-wrap; }
</style>
</head>
<body>
<h1>${escapedTitle}</h1>
<p>${escapedContent}</p>
</body>
</html>`
        const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" })
        downloadBlob(blob, getDownloadFilename("html"))
    }

    const handleDownloadRtf = () => {
        const title = drafts.find(d => d.id === selectedDraftId)?.title || "자기소개서"

        // RTF unicode escape helper
        const toRtfUnicode = (str: string) => {
            let result = ""
            for (let i = 0; i < str.length; i++) {
                const code = str.charCodeAt(i)
                if (code < 128) {
                    // ASCII characters: escape special chars
                    const char = str[i]
                    if (char === '\\' || char === '{' || char === '}') {
                        result += '\\' + char
                    } else if (char === '\n') {
                        result += '\\par\n'
                    } else {
                        result += char
                    }
                } else {
                    // Unicode characters: \uN?
                    // RTF requires signed 16-bit integers for standard RTF writers
                    const signedCode = code > 32767 ? code - 65536 : code
                    result += `\\u${signedCode}?`
                }
            }
            return result
        }

        const bodyRtf = toRtfUnicode(content ?? "")
        const titleRtf = toRtfUnicode(title)

        // \uc1 ensures that if a reader doesn't understand Unicode, it skips 1 char (the '?')
        const rtfContent = `{\\rtf1\\ansi\\deff0\\uc1\n{\\fonttbl{\\f0 Malgun Gothic;}}\n\\f0\\fs24\n{\\b ${titleRtf}}\\par\n\\par\n${bodyRtf}\n}`
        const blob = new Blob([rtfContent], { type: "application/rtf" })
        downloadBlob(blob, getDownloadFilename("rtf"))
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
            // 선택된 초안의 로컬 복사본도 갱신해 두어, 다른 초안 갔다 와도 다듬은 내용이 유지되도록 함
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
                if (selectedDraftId === draftId) {
                    setSelectedDraftId("")
                    setContent("")
                }
            } else {
                alert("삭제에 실패했습니다.")
            }
        }
    }

    return (
        <div className="flex flex-col gap-4 h-[calc(100vh-140px)] min-h-[600px]">
            {/* 초안 목록: 가로 스크롤 */}
            <div className="flex flex-col gap-2 shrink-0">
                <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-lg">초안 목록</h2>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-[10px] bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100"
                        onClick={handleGenerateAIDrafts}
                        disabled={isGenerating}
                    >
                        {isGenerating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                        AI 생성(3버전)
                    </Button>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2 min-h-[100px]">
                    {drafts.map((draft) => (
                        <div
                            key={draft.id}
                            onClick={() => handleSelectDraft(draft)}
                            className={cn(
                                "shrink-0 w-[200px] p-4 rounded-xl border cursor-pointer transition-all hover:border-purple-300 hover:bg-purple-50",
                                selectedDraftId === draft.id
                                    ? "border-purple-500 bg-purple-50 ring-1 ring-purple-500"
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
                            <div className="flex flex-wrap gap-1">
                                {draft.tags.map((tag) => (
                                    <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-md bg-white border text-gray-600">
                                        #{tag}
                                    </span>
                                ))}
                            </div>
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
                            <Button
                                variant="outline"
                                size="sm"
                                title="문장을 자연스럽게 다듬고 표현을 정리합니다"
                                onClick={handleAiPolish}
                                disabled={isPolishing || !content}
                            >
                                {isPolishing ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Sparkles className="mr-2 h-4 w-4 text-purple-600" />
                                )}
                                AI 다듬기
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
                                        <DropdownMenuItem onSelect={() => handleDownloadTxt()}>
                                            텍스트 파일 (.txt)
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onSelect={() => handleDownloadHtml()}>
                                            HTML 파일 (.html) - PDF 인쇄 가능
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
    )
}
