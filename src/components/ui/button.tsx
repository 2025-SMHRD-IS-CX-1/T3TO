import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

// Note: Radix UI Slot is optional but good for composition. 
// Since I haven't installed @radix-ui/react-slot, I'll implement a simpler version or just not use Slot for now unless specifically requested. 
// To keep it simple and autonomous without extra installs, I'll stick to standard props, but standard Shadcn-like pattern suggests Slot.
// I'll install @radix-ui/react-slot and class-variance-authority for robust component design.

// Wait, I shouldn't rely on uninstalled packages. I'll do a quick install of cva and slot if I want to use this pattern.
// Or I can write vanilla Tailwind variations. given strict design.json, cva is excellent.
// I will start the component creation assuming I will install them. I'll add a command to install them.
// Actually, for now, let's just write the code assuming CVA is available and I'll run the install command in parallel.

const buttonVariants = cva(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold tracking-tight ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:translate-y-[1px]",
    {
        variants: {
            variant: {
                // Lovable 스타일: 둥근 그라디언트 버튼, 살짝 강한 그림자
                primary:
                    "bg-gradient-to-r from-purple-700 to-purple-500 text-white shadow-[0_12px_30px_rgba(129,140,248,0.55)] hover:shadow-[0_16px_40px_rgba(129,140,248,0.65)] hover:brightness-105",
                secondary:
                    "bg-white text-purple-700 border border-purple-200 hover:bg-purple-50 hover:border-purple-300 shadow-sm hover:shadow-md",
                text: "bg-transparent text-purple-700 hover:bg-purple-50",
                ghost: "bg-transparent text-gray-700 hover:bg-gray-100",
                link: "bg-transparent text-purple-700 underline-offset-4 hover:underline",
                destructive:
                    "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-[0_10px_25px_rgba(239,68,68,0.45)] hover:shadow-[0_14px_32px_rgba(239,68,68,0.6)]",
                outline:
                    "bg-transparent text-purple-700 border border-purple-300 hover:bg-purple-50 hover:border-purple-400",
            },
            size: {
                default: "h-11 px-5",
                sm: "h-9 px-4 text-xs rounded-full",
                lg: "h-12 px-7 text-base rounded-full",
                icon: "h-10 w-10 rounded-full",
            },
        },
        defaultVariants: {
            variant: "primary",
            size: "default",
        },
    }
)

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
    asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, ...props }, ref) => {
        // Hydration 에러 방지: asChild 사용 시 클라이언트에서만 렌더링
        const [mounted, setMounted] = React.useState(false)
        React.useEffect(() => {
            setMounted(true)
        }, [])

        const Comp = asChild ? Slot : "button"
        
        // 서버 사이드에서는 항상 button 사용 (hydration 에러 방지)
        if (!mounted && asChild) {
            return (
                <button
                    className={cn(buttonVariants({ variant, size, className }))}
                    ref={ref}
                    {...props}
                />
            )
        }
        
        return (
            <Comp
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                {...props}
            />
        )
    }
)
Button.displayName = "Button"

export { Button, buttonVariants }
