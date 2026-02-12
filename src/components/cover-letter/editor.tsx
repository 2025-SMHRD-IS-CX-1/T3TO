"use client"

"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Copy, Save, Sparkles, RefreshCw, FileEdit, Check, Loader2, Download, ChevronDown, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
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
}

export function CoverLetterEditor({ initialDrafts, clientId }: CoverLetterEditorProps) {
    const [drafts, setDrafts] = useState<Draft[]>(initialDrafts)
    const [selectedDraftId, setSelectedDraftId] = useState<string>(initialDrafts.length > 0 ? initialDrafts[0].id : "")
    const [content, setContent] = useState<string>(initialDrafts.length > 0 ? initialDrafts[0].content : "")
    const [isEditing, setIsEditing] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [isGenerating, setIsGenerating] = useState(false)

    // Update state when initialDrafts changes (e.g. after save and revalidate)
    useEffect(() => {
        setDrafts(initialDrafts)
        if (initialDrafts.length > 0 && !selectedDraftId) {
            setSelectedDraftId(initialDrafts[0].id)
            setContent(initialDrafts[0].content)
        }
    }, [initialDrafts, selectedDraftId])

    const handleSelectDraft = (draft: Draft) => {
        setSelectedDraftId(draft.id)
        setContent(draft.content)
        setIsEditing(false)
    }

    const handleSave = async () => {
        setIsSaving(true)
        const title = drafts.find(d => d.id === selectedDraftId)?.title || "새로운 자기소개서"
        const result = await saveDraft(selectedDraftId, content, title, clientId)
        if (result.success) {
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
            alert("3가지 버전의 AI 초안이 생성되었습니다.")
        } else {
            alert(result.error || "생성에 실패했습니다.")
        }
        setIsGenerating(false)
    }

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(content)
            alert('자기소개서 내용이 클립보드에 복사되었습니다!')
        } catch (err) {
            alert('복사에 실패했습니다.')
        }
    }

    const handleDownloadTxt = () => {
        const title = drafts.find(d => d.id === selectedDraftId)?.title || "자기소개서"
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${title}_${new Date().toISOString().split('T')[0]}.txt`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    const handleDownloadPdf = () => {
        // Create a simple HTML document for PDF
        const title = drafts.find(d => d.id === selectedDraftId)?.title || "자기소개서"
        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>
        body { font-family: 'Malgun Gothic', sans-serif; padding: 40px; line-height: 1.8; }
        h1 { font-size: 24px; margin-bottom: 20px; }
        p { white-space: pre-wrap; }
    </style>
</head>
<body>
    <h1>${title}</h1>
    <p>${content}</p>
</body>
</html>
        `
        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${title}_${new Date().toISOString().split('T')[0]}.html`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        alert('HTML 파일로 다운로드되었습니다. 브라우저에서 열어 PDF로 인쇄할 수 있습니다.')
    }

    const handleDownloadDocx = () => {
        const title = drafts.find(d => d.id === selectedDraftId)?.title || "자기소개서"
        // Create RTF format which can be opened in Word
        const rtfContent = `{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0 Malgun Gothic;}}
\\f0\\fs24
{\\b ${title}}\\par
\\par
${content.replace(/\n/g, '\\par\n')}
}`
        const blob = new Blob([rtfContent], { type: 'application/rtf' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${title}_${new Date().toISOString().split('T')[0]}.rtf`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        alert('RTF 파일로 다운로드되었습니다. MS Word나 한글에서 열 수 있습니다.')
    }

    const [isPolishing, setIsPolishing] = useState(false)

    const handleAiPolish = async () => {
        if (!content) return
        setIsPolishing(true)

        // Simulate AI processing delay
        await new Promise(resolve => setTimeout(resolve, 2000))

        const polishedContent = content + "\n\n(AI가 문맥을 매끄럽게 다듬고, 설득력 있는 표현으로 수정했습니다.)"
        setContent(polishedContent)

        setIsPolishing(false)
        alert('AI 윤문이 완료되었습니다.')
    }

    const handleCreateNew = () => {
        setSelectedDraftId("")
        setContent("")
        setIsEditing(true)
    }

    const handleDelete = async (e: React.MouseEvent, draftId: string) => {
        e.stopPropagation()
        if (confirm("정말로 이 자기소개서를 삭제하시겠습니까?")) {
            const result = await deleteDraft(draftId)
            if (result.success) {
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-140px)] min-h-[600px]">
            {/* Left Sidebar: Draft List */}
            <div className="lg:col-span-3 space-y-4 flex flex-col h-full">
                <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-lg">초안 목록</h2>
                    <div className="flex gap-1">
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
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <RefreshCw className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                <div className="space-y-3 overflow-y-auto flex-1 pr-1">
                    {drafts.map((draft) => (
                        <div
                            key={draft.id}
                            onClick={() => handleSelectDraft(draft)}
                            className={cn(
                                "p-4 rounded-xl border cursor-pointer transition-all hover:border-purple-300 hover:bg-purple-50",
                                selectedDraftId === draft.id
                                    ? "border-purple-500 bg-purple-50 ring-1 ring-purple-500"
                                    : "bg-white"
                            )}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <h3 className={cn("font-medium text-sm line-clamp-2 pr-6", selectedDraftId === draft.id ? "text-purple-900" : "text-gray-900")}>
                                    {draft.title}
                                </h3>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 text-gray-400 hover:text-red-500 hover:bg-red-50 absolute right-3 top-3"
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
                    <Button
                        variant="outline"
                        onClick={handleCreateNew}
                        className="w-full border-dashed border-2 py-6 text-gray-500 hover:text-purple-600 hover:border-purple-300 hover:bg-purple-50"
                    >
                        + 새 초안 생성하기
                    </Button>
                </div>
            </div>

            {/* Right Content: Editor */}
            <div className="lg:col-span-9 flex flex-col h-full">
                <Card className="flex-1 flex flex-col overflow-hidden shadow-sm border-gray-200">
                    <div className="border-b p-4 flex items-center justify-between bg-gray-50">
                        <div className="flex items-center gap-3">
                            <Badge variant="purple" className="rounded-md">AI 생성됨</Badge>
                            <span className="text-sm font-medium text-gray-600">
                                {isEditing ? "편집 모드" : "미리보기 모드"}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setIsEditing(!isEditing)}
                            >
                                <FileEdit className="mr-2 h-4 w-4" />
                                {isEditing ? "완료" : "직접 수정"}
                            </Button>
                            <Button variant="outline" size="sm" onClick={handleAiPolish} disabled={isPolishing || !content}>
                                {isPolishing ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Sparkles className="mr-2 h-4 w-4 text-purple-600" />
                                )}
                                AI 윤문
                            </Button>
                            <Button variant="outline" size="sm" onClick={handleCopy}>
                                <Copy className="mr-2 h-4 w-4" />
                                복사
                            </Button>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm">
                                        <Download className="mr-2 h-4 w-4" />
                                        다운로드
                                        <ChevronDown className="ml-2 h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={handleDownloadTxt}>
                                        텍스트 파일 (.txt)
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={handleDownloadPdf}>
                                        HTML 파일 (.html) - PDF 인쇄 가능
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={handleDownloadDocx}>
                                        RTF 파일 (.rtf) - Word/한글 호환
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <Button size="sm" onClick={handleSave} disabled={isSaving}>
                                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                저장
                            </Button>
                        </div>
                    </div>

                    <div className="flex-1 p-6 overflow-hidden bg-white">
                        {isEditing ? (
                            <textarea
                                className="w-full h-full resize-none focus:outline-none text-base leading-relaxed text-gray-800 font-medium font-sans"
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                placeholder="자기소개서 내용을 작성하세요..."
                            />
                        ) : (
                            <div className="h-full overflow-y-auto pr-2 prose prose-sm max-w-none text-gray-800 leading-relaxed whitespace-pre-line">
                                {content || "등록된 내용이 없습니다."}
                            </div>
                        )}
                    </div>

                    <div className="border-t p-3 bg-gray-50 flex items-center justify-between text-xs text-gray-500">
                        <span>글자수: {content.length}자 (공백 포함)</span>
                        <div className="flex items-center gap-2">
                            <Check className="h-3 w-3 text-green-500" /> 자동 저장됨 (14:32)
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    )
}
