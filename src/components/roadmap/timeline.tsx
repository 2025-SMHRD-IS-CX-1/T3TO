"use client"

import { motion } from "motion/react"
import { Check, Circle, Clock, ArrowRight, ChevronRight, CheckCircle2, Lock } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog"
import { useState } from "react"

export interface RoadmapStep {
    id: string
    title: string
    description: string
    status: "completed" | "in-progress" | "locked"
    date?: string
    resources?: { title: string; url: string; type: "video" | "article" | "quiz" }[]
    quizScore?: number
    /** 사용자 맞춤 구체적 실행 방안 */
    actionItems?: string[]
}

interface RoadmapTimelineProps {
    steps: RoadmapStep[]
}

export function RoadmapTimeline({ steps }: RoadmapTimelineProps) {
    const [selectedStep, setSelectedStep] = useState<RoadmapStep | null>(null)

    return (
        <div className="relative py-8">
            {/* Vertical Line */}
            <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200" />

            <div className="space-y-8">
                {steps.map((step, index) => {
                    const isCompleted = step.status === "completed"
                    const isInProgress = step.status === "in-progress"
                    const isLocked = step.status === "locked"

                    return (
                        <motion.div
                            key={step.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.1 }}
                            className="relative flex items-start gap-6 group"
                        >
                            {/* Status Icon */}
                            <div
                                className={cn(
                                    "relative z-10 flex h-12 w-12 items-center justify-center rounded-full border-4 transition-colors duration-300",
                                    isCompleted
                                        ? "border-green-100 bg-green-500 shadow-md shadow-green-200"
                                        : isInProgress
                                            ? "border-purple-100 bg-white border-2 border-purple-600 shadow-md shadow-purple-200"
                                            : "border-gray-100 bg-gray-200"
                                )}
                            >
                                {isCompleted ? (
                                    <Check className="h-6 w-6 text-white" />
                                ) : isInProgress ? (
                                    <div className="h-3 w-3 rounded-full bg-purple-600 animate-pulse" />
                                ) : (
                                    <Lock className="h-5 w-5 text-gray-400" />
                                )}
                            </div>

                            {/* Content Card */}
                            <div className="flex-1">
                                <Dialog>
                                    <DialogTrigger asChild>
                                        <Card
                                            className={cn(
                                                "cursor-pointer transition-all hover:shadow-md",
                                                isInProgress && "border-purple-200 ring-2 ring-purple-100"
                                            )}
                                            onClick={() => setSelectedStep(step)}
                                        >
                                            <CardHeader className="pb-3">
                                                <div className="flex items-center justify-between">
                                                    <div className="space-y-1">
                                                        <CardTitle className={cn("text-lg", isLocked && "text-gray-500")}>
                                                            {step.title}
                                                        </CardTitle>
                                                        <CardDescription className="flex items-center gap-2">
                                                            {isCompleted && (
                                                                <span className="flex items-center text-green-600 text-xs font-medium bg-green-50 px-2 py-0.5 rounded-full">
                                                                    <CheckCircle2 className="mr-1 h-3 w-3" /> 완료됨 • {step.date}
                                                                </span>
                                                            )}
                                                            {isInProgress && (
                                                                <span className="flex items-center text-purple-600 text-xs font-medium bg-purple-50 px-2 py-0.5 rounded-full">
                                                                    <Clock className="mr-1 h-3 w-3" /> 진행 중
                                                                </span>
                                                            )}
                                                        </CardDescription>
                                                    </div>
                                                    <ChevronRight className="h-5 w-5 text-gray-400" />
                                                </div>
                                            </CardHeader>
                                            <CardContent>
                                                <p className="text-sm text-gray-600 line-clamp-2">{step.description}</p>
                                            </CardContent>
                                        </Card>
                                    </DialogTrigger>

                                    {/* Detail Modal */}
                                    <DialogContent className="sm:max-w-2xl">
                                        <DialogHeader>
                                            <div className="flex items-center gap-2 mb-2">
                                                {isCompleted ? (
                                                    <Badge variant="success">완료됨</Badge>
                                                ) : isInProgress ? (
                                                    <Badge variant="purple">진행 중</Badge>
                                                ) : (
                                                    <Badge variant="default">잠김</Badge>
                                                )}
                                            </div>
                                            <DialogTitle className="text-2xl">{step.title}</DialogTitle>
                                            <DialogDescription className="text-base text-gray-600 mt-2">
                                                {step.description}
                                            </DialogDescription>
                                        </DialogHeader>

                                        <div className="py-4 space-y-6">
                                            {/* Learning Resources */}
                                            <div className="space-y-3">
                                                <h4 className="text-sm font-semibold text-gray-900 border-b pb-2">학습 자료</h4>
                                                <div className="grid gap-2">
                                                    {step.resources?.map((resource, i) => (
                                                        <a
                                                            key={i}
                                                            href={resource.url}
                                                            target="_blank"
                                                            className="flex items-center p-3 rounded-lg border bg-gray-50 hover:bg-gray-100 transition-colors"
                                                        >
                                                            <div className="flex h-8 w-8 items-center justify-center rounded bg-white border mr-3 text-lg">
                                                                {resource.type === 'video' ? '🎬' : resource.type === 'quiz' ? '📝' : '📄'}
                                                            </div>
                                                            <div className="flex-1">
                                                                <p className="text-sm font-medium text-gray-900">{resource.title}</p>
                                                                <p className="text-xs text-gray-500 capitalize">{resource.type}</p>
                                                            </div>
                                                            <ArrowRight className="h-4 w-4 text-gray-400" />
                                                        </a>
                                                    )) || <p className="text-sm text-gray-500">등록된 자료가 없습니다.</p>}
                                                </div>
                                            </div>

                                            {/* Quiz Score if completed */}
                                            {isCompleted && step.quizScore !== undefined && (
                                                <div className="bg-purple-50 p-4 rounded-lg flex items-center justify-between">
                                                    <span className="text-sm font-medium text-purple-900">최종 퀴즈 점수</span>
                                                    <span className="text-lg font-bold text-purple-700">{step.quizScore} / 100</span>
                                                </div>
                                            )}
                                        </div>

                                        <DialogFooter>
                                            {isInProgress && (
                                                <Button className="w-full sm:w-auto">
                                                    다음 단계로 진행
                                                </Button>
                                            )}
                                            <Button variant="secondary" className="w-full sm:w-auto">닫기</Button>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>
                            </div>
                        </motion.div>
                    )
                })}
            </div>
        </div>
    )
}
