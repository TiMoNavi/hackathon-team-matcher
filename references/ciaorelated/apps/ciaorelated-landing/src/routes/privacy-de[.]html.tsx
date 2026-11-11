import { createFileRoute } from "@tanstack/react-router";
import { LegalPageLayout, LegalSection } from "@/components/site/LegalPageLayout";
import { brand, brandTitle } from "@/lib/brand";

export const Route = createFileRoute("/privacy-de.html")({
  head: () => ({
    meta: [
      { title: brandTitle("Datenschutzerklärung") },
      { name: "description", content: `So geht ${brand.appName} mit deinen Daten um.` },
    ],
  }),
  component: PrivacyDePage,
});

function PrivacyDePage() {
  return (
    <LegalPageLayout
      title="Datenschutzerklärung"
      lastUpdated="September 2025"
      related={[
        { href: "/privacy.html", label: "English" },
        { href: "/terms-de.html", label: "Nutzungsbedingungen" },
        { href: "/guidelines-de.html", label: "Community-Richtlinien" },
      ]}
    >
      <p className="text-muted-foreground">
        Wir legen großen Wert auf den Schutz deiner Daten. Diese Erklärung erläutert, wie <strong>{brand.appName}</strong> deine Informationen verarbeitet.
      </p>
      <LegalSection heading="1. Verantwortlicher">
        <p>Verantwortlich für die Datenverarbeitung ist {brand.legalEntity}. Bei Fragen kontaktiere uns über die <a href="/support.html" className="text-primary underline">Support-Seite</a>.</p>
      </LegalSection>
      <LegalSection heading="2. Erhobene Daten">
        <ul className="list-disc space-y-1 pl-6">
          <li>Profildaten (Name, Nutzername, Avatar, Bio)</li>
          <li>Kontaktinformationen (E-Mail-Adresse)</li>
          <li>Inhalte, die du hochlädst (Posts, Vlogs, Stories)</li>
          <li>Nutzungsdaten (Interaktionen, Logins, Geräteinformationen)</li>
        </ul>
      </LegalSection>
      <LegalSection heading="3. Zweck der Verarbeitung">
        <p>Wir nutzen deine Daten, um:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>die App bereitzustellen und dein Profil zu verwalten,</li>
          <li>Inhalte anzuzeigen und Interaktionen zu ermöglichen,</li>
          <li>Missbrauch zu verhindern und Sicherheit zu gewährleisten,</li>
          <li>dich über Updates und Änderungen zu informieren.</li>
        </ul>
      </LegalSection>
      <LegalSection heading="4. Weitergabe">
        <p>Wir geben deine Daten nicht an Dritte weiter, außer wenn es gesetzlich vorgeschrieben ist oder für den Betrieb (z. B. Hosting) erforderlich ist.</p>
      </LegalSection>
      <LegalSection heading="5. Speicherung & Sicherheit">
        <p>Deine Daten werden auf sicheren Servern gespeichert. Wir nutzen Verschlüsselung und Zugriffsbeschränkungen, um unbefugten Zugriff zu verhindern.</p>
      </LegalSection>
      <LegalSection heading="6. Deine Rechte">
        <p>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung und Datenübertragbarkeit. Kontaktiere uns, um diese Rechte auszuüben.</p>
      </LegalSection>
      <LegalSection heading="7. Änderungen">
        <p>Wir können diese Datenschutzerklärung anpassen. Nutzer:innen werden informiert, wenn eine neue Version gilt.</p>
      </LegalSection>
    </LegalPageLayout>
  );
}
