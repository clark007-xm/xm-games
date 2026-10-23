import type { ReactNode } from "react"
import { AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

export function InlineNotice({ children, id, className }: { children: ReactNode; id?: string; className?: string }) {
  return (
    <div id={id} role="alert" aria-atomic="true" className={cn("flex max-w-full items-start gap-2 rounded-lg border border-amber-500 bg-amber-950 p-3 text-sm text-amber-100", className)}>
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 break-words">{children}</div>
    </div>
  )
}
