"use client"

import { cn } from "@/lib/utils"
import type { RoadmapStep } from "./timeline"
import { Star, Send, CheckCircle2 } from "lucide-react"

const QUARTERS = ["1분기", "2분기", "3분기", "4분기"] as const
const QUARTER_COLORS = [
    "bg-red-100 border-red-200 text-red-900",
    "bg-orange-100 border-orange-200 text-orange-900",
    "bg-amber-100 border-amber-200 text-amber-900",
    "bg-emerald-100 border-emerald-200 text-emerald-900",
] as const

const ROW_BAR_COLORS = [
    "bg-amber-200/90 border-amber-300",   // Product-like
    "bg-teal-200/90 border-teal-300",     // Dev-like
    "bg-sky-200/90 border-sky-300",      // Strategy-like
] as const

/** 단계별 분기 구간: [startQ, endQ] (1-based). 단기 Q1~Q2, 중기 Q2~Q4, 장기 Q3~Q4 */
const STEP_QUARTER_RANGE: [number, number][] = [
    [1, 2], // step 0: 단기
    [2, 4], // step 1: 중기
    [3, 4], // step 2: 장기
]

interface RoadmapGanttProps {
    steps: RoadmapStep[]
    year?: number
}

export function RoadmapGantt({ steps, year = new Date().getFullYear() }: RoadmapGanttProps) {
    const milestones: { label: string; quarter: number }[] = [
        { label: "1단계 완료", quarter: 2 },
        { label: "2단계 완료", quarter: 4 },
        { label: "목표 달성", quarter: 4 },
    ]

    return (
        <div className="overflow-x-auto rounded-lg border-2 border-gray-200 bg-white">
            <div className="min-w-[640px]">
                {/* Title */}
                <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
                    <h2 className="text-center text-lg font-bold tracking-wide text-gray-900">
                        커리어 로드맵
                    </h2>
                </div>

                {/* Timeline header */}
                <div className="grid grid-cols-[180px_1fr_1fr_1fr_1fr] border-b border-gray-200">
                    <div className="border-r border-gray-200 bg-gray-50/80 px-3 py-2 text-xs font-semibold text-gray-500">
                        구분
                    </div>
                    {QUARTERS.map((q, i) => (
                        <div
                            key={q}
                            className={cn(
                                "px-3 py-2 text-center text-sm font-bold border-r border-gray-200 last:border-r-0",
                                QUARTER_COLORS[i]
                            )}
                        >
                            {year} {q}
                        </div>
                    ))}
                </div>

                {/* Milestones row */}
                <div className="grid grid-cols-[180px_1fr_1fr_1fr_1fr] border-b border-gray-200">
                    <div className="border-r border-gray-200 bg-gray-50/60 px-3 py-3">
                        <p className="text-xs font-semibold text-gray-500">목표 달성율</p>
                        <p className="text-[10px] text-gray-400">주요 시점</p>
                    </div>
                    {[1, 2, 3, 4].map((q) => {
                        const items = milestones.filter((m) => m.quarter === q)
                        return (
                            <div
                                key={q}
                                className="flex flex-wrap items-center justify-center gap-1 border-r border-gray-100 p-2 last:border-r-0 min-h-[52px]"
                            >
                                {items.map((m, i) => (
                                    <span
                                        key={i}
                                        className="inline-flex items-center gap-1 rounded bg-white px-2 py-1 text-[10px] font-medium text-gray-700 shadow-sm border border-gray-200"
                                        title={m.label}
                                    >
                                        {q === 2 ? <CheckCircle2 className="h-3 w-3 text-emerald-600" /> : q === 4 ? <Star className="h-3 w-3 text-amber-500" /> : <Send className="h-3 w-3 text-sky-500" />}
                                        {m.label}
                                    </span>
                                ))}
                            </div>
                        )
                    })}
                </div>

                {/* Phase rows (bars) */}
                {steps.slice(0, 3).map((step, idx) => {
                    const [startQ, endQ] = STEP_QUARTER_RANGE[idx] ?? [1, 1]
                    const start = (startQ - 1) / 4
                    const width = (endQ - startQ + 1) / 4
                    const barColor = ROW_BAR_COLORS[idx % ROW_BAR_COLORS.length]
                    const termLabel = ["단기 (1~3개월)", "중기 (3~12개월)", "장기 (1년+)"][idx]

                    return (
                        <div
                            key={step.id}
                            className="grid grid-cols-[180px_1fr_1fr_1fr_1fr] border-b border-gray-100 last:border-b-0"
                        >
                            <div className="border-r border-gray-200 bg-gray-50/60 px-3 py-2 flex flex-col justify-center">
                                <p className="text-xs font-semibold text-gray-700">{termLabel}</p>
                                <p className="text-[10px] text-gray-500 truncate" title={step.title}>{step.title}</p>
                            </div>
                            <div className="col-span-4 flex items-center border-r border-gray-100 p-2">
                                <div className="relative w-full h-8 flex items-center">
                                    <div
                                        className={cn(
                                            "absolute h-7 rounded-md border flex items-center px-2 text-xs font-medium text-gray-800 truncate",
                                            barColor
                                        )}
                                        style={{
                                            left: `${start * 100}%`,
                                            width: `${width * 100}%`,
                                        }}
                                        title={step.description}
                                    >
                                        {step.title}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
