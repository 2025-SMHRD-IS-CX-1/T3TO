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
    "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
    {
        variants: {
            variant: {
                primary: "bg-purple-700 text-white hover:bg-purple-800 shadow-sm",
                secondary: "bg-white text-purple-700 border border-purple-700 hover:bg-purple-100",
                text: "bg-transparent text-purple-700 hover:bg-purple-100",
                ghost: "hover:bg-accent hover:text-accent-foreground",
                link: "text-primary underline-offset-4 hover:underline",
                destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
                outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
            },
            size: {
                default: "h-10 px-4 py-2",
                sm: "h-9 rounded-md px-3",
                lg: "h-11 rounded-md px-8",
                icon: "h-10 w-10",
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
        const Comp = asChild ? Slot : "button"
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
