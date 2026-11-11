import { createFileRoute } from "@tanstack/react-router";
import { LegalPageLayout, LegalSection } from "@/components/site/LegalPageLayout";
import { brand, brandTitle } from "@/lib/brand";

export const Route = createFileRoute("/terms-de.html")({
  head: () => ({
    meta: [
      { title: brandTitle("Nutzungsbedingungen") },
      { name: "description", content: `Nutzungsbedingungen von ${brand.appName}.` },
    ],
  }),
  component: TermsDePage,
});

function TermsDePage() {
  return (
    <LegalPageLayout
      title="Nutzungsbedingungen"
      lastUpdated="September 2025"
      related={[
        { href: "/terms.html", label: "English" },
        { href: "/privacy-de.html", label: "Datenschutzerklärung" },
        { href: "/guidelines-de.html", label: "Community-Richtlinien" },
      ]}
    >
      <p className="text-muted-foreground">
        Diese Bedingungen regeln die Nutzung von <strong>{brand.appName}</strong>. Durch die Nutzung erklärst du dich mit diesen Bedingungen einverstanden.
      </p>
      <LegalSection heading="1. Registrierung & Konto">
        <p>Du musst ein Konto erstellen, um {brand.appName} nutzen zu können. Deine Zugangsdaten müssen vertraulich behandelt werden. Mehrere Konten oder falsche Angaben sind nicht erlaubt.</p>
      </LegalSection>
      <LegalSection heading="2. Nutzung der App">
        <ul className="list-disc space-y-1 pl-6">
          <li>Verwende die App nur im Einklang mit geltendem Recht.</li>
          <li>Teile nur Inhalte, an denen du die Rechte hast.</li>
          <li>Respektiere andere Nutzer:innen – keine Belästigung oder Hassrede.</li>
        </ul>
      </LegalSection>
      <LegalSection heading="3. Inhalte & Rechte">
        <p>Du behältst die Rechte an deinen Inhalten, erteilst uns jedoch eine nicht-exklusive Lizenz, sie in der App anzuzeigen und bereitzustellen. Wir können Inhalte entfernen, die gegen unsere <a href="/guidelines-de.html" className="text-primary underline">Community-Richtlinien</a> verstoßen.</p>
      </LegalSection>
      <LegalSection heading="4. Datenschutz">
        <p>Wir verarbeiten personenbezogene Daten gemäß unserer <a href="/privacy-de.html" className="text-primary underline">Datenschutzerklärung</a>.</p>
      </LegalSection>
      <LegalSection heading="5. Haftung">
        <p>{brand.appName} übernimmt keine Verantwortung für von Nutzern erstellte Inhalte. Wir haften nicht für Schäden, die durch die Nutzung der App entstehen, außer bei grober Fahrlässigkeit oder Vorsatz.</p>
      </LegalSection>
      <LegalSection heading="6. Änderungen">
        <p>Wir können diese Nutzungsbedingungen jederzeit ändern. Nutzer:innen werden informiert, wenn eine neue Version vorliegt, und müssen diese akzeptieren, um die App weiter zu verwenden.</p>
      </LegalSection>
      <LegalSection heading="7. Kündigung">
        <p>Wir behalten uns das Recht vor, Konten bei Verstößen gegen diese Bedingungen oder die Community-Richtlinien zu sperren oder zu löschen.</p>
      </LegalSection>
    </LegalPageLayout>
  );
}
