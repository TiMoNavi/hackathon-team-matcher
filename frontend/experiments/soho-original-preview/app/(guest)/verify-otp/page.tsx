import type { Metadata } from "next";
import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import OtpForm from "./components/otp-form";

export const metadata: Metadata = {
  title: "Two-Step Verification",
};

export default function Page() {
  return (
    <>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Two-step verification</CardTitle>
          <CardDescription>
            Enter the 6-digit code we sent to{" "}
            <span className="font-medium text-foreground">m•••@example.com</span>{" "}
            to confirm it&apos;s you
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OtpForm />
        </CardContent>
      </Card>
      <p className="text-center text-sm text-muted-foreground">
        Wrong account?{" "}
        <Link
          href="/login"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </>
  );
}
