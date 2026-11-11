import { createFileRoute } from "@tanstack/react-router";
import { LegalPageLayout, LegalSection } from "@/components/site/LegalPageLayout";
import { brand, brandTitle } from "@/lib/brand";

export const Route = createFileRoute("/guidelines-de.html")({
  head: () => ({
    meta: [
      { title: brandTitle("Community-Richtlinien") },
      { name: "description", content: `So bleibt ${brand.appName} freundlich und nützlich.` },
    ],
  }),
  component: GuidelinesDePage,
});

function GuidelinesDePage() {
  return (
    <LegalPageLayout
      title="Community-Richtlinien"
      lastUpdated=""
      related={[
        { href: "/guidelines.html", label: "English" },
        { href: "/terms-de.html", label: "Nutzungsbedingungen" },
        { href: "/privacy-de.html", label: "Datenschutzerklärung" },
      ]}
    >
      <p className="text-muted-foreground">
        Damit <strong>{brand.appName}</strong> für alle ein sicherer Ort bleibt, gelten folgende Regeln:
      </p>
      <LegalSection heading="1. Respekt & Sicherheit">
        <p>Behandle andere Nutzer:innen mit Respekt. Keine Belästigungen, Drohungen oder Hassrede.</p>
      </LegalSection>
      <LegalSection heading="2. Inhalte">
        <ul className="list-disc space-y-1 pl-6">
          <li>Keine pornografischen oder gewaltverherrlichenden Inhalte.</li>
          <li>Keine Aufrufe zu illegalen Aktivitäten.</li>
          <li>Keine Spam- oder Werbe-Inhalte ohne Genehmigung.</li>
        </ul>
      </LegalSection>
      <LegalSection heading="3. Meldungen">
        <p>Verwende die Melden-Funktion bei problematischen Inhalten. Wir prüfen und reagieren innerhalb von 24 h.</p>
      </LegalSection>
    </LegalPageLayout>
  );
}
