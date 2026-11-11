import { createFileRoute } from "@tanstack/react-router";
import { LegalPageLayout, LegalSection } from "@/components/site/LegalPageLayout";
import { brand, brandTitle } from "@/lib/brand";

export const Route = createFileRoute("/guidelines.html")({
  head: () => ({
    meta: [
      { title: brandTitle("Community Guidelines") },
      { name: "description", content: `How we keep ${brand.appName} kind and useful.` },
    ],
  }),
  component: GuidelinesPage,
});

function GuidelinesPage() {
  return (
    <LegalPageLayout
      title="Community Guidelines"
      lastUpdated="February 2025"
      related={[
        { href: "/guidelines-de.html", label: "Deutsch" },
        { href: "/terms.html", label: "Terms of Service" },
        { href: "/privacy.html", label: "Privacy Policy" },
      ]}
    >
      <p className="text-muted-foreground">
        To keep <strong>{brand.appName}</strong> a safe and inspiring place for everyone, the following rules apply:
      </p>
      <LegalSection heading="1. Respect & Safety">
        <p>Treat others with respect. No harassment, threats, hate speech, or bullying.</p>
      </LegalSection>
      <LegalSection heading="2. Content">
        <ul className="list-disc space-y-1 pl-6">
          <li>No pornographic, sexually explicit, or glorification of violence.</li>
          <li>No promotion of illegal activities or dangerous behavior.</li>
          <li>No spam, unauthorized advertising, or fraudulent activity.</li>
          <li>No disinformation or manipulative content.</li>
          <li>Respect copyright – only upload content you own or are allowed to share.</li>
        </ul>
      </LegalSection>
      <LegalSection heading="3. Privacy">
        <p>Do not share sensitive information of yourself or others (e.g. addresses, phone numbers, private messages).</p>
      </LegalSection>
      <LegalSection heading="4. Reporting">
        <p>Use the reporting function for problematic content or behavior. Reports are usually reviewed within 24 hours.</p>
      </LegalSection>
      <LegalSection heading="5. Consequences">
        <p>Violations may result in content removal and temporary or permanent account suspension.</p>
      </LegalSection>
    </LegalPageLayout>
  );
}
