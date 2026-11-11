import { createFileRoute } from "@tanstack/react-router";
import { LegalPageLayout, LegalSection } from "@/components/site/LegalPageLayout";
import { brand, brandTitle } from "@/lib/brand";

export const Route = createFileRoute("/terms.html")({
  head: () => ({
    meta: [
      { title: brandTitle("Terms of Service") },
      { name: "description", content: `Terms for using ${brand.appName}.` },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPageLayout
      title="Terms of Service"
      lastUpdated="Sep 2025"
      related={[
        { href: "/terms-de.html", label: "Deutsch" },
        { href: "/privacy.html", label: "Privacy Policy" },
        { href: "/guidelines.html", label: "Community Guidelines" },
      ]}
    >
      <p className="text-muted-foreground">
        These terms govern the use of <strong>{brand.appName}</strong>. By using the app, you agree to these terms.
      </p>
      <LegalSection heading="1. Registration & Account">
        <p>You must create an account to use {brand.appName}. Keep your login credentials secure. Multiple accounts or false information are not allowed.</p>
      </LegalSection>
      <LegalSection heading="2. Use of the App">
        <ul className="list-disc space-y-1 pl-6">
          <li>Use the app only in compliance with applicable law.</li>
          <li>Only share content you own or have the right to use.</li>
          <li>Respect other users - no harassment or hate speech.</li>
        </ul>
      </LegalSection>
      <LegalSection heading="3. Content & Rights">
        <p>You retain rights to your content but grant us a non-exclusive license to display and provide it within the app. We may remove content that violates our <a href="/guidelines.html" className="text-primary underline">Community Guidelines</a>.</p>
      </LegalSection>
      <LegalSection heading="4. Privacy">
        <p>We process personal data in accordance with our <a href="/privacy.html" className="text-primary underline">Privacy Policy</a>.</p>
      </LegalSection>
      <LegalSection heading="5. Liability">
        <p>{brand.appName} is not responsible for content created by users. We are not liable for damages arising from the use of the app, except in cases of gross negligence or intent.</p>
      </LegalSection>
      <LegalSection heading="6. Changes">
        <p>We may update these terms at any time. Users will be notified when a new version is available and must accept it to continue using the app.</p>
      </LegalSection>
      <LegalSection heading="7. Termination">
        <p>We reserve the right to suspend or delete accounts that violate these terms or our Community Guidelines.</p>
      </LegalSection>
    </LegalPageLayout>
  );
}
