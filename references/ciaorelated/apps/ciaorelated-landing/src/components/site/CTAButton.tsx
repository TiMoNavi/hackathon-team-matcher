import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost";

const variants: Record<Variant, string> = {
  primary:
    "gradient-hero text-primary-foreground shadow-[var(--shadow-elegant)] hover:opacity-95",
  secondary:
    "glass-card text-foreground hover:bg-accent/40",
  ghost: "text-foreground hover:bg-accent/50",
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type CommonProps = { variant?: Variant; className?: string };

export const CTAButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & CommonProps
>(({ variant = "primary", className, ...props }, ref) => (
  <button ref={ref} className={cn(base, variants[variant], className)} {...props} />
));
CTAButton.displayName = "CTAButton";

export const CTALink = forwardRef<
  HTMLAnchorElement,
  AnchorHTMLAttributes<HTMLAnchorElement> & CommonProps
>(({ variant = "primary", className, ...props }, ref) => (
  <a ref={ref} className={cn(base, variants[variant], className)} {...props} />
));
CTALink.displayName = "CTALink";