# Community-Release: Abnahme und Aktivierung

Status: lokal vorbereitet, noch nicht produktiv freigegeben. Diese Datei ist ein
Ablaufplan, keine bereits ausgefuehrte Veroeffentlichung. Nur im Projekt
`ciaorelated` arbeiten. `songverwandt` ist nicht das Arbeitsverzeichnis.

## Lokal verifiziert

- App- und Backend-Typecheck erfolgreich.
- 112 Tests auf einer frisch erzeugten PostgreSQL-14.17-Testdatenbank erfolgreich,
  einschliesslich API-Zugriffsschutz, Migrationen, Mitgliedschaft, Erwerb,
  Unterstuetzung, Ranking und Release-Vorabcheck.
- Alle sieben neuen Migrationen mit `prisma migrate deploy` auf historischen
  Testdaten angewendet; erneutes Deploy ohne ausstehende Migrationen.
- Prisma-Modell und resultierende Datenbank ohne Schema-Differenz. SQL-Trigger
  und Sonder-Constraints werden zusaetzlich durch Verhaltenstests geprueft.
- Gleichzeitige GraphQL-Beitritte desselben Profils erzeugen eine Mitgliedschaft,
  einen offenen Historienzeitraum und einen gemeinsamen Chat. Gleichzeitige
  identische Abrechnungen buchen nur einmal; Empfaengerwechsel kopieren keine Credits.
- PGlite: 108 erfolgreich, vier PostgreSQL-spezifische Tests bewusst uebersprungen.
- Offline-Produktionsbundles fuer iOS und Android mit Expo/Hermes exportiert.
  Das sind JavaScript-Bundles, keine signierten nativen Store-Builds.
- RN-Web/Playwright: Einflussansicht bei 320/390/768/1280 Pixeln, hell/dunkel,
  DE/EN, Suche, Zuordnung/Ruecknahme, Profilwechsel, Pagination, Fehler/Retry,
  reduzierte Bewegung sowie aktivem/inaktivem Rankingstatus geprueft.
- Post-Autorenzeile und echte TaggedUsersSheet mit verschachtelten akzeptierten
  Markierungen, unvollstaendigen Daten und Profilwahl geprueft; Menurand-Stile
  getestet. Native Bridges/Navigation und Netzwerk-Mutationen waren ersetzt.

Die Migrationstest-Baseline wird aus Commit `fcffa46` generiert. Sie ersetzt keine
Probe auf einer autorisierten, bereinigten Kopie des wirklichen Produktionsstands.
Die lokalen Expo-Exporte verwenden eine Test-API unter localhost und duerfen
nicht als Release-Artefakte veroeffentlicht werden.

## Reproduzierbare lokale Checks

Aus dem Repository-Root, mit installierten Projektabhaengigkeiten:

```sh
node node_modules/typescript/bin/tsc -p apps/server/tsconfig.json --noEmit
node node_modules/typescript/bin/tsc -p apps/ciaorelated/tsconfig.json --noEmit
node apps/server/tests/run-community-privacy.mjs --postgres
```

Der PostgreSQL-Test braucht `initdb`, `pg_ctl` und `psql` im PATH, alternativ
`COMMUNITY_TEST_PG_BIN=/pfad/zu/postgresql/bin`. Er erzeugt einen eigenen Cluster
an einem zufaelligen Loopback-Port, wendet nur dort Migrationen an und entfernt
ihn im normalen Abschluss, auch bei Testfehlern. Kein bestehender DB-Dienst wird
verwendet. Nicht als root ausfuehren. Nach erzwungenem Prozessabbruch den vom
Test erzeugten Cluster gezielt pruefen; keine fremden PostgreSQL-Prozesse stoppen.

Ohne `--postgres` braucht der Test `@electric-sql/pglite` und
`@electric-sql/pglite-socket`; ein separater Installationsordner kann ueber
`COMMUNITY_TEST_DEPS` gesetzt werden. PGlite ersetzt den Parallelitaetstest nicht.

## Noch offene Freigaben

- [ ] Backup und Wiederherstellung der Zielumgebung erprobt; aktuelle
  Prisma-Migrationshistorie und Schema auf Abweichungen untersucht.
- [ ] Migrationslauf auf autorisierter Staging-Kopie mit realistischer Datenmenge
  gemessen; Dauer und Sperrzeiten fuer das Wartungsfenster festgehalten.
- [ ] Aktuelle native iOS- und Android-Builds gegen Staging getestet.
- [ ] Gleichzeitige Beitritte/Austritte/Loeschungen waehrend laufender
  Tagesabrechnung unter realistischer Last geprueft. Die lokale Parallelprobe
  deckt noch nicht jede Kombination dieser Schreibvorgaenge ab.
- [ ] SQL-Plaene, Abrechnungsdauer und Speicherverbrauch fuer grosse
  Dach-Communities gemessen; Einflussuebersicht und Feed-Latenzen verglichen.
- [ ] Startwerte mit echten Pilot-Szenarien fachlich abgenommen. Keine versprochene
  Reichweite aus Punkten ableiten; Profilanzahl ist nicht Anzahl unabhaengiger Menschen.
- [ ] Release-Version, Buildnummern und Store-Verfuegbarkeit beider Plattformen
  festgelegt. Bestehende `app.config.js`-Aenderungen separat pruefen.
- [ ] Konkrete Freigabe fuer Migration, Dach-Aufnahme, Erwerb und Ranking eingeholt.

## Backend und Datenbank ausrollen

1. Release-Commit und vollstaendige sieben Migrationsordner sichern. Die
   Migrationsdateien muessen auch beim gebauten Server verfuegbar sein.
2. Beide Einfluss-Flags auf `false` lassen. Ziel-DATABASE_URL, UTC-Zeitzone,
   Prisma-Version und Migrationsstatus pruefen, ohne Credentials zu protokollieren.
3. Server-Artefakt mit dem neuen Prisma-Client vorbereiten. In Staging erst alle
   Tests bestehen lassen, dann einen konkreten Produktionsablauf freigeben.
4. Fuer den Datenschutz-Uebergang HTTP/WebSocket-Zugriff und schreibende Worker
   kontrolliert pausieren. Alte und neue Backend-Version nicht gleichzeitig
   bedienen lassen: Alte Resolver kennen die neuen privaten Zielgruppen nicht.
5. Alle ausstehenden Migrationen pruefen, dann `prisma migrate deploy` verwenden,
   niemals `migrate dev`, `db push` oder automatisches Baseline/Resolve in Produktion.
   Bei teilweisem Fehler Zugriff geschlossen lassen und den DB-Zustand gezielt
   untersuchen. Nicht blind erneut SQL ausfuehren oder Migrationen als erledigt markieren.
6. Ausschliesslich das neue Backend starten, Vorabcheck und Zugriffs-Smoke-Tests
   ausfuehren. Erst danach den normalen Zugriff wieder freigeben.

Die folgenden Befehle sind Beispiele fuer das Server-Paketverzeichnis. Erst nach
Pruefung der Zielumgebung ausfuehren; diese Dokumentation fuehrt sie nicht aus:

```sh
pnpm exec prisma migrate status --schema prisma/schema.prisma
pnpm exec prisma migrate deploy --schema prisma/schema.prisma
pnpm exec prisma migrate status --schema prisma/schema.prisma
pnpm community:check
```

Bei einem bereits gebauten Server ist der Vorabcheck auch als
`node dist/scripts/checkCommunityRelease.js` verfuegbar. Er laeuft in einer
Read-only-Transaktion mit Zeitlimits, prueft die sieben Migrationschecksummen,
benoetigte Trigger, UTC, gespeicherte Erwerbspolicy und die Aktivierungsflags.
Er aktiviert und repariert nichts, gibt keine Nutzerdaten/DB-URL aus und ersetzt
weder einen vollstaendigen Schema-/Datenaudit noch native oder Lasttests.
Exit-Code 1 bedeutet Prueffehler; Warnungen trotz Exit-Code 0 separat lesen.
Er liest die Umgebung des aufgerufenen Prozesses, nicht automatisch die Umgebung
eines bereits laufenden PM2-Prozesses. Beide Konfigurationen muessen uebereinstimmen.

## App-Abnahme

Mindestens zwei Accounts und zwei Profile desselben Accounts verwenden. Je eine
alte migrierte private, eine neue private und eine neue oeffentliche Community
sowie DROP anlegen. In beiden nativen Apps pruefen:

- Alte Gruppen/Posts und Einladungslinks funktionieren; der Standard alter Gruppen
  bleibt privat. Sichtbarkeit kann auch der Eigentuemer nicht nachtraeglich aendern.
- Nichtmitglieder sehen oeffentliche Community-Posts, auch bei privatem Autor.
  Private Community-Posts bleiben auch auf dem Autorenprofil unsichtbar fuer Aussenstehende.
- Persoenliche private Posts werden durch eine oeffentliche Mitgliedschaft nicht
  oeffentlich. Feed, Detail, Suche, geteilte Vorschau und Benachrichtigungen pruefen.
- Beitritt per Link, Austritt, Wiedereintritt und Entfernung durch Eigentuemer:
  Zugriff korrekt, keine zweite Fruehposition, keine neuen Beitrittspunkte.
- Community-Chat nur fuer Mitglieder; Dach-Community ohne Chat und ohne
  automatische Aufnahme aller persoenlichen Mitgliederposts in den Moments-Mix.
- Neues Community-Posting inklusive Bild, Karussell und Video, Profilraster,
  Upload-Dateigroesse und Edit-Metadaten gegenpruefen. Bestehende Thumb-Logik behalten.
- Einflussansicht, Info fuer private Communities, Empfaengersuche,
  Zuordnung/Ruecknahme und schneller Profilwechsel auch bei langsamem Netz testen.
- Neue erworbene Credits werden beim Austritt behalten; empfangene Unterstuetzung
  ist nicht weiterleitbar. Blockierung/Sperre darf keine zusaetzlichen Rechte liefern.
- Mit deaktiviertem Ranking bisherige Feed-Reihenfolge; aktiviert nur passende,
  sichtbare, neue Posts im personalisierten Homefeed und Community-Moments-Mix.
  Following, Profilraster und direkte Community-Chronologie unveraendert.

Die vorhandene Update-Abfrage kann bereits `latestVersion` als Pflichtupdate
behandeln, nicht nur `minSupportedVersion`. Versionswerte und gueltige Store-URLs
erst nach tatsaechlicher Verfuegbarkeit des passenden Builds setzen und auf beiden
Plattformen testen. Ein Client-Updatezwang ersetzt niemals serverseitigen Zugriffsschutz.

## Getrennt aktivieren

### 1. Dach-Community

Owner-Profil ausdruecklich bestimmen. Erst Vorschau, danach separat freigegebenes
Anwenden. Die Einrichtung sperrt Profile/Gruppen/Mitgliedschaften kurzzeitig;
ein geeignetes Wartungsfenster vorsehen.

```sh
pnpm community:setup --owner-id <PROFILE_ID>
pnpm community:setup --owner-id <PROFILE_ID> --apply
```

Bestehende und neue Profile werden einmal aufgenommen. Austritt bleibt respektiert.
Historische Aufnahme erzeugt keinen kuenstlichen Wachstumsschub. Keine automatische
Auswahl eines Owners und kein Chat. Die Dach-Einrichtung ist unabhaengig vom Ranking.

### 2. Erwerb

```sh
pnpm community:influence --activate
pnpm community:influence --activate --apply
```

Die Policy wird festgeschrieben, Erwerbsbeginn ist der naechste UTC-Tagesbeginn.
Historische Aktivitaet wird nicht nachtraeglich erfunden. Vorschau und Anwendung
koennen bei Tageswechsel unterschiedliche Startdaten zeigen; Ausgabe kontrollieren.
Erst nach einem abgeschlossenen Tag plus fuenf Minuten Abrechnung pruefen:

```sh
pnpm community:influence --run
pnpm community:influence --run --apply
```

Automatische Abrechnung separat mit `ENABLE_COMMUNITY_INFLUENCE_WORKER=true`
einschalten und Prozessumgebung aktualisieren. Lauf zur Minute 10 jeder UTC-Stunde;
pro Lauf hoechstens 100 Communities und sieben Tage je Community. Vorschau zeigt
nur den naechsten ausstehenden Tag je Community, sie schiebt keinen Cursor weiter.
Logs `[community-influence]`, Fehler, Rueckstand, Dauer und DB-Sperren ueberwachen.

### 3. Ranking

Erst nach erfolgreicher Erwerbs-/Unterstuetzungsprobe und Lastabnahme einschalten:

```dotenv
ENABLE_COMMUNITY_INFLUENCE_RANKING=true
COMMUNITY_INFLUENCE_RANKING_STARTS_AT=<FESTER_UTC_ZEITPUNKT_IM_ISO_FORMAT_MIT_Z>
COMMUNITY_INFLUENCE_RANKING_MAX_AGE_HOURS=72
COMMUNITY_INFLUENCE_RANKING_HALF_LIFE_HOURS=24
COMMUNITY_INFLUENCE_RANKING_MAX_PROMOTION=12
COMMUNITY_INFLUENCE_RANKING_HALF_STRENGTH_POINTS=5000
```

Platzhalter ersetzen; Startzeit nicht bei jedem Restart neu berechnen oder fuer
alte Posts rueckdatieren. Konfiguration mit `community:check` kontrollieren.
API-Latenzen vor/nach Aktivierung, Fehlerraten, Autorenvielfalt und Feedback
beobachten. Kleine lokale Fixtures sind kein Produktions-Lastnachweis.

## Rueckfallplan

- Rankingflag auf `false` und laufende Prozessumgebung aktualisieren: bisheriger
  Feedpfad ohne Vernichtung von Guthaben/Zuordnungen.
- Workerflag auf `false`: stoppt automatische Abrechnung, aber nicht das bereits
  aktivierte Ereignisjournal. Kuenftige Abrechnung kann Rueckstand nachholen.
- Erwerbseinstellungen, Zeitmarken, Wachstumscounter und Ledger nicht manuell
  loeschen/zuruecksetzen. Eine Policy-Aenderung braucht einen eigenen Uebergangsplan.
- Kein Rollback auf einen Server ohne Community-Zugriffsregeln: Sonst koennten
  inzwischen private Posts wieder ausgeliefert werden. Zugriff notfalls schliessen
  und gezielt vorwaerts korrigieren. Flags schuetzen nicht vor altem Backend-Code.
- DB-Restore nur als separat freigegebene, koordinierte Wiederherstellung mit
  dokumentiertem Datenverlustfenster. Keine automatische Down-Migration vorgesehen.
