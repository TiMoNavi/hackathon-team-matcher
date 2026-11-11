"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;

export default function OtpForm() {
  const router = useRouter();
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);

  const code = digits.join("");
  const isComplete = code.length === OTP_LENGTH;

  useEffect(() => {
    if (secondsLeft <= 0) return;

    const timer = setInterval(() => {
      setSecondsLeft((value) => value - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [secondsLeft]);

  const setDigit = (index: number, value: string) => {
    setDigits((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });
  };

  const handleChange = (index: number, value: string) => {
    const cleaned = value.replace(/\D/g, "");

    if (!cleaned) {
      setDigit(index, "");
      return;
    }

    // Typing may produce multiple characters (e.g. autofill)
    const chars = cleaned.slice(0, OTP_LENGTH - index).split("");
    setDigits((current) => {
      const next = [...current];
      chars.forEach((char, offset) => {
        next[index + offset] = char;
      });
      return next;
    });

    const nextIndex = Math.min(index + chars.length, OTP_LENGTH - 1);
    inputRefs.current[nextIndex]?.focus();
  };

  const handleKeyDown = (
    index: number,
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === "Backspace") {
      if (digits[index]) {
        setDigit(index, "");
      } else if (index > 0) {
        setDigit(index - 1, "");
        inputRefs.current[index - 1]?.focus();
      }
      event.preventDefault();
    } else if (event.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
      event.preventDefault();
    } else if (event.key === "ArrowRight" && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
      event.preventDefault();
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = event.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, OTP_LENGTH);

    if (!pasted) return;

    setDigits(
      Array.from({ length: OTP_LENGTH }, (_, i) => pasted[i] ?? "")
    );
    inputRefs.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus();
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isComplete) return;
    router.push("/");
  };

  const handleResend = () => {
    setDigits(Array(OTP_LENGTH).fill(""));
    setSecondsLeft(RESEND_SECONDS);
    inputRefs.current[0]?.focus();
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex justify-center gap-2">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => {
              inputRefs.current[index] = el;
            }}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            maxLength={OTP_LENGTH}
            value={digit}
            aria-label={`Digit ${index + 1}`}
            onChange={(event) => handleChange(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onPaste={handlePaste}
            onFocus={(event) => event.target.select()}
            className={cn(
              "size-11 rounded-lg border border-input bg-transparent text-center text-lg font-semibold shadow-xs transition-colors outline-none",
              "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
              digit && "border-primary/40"
            )}
          />
        ))}
      </div>
      <Button type="submit" className="w-full" disabled={!isComplete}>
        Verify code
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Didn&apos;t receive a code?{" "}
        {secondsLeft > 0 ? (
          <span className="tabular-nums">Resend in 0:{String(secondsLeft).padStart(2, "0")}</span>
        ) : (
          <button
            type="button"
            onClick={handleResend}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Resend code
          </button>
        )}
      </p>
    </form>
  );
}
