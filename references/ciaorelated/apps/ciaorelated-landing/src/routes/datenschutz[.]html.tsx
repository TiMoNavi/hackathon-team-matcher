import { createFileRoute } from "@tanstack/react-router";
import { LegalPageLayout, LegalSection } from "@/components/site/LegalPageLayout";
import { brand, brandTitle } from "@/lib/brand";

export const Route = createFileRoute("/datenschutz.html")({
  head: () => ({
    meta: [
      { title: brandTitle("Datenschutz") },
      { name: "description", content: `Datenschutzerklärung — ${brand.appName}.` },
    ],
  }),
  component: DatenschutzPage,
});

function DatenschutzPage() {
  return (
    <LegalPageLayout
      title="Datenschutzerklärung"
      lastUpdated=""
      related={[
        { href: "/privacy-de.html", label: "Datenschutzerklärung" },
        { href: "/terms-de.html", label: "Nutzungsbedingungen" },
        { href: "/guidelines-de.html", label: "Community-Richtlinien" },
      ]}
    >
      <p className="text-muted-foreground">
        Diese Datenschutzerklärung informiert dich über die Verarbeitung personenbezogener Daten bei Nutzung von <strong>{brand.appName}</strong> und dieser Website.
      </p>
      <LegalSection heading="1. Verantwortlicher">
        <p>
          {brand.legalEntity}
          {brand.legalAddress ? <><br />{brand.legalAddress}</> : null}
          <br />E-Mail: <span>{brand.supportEmail}</span>
        </p>
      </LegalSection>
      <LegalSection heading="2. Verarbeitete Daten & Zwecke">
        <ul className="list-disc space-y-1 pl-6">
          <li><strong>Nutzungsdaten</strong> (IP-Adresse, Geräteinfos) zur Bereitstellung & Sicherheit.</li>
          <li><strong>Kontodaten</strong> (Benutzername, E-Mail) für Registrierung & Verwaltung.</li>
          <li><strong>Inhalte</strong> (Fotos, Kommentare) für Social-Funktionen.</li>
          <li><strong>Supportdaten</strong> (Anfragen) zur Bearbeitung von Supportfällen.</li>
          <li><strong>Analysedaten</strong> (anonym/aggregiert) zur Produktverbesserung (optional).</li>
        </ul>
      </LegalSection>
      <LegalSection heading="3. Rechtsgrundlagen">
        <p>Art. 6 Abs. 1 lit. b DSGVO (Vertrag), lit. f (berechtigte Interessen: Sicherheit, Verbesserung), lit. a (Einwilligung, z. B. bei optionalen Analysen).</p>
      </LegalSection>
      <LegalSection heading="4. Speicherung & Löschung">
        <p>Speicherung nur solange erforderlich bzw. gesetzlich geboten, danach Löschung/Anonymisierung.</p>
      </LegalSection>
      <LegalSection heading="5. Empfänger & Drittlandtransfers">
        <p>Hosting bei DigitalOcean oder EU/EEA-Anbietern. Bei Transfer in Drittländer sorgen wir für geeignete Garantien (Standardvertragsklauseln).</p>
      </LegalSection>
      <LegalSection heading="6. Cookies & lokale Speicherung">
        <p>Nur technisch notwendige Cookies; optionale Analyse-/Marketing-Cookies nur mit Einwilligung.</p>
      </LegalSection>
      <LegalSection heading="7. Logfiles & Sicherheit">
        <p>Kurzzeitige Server-Logfiles zur Fehlersuche & Sicherheit. Übliche Schutzmaßnahmen (HTTPS, Zugriffskontrollen).</p>
      </LegalSection>
    </LegalPageLayout>
  );
}
