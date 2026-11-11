import { createFileRoute } from "@tanstack/react-router";
import { LegalPageLayout, LegalSection } from "@/components/site/LegalPageLayout";
import { brand, brandTitle } from "@/lib/brand";

export const Route = createFileRoute("/support.html")({
  head: () => ({
    meta: [
      { title: brandTitle("Support") },
      { name: "description", content: `Get help with ${brand.appName}.` },
    ],
  }),
  component: SupportPage,
});

function SupportPage() {
  return (
    <LegalPageLayout
      title="Support"
      lastUpdated="2026-01-01"
      related={[
        { href: "/privacy.html", label: "Privacy Policy" },
        { href: "/terms.html", label: "Terms of Service" },
        { href: "/guidelines.html", label: "Community Guidelines" },
      ]}
    >
      <LegalSection heading="Need a hand?">
        <p>
          We're a small team. Reach out at <a className="text-primary underline" href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a> and
          we'll get back to you as soon as we can.
        </p>
      </LegalSection>
      <LegalSection heading="Common questions">
        <p><strong>I can't sign in.</strong> Make sure you're on the latest version of the app and try again.</p>
        <p><strong>I want to delete my account.</strong> Open the app, go to Settings → Account → Delete account.</p>
        <p><strong>I have a moderation concern.</strong> Use the in-app report button, or email us directly.</p>
      </LegalSection>
      <LegalSection heading="Press and partnerships">
        <p>
          For press inquiries write to <a className="text-primary underline" href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>.
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
