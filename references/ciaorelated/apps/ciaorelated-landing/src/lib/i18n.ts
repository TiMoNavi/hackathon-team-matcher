import { createContext, useContext } from "react";

export type Lang = "en" | "de";

const _translations = {
  en: {
    nav: {
      features: "Features",
      community: "Community",
      privacy: "Privacy",
      opensource: "Open source",
      download: "Get the app",
    },
    hero: {
      eyebrow: "Social moments for real communities",
      title: "Connect through real groups, real events, and shared moments.",
      subtitle:
        "Group chats, shared moments, and event feeds in one place. Create spaces for friends, families, local communities, and events.",
      ctaPrimary: "Download the app",
      ctaSecondary: "See how it works",
      tag: "Made for real life, not feeds",
    },
    sections: {
      feedTitle: "A feed that finally feels personal",
      feedSub: "Moments shared in context — only with the people they're meant for.",
      groupsTitle: "Groups and chats with a sense of place",
      groupsSub: "Spin up a space for your team, your family, or your block. Conversation that stays warm.",
      eventsTitle: "Events and local communities",
      eventsSub: "Discover what's happening nearby, RSVP in a tap, and meet people who care about the same things.",
      inviteTitle: "Invite with a single link",
      inviteSub: "Share a link or QR code. People land in the right group with the right context — no friction.",
      trustTitle: "Privacy and moderation built in",
      trustSub: "Private by default. Clear moderation tools. No ads dragging your feed somewhere you didn't ask to go.",
      trustPrivateTitle: "Private by default",
      trustPrivateSub: "Spaces are invite-only. You decide who's in.",
      trustModerationTitle: "Real moderation",
      trustModerationSub: "Clear tools for hosts. Less noise, more signal.",
      trustNoTrapsTitle: "No engagement traps",
      trustNoTrapsSub: "No ads, no algorithmic doomscroll.",
      ossTitle: "Built openly",
      ossSub: "Open source and crafted with React Native, Expo, Node.js, GraphQL, Prisma, and PostgreSQL.",
      ossCta: "View on GitHub",
      downloadTitle: "Download the app",
      downloadSub: "Get the app from the App Store or Google Play.",
    },
    join: {
      title: "You're invited",
      sub: "Open this invitation in the ciaorelated app to join the group.",
      status: "Checking invitation…",
      slugLabel: "Invitation code",
      openApp: "Open in app",
      download: "Download app",
      copy: "Copy link",
      copied: "Link copied",
      help: "If the app didn't open, install ciaorelated and tap the link again.",
    },
    footer: {
      tagline: "Social moments for real communities.",
      product: "Product",
      legal: "Legal",
      language: "Language",
      rights: "All rights reserved.",
      support: "Support",
      privacy: "Privacy",
      terms: "Terms",
      guidelines: "Guidelines",
    },
    legal: {
      lastUpdated: "Last updated",
      backHome: "Back to home",
    },
    campaign: {
      title: "Download the app",
      sub: "Get the app from the App Store or Google Play.",
      openOnPhone: "Open this page on your phone",
      openLink: "Open link",
      noStores: "No store link is currently set.",
    },
  },
  de: {
    nav: {
      features: "Funktionen",
      community: "Community",
      privacy: "Datenschutz",
      opensource: "Open Source",
      download: "App laden",
    },
    hero: {
      eyebrow: "Soziale Momente für echte Communities",
      title: "Verbinde dich durch echte Gruppen, echte Events und gemeinsame Momente.",
      subtitle:
        "Gruppenchats, geteilte Momente und Event-Feeds an einem Ort. Räume für Freunde, Familien, lokale Communities und Events.",
      ctaPrimary: "App herunterladen",
      ctaSecondary: "So funktioniert's",
      tag: "Für das echte Leben, nicht für Feeds",
    },
    sections: {
      feedTitle: "Ein Feed, der sich endlich persönlich anfühlt",
      feedSub: "Momente im richtigen Kontext geteilt — nur mit den Menschen, für die sie bestimmt sind.",
      groupsTitle: "Gruppen und Chats mit Ortsgefühl",
      groupsSub: "Starte einen Raum für dein Team, deine Familie oder deine Nachbarschaft. Gespräche, die warm bleiben.",
      eventsTitle: "Events und lokale Communities",
      eventsSub: "Entdecke, was in deiner Nähe passiert, sage mit einem Tap zu und triff Menschen mit denselben Interessen.",
      inviteTitle: "Einladen mit einem einzigen Link",
      inviteSub: "Teile einen Link oder QR-Code. Menschen landen direkt in der richtigen Gruppe — ohne Reibung.",
      trustTitle: "Datenschutz und Moderation von Anfang an",
      trustSub: "Privat by default. Klare Moderationswerkzeuge. Keine Werbung, die deinen Feed verzerrt.",
      trustPrivateTitle: "Standardmäßig privat",
      trustPrivateSub: "Räume sind nur per Einladung zugänglich. Du entscheidest, wer dabei ist.",
      trustModerationTitle: "Echte Moderation",
      trustModerationSub: "Klare Werkzeuge für Admins. Weniger Rauschen, mehr Relevanz.",
      trustNoTrapsTitle: "Keine Engagement-Fallen",
      trustNoTrapsSub: "Keine Werbung, kein algorithmisches Endlos-Scrollen.",
      ossTitle: "Offen gebaut",
      ossSub: "Open Source – entwickelt mit React Native, Expo, Node.js, GraphQL, Prisma und PostgreSQL.",
      ossCta: "Auf GitHub ansehen",
      downloadTitle: "App herunterladen",
      downloadSub: "Lade die App im App Store oder bei Google Play herunter.",
    },
    join: {
      title: "Du bist eingeladen",
      sub: "Öffne diese Einladung in der ciaorelated App, um der Gruppe beizutreten.",
      status: "Einladung wird geprüft…",
      slugLabel: "Einladungscode",
      openApp: "In App öffnen",
      download: "App laden",
      copy: "Link kopieren",
      copied: "Link kopiert",
      help: "Wenn die App nicht geöffnet wurde, installiere ciaorelated und tippe den Link erneut an.",
    },
    footer: {
      tagline: "Soziale Momente für echte Communities.",
      product: "Produkt",
      legal: "Rechtliches",
      language: "Sprache",
      rights: "Alle Rechte vorbehalten.",
      support: "Support",
      privacy: "Datenschutz",
      terms: "AGB",
      guidelines: "Richtlinien",
    },
    legal: {
      lastUpdated: "Zuletzt aktualisiert",
      backHome: "Zurück zur Startseite",
    },
    campaign: {
      title: "App herunterladen",
      sub: "Lade die App im App Store oder bei Google Play herunter.",
      openOnPhone: "Diese Seite am Handy öffnen",
      openLink: "Link öffnen",
      noStores: "Aktuell ist kein Store-Link hinterlegt.",
    },
  },
} as const;

export type Dict = typeof _translations["en"];
export const translations: Record<Lang, Dict> = _translations as unknown as Record<Lang, Dict>;

export const I18nContext = createContext<{
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Dict;
}>({
  lang: "en",
  setLang: () => {},
  t: translations.en,
});

export const useI18n = () => useContext(I18nContext);
