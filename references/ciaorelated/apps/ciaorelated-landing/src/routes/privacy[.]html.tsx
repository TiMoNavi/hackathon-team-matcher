import { createFileRoute } from "@tanstack/react-router";
import { LegalPageLayout, LegalSection } from "@/components/site/LegalPageLayout";
import { brand, brandTitle } from "@/lib/brand";

export const Route = createFileRoute("/privacy.html")({
  head: () => ({
    meta: [
      { title: brandTitle("Privacy Policy") },
      { name: "description", content: `How ${brand.appName} handles your data.` },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPageLayout
      title="Privacy Policy"
      lastUpdated="Sep 2025"
      related={[
        { href: "/privacy-de.html", label: "Deutsch" },
        { href: "/terms.html", label: "Terms of Service" },
        { href: "/guidelines.html", label: "Community Guidelines" },
      ]}
    >
      <p className="text-muted-foreground">
        We value your privacy. This policy explains how <strong>{brand.appName}</strong> processes your information.
      </p>
      <LegalSection heading="1. Controller">
        <p>The controller of your data is {brand.legalEntity}. For questions, please contact us via the <a href="/support.html" className="text-primary underline">Support page</a>.</p>
      </LegalSection>
      <LegalSection heading="2. Data Collected">
        <ul className="list-disc space-y-1 pl-6">
          <li>Profile data (name, username, avatar, bio)</li>
          <li>Contact information (email address)</li>
          <li>Content you upload (posts, vlogs, stories)</li>
          <li>Usage data (interactions, logins, device information)</li>
        </ul>
      </LegalSection>
      <LegalSection heading="3. Purpose of Processing">
        <p>We use your data to:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>provide and manage the app and your account,</li>
          <li>display content and enable interactions,</li>
          <li>prevent abuse and ensure security,</li>
          <li>inform you about updates and changes.</li>
        </ul>
      </LegalSection>
      <LegalSection heading="4. Sharing">
        <p>We do not share your data with third parties, except when required by law or necessary for operation (e.g., hosting providers).</p>
      </LegalSection>
      <LegalSection heading="5. Storage & Security">
        <p>Your data is stored on secure servers. We use encryption and access restrictions to protect against unauthorized access.</p>
      </LegalSection>
      <LegalSection heading="6. Your Rights">
        <p>You have the right to access, correct, delete, restrict processing, and request portability of your data. Contact us to exercise these rights.</p>
      </LegalSection>
      <LegalSection heading="7. Changes">
        <p>We may update this Privacy Policy. Users will be notified when a new version applies.</p>
      </LegalSection>
    </LegalPageLayout>
  );
}
