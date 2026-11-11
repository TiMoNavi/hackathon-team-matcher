export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={"inline-flex items-center gap-2 " + className}>
      <svg viewBox="0 0 32 32" className="h-[1.6em] w-[1.6em]" aria-hidden>
        <rect width="32" height="32" rx="9" className="fill-primary" />
        <path
          d="M9 18.5a7 7 0 0 1 14 0M12.5 18.5a3.5 3.5 0 0 1 7 0"
          fill="none"
          stroke="white"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <circle cx="16" cy="18.5" r="1.6" className="fill-lime" />
      </svg>
      <span className="font-heading font-bold tracking-[-0.04em] text-foreground">Signalry</span>
    </span>
  );
}
