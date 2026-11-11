import { cn } from "@/lib/utils";
// Mark and typography adapted from Signalry components/logo.tsx.
export function Brand({ inverse = false }: { inverse?: boolean }) {
  return <span className="inline-flex shrink-0 items-center gap-2.5"><svg viewBox="0 0 32 32" className="size-9" aria-hidden="true"><rect width="32" height="32" rx="9" className="fill-primary" /><path d="M9 18.5a7 7 0 0 1 14 0M12.5 18.5a3.5 3.5 0 0 1 7 0" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" /><circle cx="16" cy="18.5" r="1.6" className="fill-lime" /></svg><span className={cn("font-heading text-[23px] font-bold tracking-[-0.03em]", inverse ? "text-white" : "text-foreground")}>同频<span className="ml-2 hidden text-[15px] font-medium tracking-[-0.03em] sm:inline">Team Matcher</span></span></span>;
}
