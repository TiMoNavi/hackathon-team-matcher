"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.77.43 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

type Errors = { email?: string; password?: string };

function validate(email: string, password: string): Errors {
  const errors: Errors = {};
  if (!email) errors.email = "Enter your work email.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "That email doesn’t look right.";
  if (!password) errors.password = "Enter your password.";
  else if (password.length < 8) errors.password = "Passwords are at least 8 characters.";
  return errors;
}

const fieldClass =
  "h-11 rounded-xl bg-background px-3.5 text-[15px] shadow-none md:text-[15px] aria-invalid:border-destructive";

export function LoginForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const next = validate(email, password);
    setErrors(next);
    if (Object.keys(next).length) return;

    setPending(true);
    // Placeholder for a real auth call (e.g. your auth provider's signIn).
    // Until one is connected, any valid-looking email/password continues.
    await new Promise((r) => setTimeout(r, 800));
    router.push("/");
  }

  return (
    <div className="flex w-full max-w-[400px] flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-[32px] leading-[1.1] font-semibold tracking-[-0.04em] text-foreground md:text-[36px]">
          Welcome back
        </h1>
        <p className="text-[15px] leading-[24px] text-muted-foreground">
          Sign in to see what your customers are saying today.
        </p>
      </div>

      <div className="grid gap-3">
        <Button type="button" variant="outline" size="xl" className="w-full font-medium shadow-none">
          <GoogleIcon />
          Continue with Google
        </Button>
        <Button type="button" variant="outline" size="xl" className="w-full font-medium shadow-none">
          <KeyRound />
          Continue with SSO
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-[13px] text-muted-foreground">or sign in with email</span>
        <Separator className="flex-1" />
      </div>

      <form noValidate onSubmit={onSubmit} className="grid gap-5">
        <div className="grid gap-2">
          <Label htmlFor="email" className="text-[14px]">
            Work email
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
            className={fieldClass}
          />
          {errors.email && (
            <p id="email-error" className="text-[13px] text-destructive">
              {errors.email}
            </p>
          )}
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-[14px]">
              Password
            </Label>
            <Link href="#" className="text-[13px] font-medium text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="At least 8 characters"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? "password-error" : undefined}
              className={cn(fieldClass, "pr-11")}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground hover:bg-transparent hover:text-foreground"
            >
              {showPassword ? <EyeOff /> : <Eye />}
            </Button>
          </div>
          {errors.password && (
            <p id="password-error" className="text-[13px] text-destructive">
              {errors.password}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <Checkbox id="remember" name="remember" defaultChecked />
          <Label htmlFor="remember" className="text-[14px] font-normal text-body">
            Keep me signed in for 30 days
          </Label>
        </div>

        <Button
          type="submit"
          size="xl"
          disabled={pending}
          className="mt-1 w-full shadow-[0_10px_30px_-10px_rgba(91,61,245,0.7)] hover:bg-primary/90"
        >
          {pending && <Loader2 className="animate-spin" />}
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="text-center text-[14px] text-muted-foreground">
        New to Signalry?{" "}
        <Link href="/#pricing" className="font-semibold text-primary hover:underline">
          Start free
        </Link>
      </p>
    </div>
  );
}
