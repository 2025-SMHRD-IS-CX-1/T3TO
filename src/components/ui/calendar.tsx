"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"
import { ko } from "date-fns/locale"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
    className,
    classNames,
    showOutsideDays = true,
    ...props
}: CalendarProps) {
    return (
        <DayPicker
            showOutsideDays={showOutsideDays}
            locale={ko}
            className={cn("p-3", className)}
            classNames={{
                months: "flex flex-col space-y-4 w-full",
                month: "space-y-4 w-full",
                month_caption: "flex justify-center pt-1 relative items-center mb-6",
                caption_label: "text-lg font-bold text-gray-900 px-4 py-1.5 bg-purple-50 rounded-full",
                nav: "flex items-center gap-1 absolute inset-x-0 justify-between pointer-events-none px-2",
                button_previous: cn(
                    buttonVariants({ variant: "ghost" }),
                    "h-9 w-9 p-0 opacity-50 hover:opacity-100 pointer-events-auto text-purple-600"
                ),
                button_next: cn(
                    buttonVariants({ variant: "ghost" }),
                    "h-9 w-9 p-0 opacity-50 hover:opacity-100 pointer-events-auto text-purple-600"
                ),
                month_grid: "w-full border-collapse",
                weekdays: "flex w-full mb-4",
                weekday:
                    "text-purple-400 w-full font-bold text-[0.9rem] flex items-center justify-center uppercase tracking-wider",
                week: "flex w-full mt-2",
                day: "flex-1 text-center text-sm p-0 relative h-16 flex items-center justify-center",
                day_button: cn(
                    buttonVariants({ variant: "ghost" }),
                    "h-14 w-14 p-0 font-semibold rounded-xl transition-all flex flex-col items-center justify-center relative hover:bg-purple-50 text-gray-700"
                ),
                selected:
                    "bg-purple-600 text-white hover:bg-purple-700 hover:text-white focus:bg-purple-600 focus:text-white shadow-lg ring-4 ring-purple-100",
                today: "after:content-[''] after:absolute after:bottom-2 after:w-1.5 after:h-1.5 after:bg-purple-400 after:rounded-full font-black text-purple-900",
                outside:
                    "text-gray-300 opacity-40",
                disabled: "text-gray-200 opacity-20",
                hidden: "invisible",
                ...classNames,
            }}
            components={{
                Chevron: ({ ...props }) => {
                    if (props.orientation === 'left') {
                        return <ChevronLeft className="h-4 w-4" />
                    }
                    return <ChevronRight className="h-4 w-4" />
                }
            }}
            {...props}
        />
    )
}
Calendar.displayName = "Calendar"

export { Calendar }
