import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/logo";
import { LoginForm } from "@/components/login-form";
import { LoginShowcase } from "@/components/login-showcase";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Sign in | Signalry",
  description: "Sign in to your Signalry workspace.",
};

export default function LoginPage() {
  return (
    <main className="grid min-h-svh bg-background lg:grid-cols-2">
      <div className="flex flex-col px-6 py-6 md:px-10 md:py-8">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-[22px]" aria-label="Signalry home">
            <Logo />
          </Link>
          <Button
            asChild
            variant="ghost"
            className="h-auto px-2 py-1.5 text-[14px] font-normal text-muted-foreground hover:bg-transparent hover:text-primary"
          >
            <Link href="/">
              <ArrowLeft />
              Back to site
            </Link>
          </Button>
        </div>

        <div className="flex flex-1 items-center justify-center py-12">
          <LoginForm />
        </div>

        <p className="text-center text-[13px] text-muted-foreground lg:text-left">
          © 2026 Signalry Inc. ·{" "}
          <a href="#" className="hover:text-primary">
            Terms
          </a>{" "}
          ·{" "}
          <a href="#" className="hover:text-primary">
            Privacy
          </a>
        </p>
      </div>

      <div className="hidden p-3 lg:block">
        <LoginShowcase />
      </div>
    </main>
  );
}
