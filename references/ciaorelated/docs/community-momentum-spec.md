# Bvrly Community Momentum

Stand: 2026-10-06. Arbeitspakete 2 bis 6 lokal implementiert und getestet.
Paket 5 enthaelt eine konfigurierbare Startkalibrierung, noch keine produktive Aktivierung.

Ziel: Communities entdecken, fruehe Zugehoerigkeit erhalten und aus der
gemeinsamen Entwicklung Einfluss gewinnen. Dieser unterstuetzt standardmaessig
eigene neue Beitraege und kann widerrufbar einem anderen Profil zugeordnet werden.
Die App erhaelt dafuer eine kompakte Ansicht im bestehenden Moments-Tab.

Dieses Dokument unterscheidet bestaetigte Anforderungen von Umsetzungsvorschlaegen.
Offene Entscheidungen sind keine Freigabe fuer spaetere Funktionspakete.
Community-Typ, Sichtbarkeit, App-Oberflaeche und API-Berechtigungen wurden lokal
erweitert. Eine Migration ist vorbereitet, aber nicht auf Produktion angewandt.
Oeffentliche Community-Discovery und der interne Einflusserwerb sind lokal implementiert.
Unterstuetzungs-UI und widerrufbare Empfaengerzuordnung sind lokal implementiert.
Ranking-Boni sind noch offen.

## Bestaetigte Anforderungen

| Bereich | Regel |
| --- | --- |
| Identitaet | Jedes Profil zaehlt eigenstaendig, auch bei gemeinsamem Account. |
| Community | GroupLink bleibt die bestehende Community-Struktur. |
| Verwaltung | Der Eigentuemer verwaltet die Community. Keine neuen Verwaltungsrollen. |
| DROP | Zusaetzlicher Community-Typ, von jedem erstellbar, ohne Sonderfunktionen. |
| Oeffentlich | In Suche und Empfehlungen auffindbar; Inhalte fuer Nichtmitglieder sichtbar. |
| Privat | Nicht oeffentlich auffindbar; jeder mit Einladungslink darf beitreten. |
| Private Inhalte | Nur aktuelle Mitglieder sehen Community-Beitraege, auch auf Autorenprofilen. |
| Oeffentliche Beitraege | Explizite Community-Beitraege sind auch bei privatem Autorenprofil fuer alle angemeldeten Bvrly-Profile sichtbar; persoenliche Beitraege bleiben privat. |
| Chat | Auch bei oeffentlichen Communities nur fuer aktuelle Mitglieder und Eigentuemer. |
| Community-Feed | Zeigt ausdruecklich dieser Community zugeordnete Beitraege. |
| Moments-Mix | Darf weiterhin persoenliche Beitraege gemeinsamer Mitglieder enthalten. |
| Fortschritt | Wachstum und gemeinsame Aktivitaet koennen beide Fortschritt erzeugen. |
| Fruehe Zugehoerigkeit | Dauerhaft dokumentiert; starker Vorteil entsteht durch selbst miterlebtes qualifiziertes Wachstum, nicht automatisch beim Beitritt. |
| Aktivitaetspflicht | Keine. Auch ruhige fruehe Mitglieder koennen von der gemeinsamen Entwicklung profitieren. |
| Mehrere Communities | Eigene erworbene Positionen addieren sich vollstaendig; kein Top-N- oder Mitgliedschaftslimit. |
| Austritt | Erarbeitetes bleibt nutzbar; weiterer Erwerb aus dieser Community pausiert. |
| Wiedereintritt | Fortschritt wird fortgesetzt; kein neuer Beitrittsbonus. |
| Entfernen durch Eigentuemer | Wie Austritt: Historie bleibt erhalten, weiterer Erwerb pausiert. |
| Endgueltige Loeschung | Loeschen eines Profils oder einer Community entfernt auch die zugehoerige Mitgliedschaftshistorie. |
| Private Community und Einfluss | Erzeugt zunaechst keinen Einfluss; Erklaerung ueber Info-Symbol. |
| Unterstuetzung | Optional, widerrufbar und einschliesslich kuenftig entstehenden Einflusses. |
| Weitergabe | Nur selbst erworbener Einfluss ist zuordenbar; empfangene Unterstuetzung nicht. |
| Bestandsmigration | Bestehende Communities werden privat; ihre Community-Beitraege nur fuer Mitglieder sichtbar. |
| Sichtbarkeit festlegen | Oeffentlich/privat wird bei der Erstellung gewaehlt und ist in Version 1 danach unveraenderlich, auch fuer den Eigentuemer. |
| Dach-Community | Einmalig automatisch aufnehmen; Austritt respektieren; Fruehposition nach Profilerstellung. Kein Chat und kein pauschaler persoenlicher Mitglieder-Mix. |
| Darstellung | Einstieg oben rechts in Moments; eigenes Profil als Standardempfaenger. |
| Animation | Elektrische Verbindungslinien zwischen Community-Einfluss und Empfaengerprofil. |

Einfluss hat keinen Geldwert. Es gibt weder Kauf noch Handel, Token oder NFTs.
Blockierungen, Inhaltsberechtigungen und Plattformmoderation haben Vorrang vor Ranking.

## Minimaler Produktumfang als Vorschlag

Eine Community bekommt bei der Erstellung die Auswahl oeffentlich/privat und den
weiteren Typ DROP. Die Sichtbarkeit kann danach in Version 1 weder in der App noch
ueber die API geaendert werden. Bestehende Communities bleiben nach der Migration
privat. Die vorhandene Bearbeitung von Titel und Bild bleibt davon unberuehrt.
Die vorhandene Moments-Suche bekommt eindeutig erkennbare Community-Treffer.
Der personalisierte Homefeed bekommt einen zurueckhaltenden Community-Vorschlagsblock.
Es entsteht kein weiterer Haupttab.

Die Einflussansicht zeigt die eigene Position je Community, den erworbenen Einfluss
und genau ein unterstuetztes Profil. Fuer den Start wird jeweils die gesamte eigene
Position zugeordnet. Keine Teilbetraege, Empfaengergruppen oder Aufteilungsregler.
Empfangenes und selbst erworbenes Gewicht werden verstaendlich unterschieden.

Nicht enthalten: Ranglisten, taegliche Aufgaben, Belohnungsshop, Kauf von Reichweite,
neue Moderationsrollen, Drop-Reservierungen, Produktbesitz oder Zahlungsabwicklung.

## Zugehoerigkeit und Einfluss

Drei verschiedene Werte bleiben getrennt:

1. Historie: erster bekannter Beitritt und belegbare fruehe Position.
2. Eigener erworbener Einfluss: Fortschritt dieses Profils aus dieser Community.
3. Aktueller Empfaenger: Profil, dessen berechtigte neue Beitraege davon profitieren.

Die aktuellen Mitgliedschaften bleiben die Grundlage fuer Inhaltszugriff.
Historische Zugehoerigkeit oder empfangener Einfluss verleihen keine Leserechte.
Eine Unterstuetzung aendert weder Autorenschaft noch Mitgliedschaft oder Eigentum.

Abgestimmte Richtung der Erwerbslogik:

- Ein reiner Beitritt erzeugt noch keinen sofort nutzbaren Reichweitenbonus.
- Neue Mitglieder uebernehmen weder den bisherigen Wachstumserfolg noch einen
  pauschalen Fruehmultiplikator einer bereits grossen Community.
- Qualifiziertes Wachstum zaehlt erstmals beigetretene, fortbestehende Mitgliedschaften.
- Aktivitaet zaehlt verschiedene beteiligte Profile an ausdruecklichen Community-Beitraegen.
- Einzelne Likes, Kommentare und wiederholte Aufrufe werden nicht unbegrenzt addiert.
- Selbstinteraktionen und wiederholtes Entfernen und Wiederherstellen derselben Reaktion
  erzeugen keinen neuen Fortschritt.
- Beitrittsposition und Community-Wachstum bleiben die staerkste Grundlage.
- Gemeinsamer Fortschritt kommt den zu diesem Zeitpunkt anwesenden Mitgliedern zugute.
- Persoenliche Beteiligung und Resonanz auf eigene Community-Beitraege kommen
  zusaetzlich dazu, ohne durch die Mitgliederzahl geteilt zu werden.
- Spaete Mitglieder koennen einen fruehen Vorsprung durch viel anhaltende,
  unterschiedliche Beteiligung und Resonanz ueberholen. Keine unueberholbare Rangposition.
- Erwerb ist nur fuer tatsaechliche Mitgliedschaftszeiten moeglich. Ein Wiedereintritt
  darf keine nachtraegliche Belohnung fuer die Abwesenheit ausloesen.
- Wiederholtes Berechnen desselben Zeitraums darf nichts doppelt gutschreiben.

Die eigene Aktivitaet ist keine Zugangsvoraussetzung. Fruehe Mitglieder einer spaeter
stark wachsenden Community duerfen einen erheblichen Vorsprung erwerben. Es gibt kein
Limit auf wenige staerkste Community-Positionen. Die spaetere Rankingwirkung muss
dennoch andere Sortierungsfaktoren erhalten; Punktestand ist nicht gleich Reichweite.

Konkrete Zahlen sind eine technisch konfigurierbare Startkalibrierung (siehe unten),
keine vom Nutzer einzeln festgelegten Produktwerte. Vor Aktivierung auf Staging anhand
realistischer Community-Groessen pruefen. Es gibt keinen vollstaendigen Spam-Schutz.

Rueckmeldung zur vorgeschlagenen Formel: Der Nutzer betont Beitrittsdatum und
Interaktionen an Community-Beitraegen als Kern. Die vorgeschlagenen Werte
min(100, 2 * Wachstum + Aktivitaet), 48 Stunden Mitgliedschaft, 7 Tage Profilalter
und maximal 50 Prozent Fruehbonus wurden NICHT bestaetigt und sind nicht im
Produktcode hinterlegt. Keine eigenen Upload-Mengen als Erwerbsgrundlage.
Die spaetere Praezisierung bezieht sich auf Interaktionen an ausdruecklichen
Community-Beitraegen. Entsprechend werden persoenliche oeffentliche Posts NICHT
pauschal fuer die Dach-Community ausgewertet, auch keine historischen Uploadmengen.
Explizite Dach-Beitraege koennen wie andere Community-Beitraege Interaktionen liefern.

## Widerrufbare Unterstuetzung als Vorschlag

Der eigene Fortschritt bleibt immer seiner urspruenglichen Community-Position
zugeordnet. Das Empfaengerfeld bestimmt die aktuelle Wirkung des gesamten dort
erworbenen und kuenftig entstehenden Einflusses. Standard ist das eigene Profil.

Ein Wechsel von Profil A auf Profil B beendet die Wirkung fuer A und aktiviert sie
fuer B. Ruecknahme stellt das eigene Profil als Empfaenger wieder her. Es werden
keine Punkte kopiert oder als dauerhaftes Geschenk beim frueheren Empfaenger belassen.
Eine Zuordnung kann auch nach Austritt fuer den erhaltenen Einfluss bestehen bleiben.

Bestaetigt: Nur selbst erworbene Positionen sind zuordenbar.
Empfangene Unterstuetzung wirkt direkt und kann nicht erneut weitergeleitet werden.
Damit sind keine Ketten, Kreise oder rekursiven Berechnungen erforderlich.

## Ranking

Die Wirkung gilt fuer den personalisierten Homefeed und den Moments-Mix.
Die Folge-ich-Ansicht, direkte Community-Feeds und Profilchronologien bleiben in
ihrer bisherigen Reihenfolge. Ein Einflusswert ist keine garantierte Impressionenzahl.

Zuerst bestimmt der Server, welche Beitraege sichtbar und fuer den Betrachter
geeignet sind. Erst danach wirkt ein begrenzter Profilbonus auf deren Sortierung.
Relevanz, Aktualitaet und Abwechslung bleiben massgeblich. Der Bonus ersetzt keine
Autorenbegrenzung und steigt nicht allein durch mehr Uploads desselben Profils.

Bedeutung von neu: Beitraege, die ab dem festgelegten Aktivierungszeitpunkt der
Funktion veroeffentlicht wurden und noch im konfigurierten Aktualitaetsfenster liegen.
Keine Wiederbelebung alter Archive. Bei einem Empfaengerwechsel wird die aktuelle
Wirkung fuer kommende Auslieferungen neu bestimmt; bereits erfolgte Ansichten
werden nicht rueckgaengig gemacht und es bleibt kein permanenter Post-Bonus zurueck.

Alle gueltigen eigenen und empfangenen Positionen werden vollstaendig summiert,
ohne Top-N-Community-Limit. Die Sortierwirkung der Summe ist begrenzt, nicht der
Punktestand. Konfigurierbare, vorlaeufige Startwerte und Aktivierung siehe Paket 7.

## Dach-Community

Die Dach-Community wird ausdruecklich als Quelle fuer Einfluss behandelt.
Ihre fruehe Position wird aus dem tatsaechlichen Profile.createdAt abgeleitet;
der automatische Beitritt bei Einfuehrung wird separat dokumentiert.
Es wird weder eine historische Mitgliedschaft noch vergangene Aktivitaet erfunden.
Es gibt keine einmalige Startgutschrift.

Ihr Einfluss kann nicht nur vom Mitgliederanteil am Bvrly-Netzwerk abhaengen:
Bei automatischer Aufnahme bleibt dieser Anteil nahezu konstant. Fuer eine
Wachstumsquelle dienen qualifizierte neue Profile und Interaktionen an expliziten
Dach-Beitraegen. Persoenliche oeffentliche Posts und alte Uploadmengen zaehlen nicht.

Keine paarweisen Connections zwischen allen Bvrly-Profilen erzeugen. Die gemeinsame
Dach-Mitgliedschaft ist kein pauschaler persoenlicher Relevanzgrund und macht den
Moments-Mix nicht zu einem ungefilterten Gesamtfeed.

Bestaetigt: Austritt bleibt moeglich; automatische Aufnahme erfolgt einmalig,
nicht bei jeder Anmeldung. Ein spaeterer bewusster Austritt wird respektiert.
Der Standard-Community-Chat wird fuer die Dach-Community weder angelegt noch
angeboten und kann in dieser Version auch vom Eigentuemer nicht aktiviert werden.
Ausdrueckliche Community-Beitraege bleiben moeglich und Teil des Moments-Mix.

## Noch offene Produktentscheidungen

| ID | Entscheidung | Vorschlag | Status |
| --- | --- | --- | --- |
| D1 | Behandlung bestehender Communities und ihrer Beitraege | Privat; bestehende Community-Beitraege damit nur fuer Mitglieder sichtbar. | Bestaetigt. |
| D2 | Sichtbarkeit nach Erstellung aendern | In Version 1 ausgeschlossen, auch fuer den Eigentuemer; Auswahl nur beim Erstellen. | Bestaetigt. |
| D3 | Empfangenen Einfluss erneut weitergeben | Nicht in Version 1; nur eigene Positionen zuordnen. | Bestaetigt. |
| D4 | Privates Profil veroeffentlicht in oeffentlicher Community | Dieser Beitrag ist oeffentlich; persoenliche Beitraege bleiben privat. | Bestaetigt. |
| D5 | Oeffentliche Inhalte und Chat | Oeffentlich innerhalb der angemeldeten App; Chat nur fuer Mitglieder. | Bestaetigt. |
| D6 | Ganze Position, bestehender Einfluss, Empfaengerwechsel | Gesamte eigene Position widerrufbar zuordnen; bisheriger Empfaenger behaelt keinen Bonus. | Paket 6 mit diesem Umfang freigegeben und lokal implementiert. |
| D7 | Berechnung und Ranking | Wachstumsabhaengiger Fruehvorteil ohne Startbonus, Aktivitaetspflicht oder Top-N-Limit; spaeter begrenzte Rankingwirkung. | Erwerb v2 lokal implementiert, Zahlen kalibrierbar; Ranking in Paket 7 offen. |
| D8 | Dach-Community | Profile.createdAt als Fruehposition, einmalige Aufnahme mit freiwilligem Austritt, kein Chat und kein pauschaler Mitglieder-Mix. | Bestaetigt. |
| D9 | Nachtraegliche Veroeffentlichung durch Sichtbarkeitswechsel | Entfaellt in Version 1, da die Community-Sichtbarkeit unveraenderlich bleibt. | Durch D2 festgelegt. |

Entfernen durch den Eigentuemer wird wie Austritt behandelt. Die Historie bleibt
erhalten, der aktive Zeitraum endet. Endgueltiges Loeschen eines Profils oder einer
Community entfernt deren Historie und Zeitraeume (bestaetigt am 2026-10-06).
Sperren und ungueltige Unterstuetzungsempfaenger werden vor Paket 5/6 festgelegt.
Insbesondere ist Austritt nicht mit Loeschung gleichzusetzen.

Die Community-Zuordnung eines bereits privaten Beitrags kann in Version 1 nicht
entfernt oder gewechselt werden. Das verhindert eine versehentliche Veroeffentlichung
ueber die Beitragsbearbeitung. Text und Standort bleiben bearbeitbar. Verwaiste
Community-Zuordnungen werden nicht automatisch zu oeffentlichen Profilbeitraegen.

In Version 1 gibt es keinen Sichtbarkeitswechsel und keinen Bestaetigungsdialog
zum nachtraeglichen Oeffentlichmachen einer Community. Diese Einschraenkung gilt
serverseitig ebenso wie in der Oberflaeche. Regeln fuer historische Beitraege und
Einflusserwerb bei einem spaeter eventuell eingefuehrten Wechsel sind nicht Teil
dieser Version.

## Beispiele fuer Abnahme und Tests

| Fall | Erwartetes Ergebnis |
| --- | --- |
| Zwei Profile desselben Accounts | Beide besitzen eigenstaendige Positionen; keine Zusammenfassung nach Account. |
| Privater Community-Post auf oeffentlichem Autorenprofil | Nichtmitglieder sehen weder Inhalt noch abrufbare Medien-URLs. |
| Bekannte Post-ID einer privaten Community | Direkter Zugriff bleibt fuer Nichtmitglieder gesperrt. |
| Erstellung einer Community | Die gewaehlte Sichtbarkeit wird gespeichert und danach nicht mehr aenderbar angeboten. |
| Eigentuemer versucht privat zu oeffentlich ueber die API zu wechseln | Aenderung abgelehnt; Community und bisherige Beitraege bleiben privat. |
| Eigentuemer versucht oeffentlich zu privat ueber die API zu wechseln | Aenderung abgelehnt; gespeicherte Sichtbarkeit bleibt unveraendert. |
| Eigentuemer bearbeitet Titel oder Bild | Weiterhin moeglich, ohne die gespeicherte Sichtbarkeit zu veraendern. |
| Historisches Mitglied ist ausgetreten | Einfluss bleibt erhalten, private Inhalte sind nicht mehr zugreifbar. |
| Austritt mit 20 Einfluss, Community waechst waehrend Abwesenheit | Eigener Wert bleibt 20; kein Erwerb fuer die Abwesenheit. |
| Wiedereintritt | Alte Position bleibt, kein erneuter Bonus, kuenftiger Erwerb kann fortgesetzt werden. |
| Mitgliederzahl stagniert, verschiedene Profile interagieren | Aktivitaet kann trotzdem Fortschritt erzeugen. |
| Wiederholte Likes oder erneute Berechnung | Kein doppelter Einfluss fuer dasselbe qualifizierte Ereignis oder Intervall. |
| Eigene 20 Einfluss unterstuetzen ein anderes Profil | Historie bleibt beim Ursprung, Wirkung liegt genau einmal beim Empfaenger. |
| Nach Zuordnung entstehen weitere 5 Einfluss | Eigener Fortschritt 25; aktuelle Wirkung 25 beim Empfaenger. |
| Ruecknahme | Wirkung des Empfaengers verliert diese 25, eigene Wirkung erhaelt sie zurueck. |
| Beitrag mit hohem Einfluss, aber fehlender Sichtbarkeit | Wird nicht ausgeliefert. |
| Hohes Uploadvolumen | Umgeht keine Autorenbegrenzung. |
| Dach-Community mit allen Profilen | Keine vollstaendige Connection-Matrix und kein ungefilterter Mitgliederfeed. |

Die Zahlen 20 und 5 illustrieren die Zuordnung; sie legen keine Erwerbsrate fest.

## Technische Ausgangslage

Gepruefter lokaler Stand: fcffa46. Vor Umsetzung betroffene Stellen erneut lesen.

- Datenmodell: apps/server/prisma/schema.prisma, GroupLink und GroupLinkMember.
- Community-Zugriffe: apps/server/src/resolvers/groupLinkResolvers.ts.
- Post-Zuordnung: apps/server/src/resolvers/postResolvers.ts, PostContext mit group:<id>.
- Bestehende Autorenpruefung: apps/server/src/lib/privacy.ts.
- Moments-Suche: apps/server/src/resolvers/contextSearchResolvers.ts.
- Feed: apps/server/src/resolvers/feedResolvers.ts.
- Moments-Sortierung im Client: apps/ciaorelated/src/screens/ReelsScreen.tsx.
- Erstellung: apps/ciaorelated/src/screens/GroupLinkSheet.tsx.
- Community-Ansicht: apps/ciaorelated/src/screens/CommunitySpaceScreen.tsx.
- Update-Fenster: apps/ciaorelated/App.tsx und src/lib/appUpdate.ts.

Im Ausgangsstand fehlten Community-Sichtbarkeit, DROP, dauerhafte Beitrittshistorie
und Einfluss. Die ersten drei sind nun lokal implementiert. GroupLinkMember wird
weiterhin beim Austritt geloescht; separate Historie erhaelt den ersten belegbaren
Beitritt und die ab Einfuehrung aufgezeichneten Mitgliedschaftszeitraeume.
Frueher geloeschte Austritte koennen nicht rueckwirkend wiederhergestellt werden.

Likes werden beim Entfernen geloescht; erneutes Liken erzeugt einen neuen
Zeitstempel. PostView speichert den letzten Aufruf und eine wiederholt erhoehte
Anzahl. Diese Rohdaten sind allein kein manipulationsfestes Aktivitaetsjournal.

Private Inhalte brauchen Zugriffspruefungen vor jeder URL-Ausstellung. Bereits
ausgestellte signierte URLs oder heruntergeladene Dateien lassen sich durch eine
Mitgliedschaftsaenderung nicht automatisch zurueckholen. Cache- und URL-Laufzeiten
bleiben eine Grenze: signierte Post-URLs sind normalerweise bis zu 900 Sekunden
gueltig, teils konfigurierbar. Bereits heruntergeladene Medien und Client-Caches
lassen sich nicht serverseitig zurueckholen. Der S3-Bucket darf die Originale nicht
parallel oeffentlich ausliefern; die Produktionskonfiguration wurde nicht geprueft.

## Stand von Arbeitspaket 2

- GroupLink erhaelt DROP und eine bei Erstellung feste Sichtbarkeit. Standard ist PRIVATE.
- Context.groupLinkId verbindet die vorhandenen group:<id>-PostContexts eindeutig
  mit der Community. Die Migration fuellt bestehende Zuordnungen nachtraeglich aus.
- Der API-Filter prueft das einzelne Profil, aktuelle Mitgliedschaft, Community-
  Sichtbarkeit, Blocks und Sperren. Keine Zusammenlegung von Profilen eines Accounts.
- Listen werden vor Pagination gefiltert; eine zusaetzliche GraphQL-Pruefung schuetzt
  verschachtelte Posts, Story-Shares und Benachrichtigungsvorschauen vor Medienausgabe.
  Gleichzeitige Post-Pruefungen werden gebuendelt, nicht ueber Mutationen gecacht.
- Chat prueft neben ThreadMember auch die aktuelle Community-Mitgliedschaft,
  einschliesslich Live-Zustellung. Veraltete Chat-Mitgliedschaften verleihen kein Recht.
- Unsigned x-profile-id allein authentifiziert kein Profil mehr; ein gueltiges JWT
  mit passender Profil-/Account-Zuordnung ist erforderlich.
- App: DROP-Auswahl, oeffentlich/privat beim Erstellen, Publikumshinweise bei Posts,
  Beitritt aus oeffentlichen Community-Ansichten und zugaengliche Community-Posts auf
  privaten Autorenprofilen. Keine nachtraegliche Sichtbarkeitseinstellung.

Regressionstests und Anleitung: apps/server/tests/README.md. Sie verwenden eine
isolierte lokale PGlite-Datenbank und testen auch die historische Migration.
Backend-Typecheck erfolgreich. Native Oberflaeche noch nicht auf Geraet/Simulator
abgenommen; der App-Typecheck hat bestehende Fehler ausserhalb dieser Aenderung.

Vor Freigabe: Migration auf einer Testkopie der realen PostgreSQL-Datenbank pruefen,
S3-Zugriff kontrollieren, native Abnahme durchfuehren und Backend samt Migration
vor dem neuen App-Build bereitstellen. Alte Clients bekommen ohne neues Feld PRIVATE;
neue Clients brauchen das neue Schema. Ein erzwungenes App-Update ersetzt keine
serverseitigen Berechtigungen. Keine Produktionsmigration oder Veroeffentlichung erfolgt.

## Stand von Arbeitspaket 3

- Die vorhandene Moments-Suche zeigt zusaetzlich oeffentliche Community-Treffer,
  auch ohne bestehende Beitraege. Suche nach Titel, 300 ms Verzoegerung beim Tippen,
  sechs Treffer je Seite mit Nachladen; private Communities bleiben ausgeschlossen,
  auch fuer ihre Mitglieder. Eigene Communities bleiben unter der vorhandenen Verwaltung.
- Der personalisierte Homefeed erhaelt maximal einen horizontalen Vorschlagsblock
  nach dem dritten echten Beitrag, bei kuerzeren Feeds am Ende. Kein Zusatz im
  Folge-ich-Feed. Neue lokale Zeilen veraendern weder API-Offsets noch Post-View-IDs.
- Vorschlaege priorisieren oeffentliche Communities mit gefolgten Mitgliedern oder
  Eigentuemern, danach das Datum aktueller sichtbarer Community-Beitraege (30 Tage),
  danach das Erstellungsdatum. Die App zeigt einen kurzen passenden Empfehlungsgrund.
  Es werden keine Naehe oder persoenliche Ortsdaten als Auswahlgrund behauptet.
- Private, deaktivierte, abgelaufene, eigene und bereits beigetretene Communities
  werden nicht empfohlen. Blockierte oder gesperrte Eigentuemer werden ausgeschlossen;
  blockierte/gesperrte Mitglieder und unzugaengliche Posts liefern keinen Empfehlungsgrund.
- Antippen oeffnet die bestehende Community-Ansicht; Beitritt bleibt eine bewusste
  Aktion. Kein automatischer Beitritt, kein neuer Tab, keine Einflussgutschriften.
- Die additiven API-Queries searchCommunities und suggestedCommunities brauchen
  keine weitere Migration ueber Paket 2 hinaus. Fehler der zusaetzlichen Queries
  werden lokal behandelt. Die Suche bietet Wiederholen, fehlgeschlagene Vorschlaege
  werden ausgeblendet; Authentifizierungspruefungen bleiben bestehen.

Verifikation: 29 erfolgreiche Tests einschliesslich des uebergeordneten Testfalls
in der isolierten Datenbank-Suite; Backend-Typecheck erfolgreich. Darstellung und
Interaktionen der echten neuen Komponenten wurden separat ueber React Native Web
mit Playwright geprueft (320/390/768/1280 px, helle/dunkle Darstellung, DE/EN,
Navigation, Lade-/Leer-/Fehlerzustaende, Wiederholen, Pagination, schnelle Suchwechsel).
Navigation und native Anbindung waren in dieser Pruefansicht ersetzt; das ist keine
Abnahme der vollstaendigen nativen App. Sechs bekannte App-Typecheck-Fehler in anderen
Dateien bleiben bestehen. Produktionslast und Query-Plaene auf grossen Datenmengen
sind noch nicht geprueft. Kein Push, Deployment oder Produktionszugriff erfolgt.

## Stand von Arbeitspaket 4: Historie

- CommunityMembershipHistory enthaelt genau einen Datensatz pro Community und
  Profil, unabhaengig vom Account. firstJoinedAt ist der erste belegbare Beitritt;
  recordedAt und origin unterscheiden die Bestandsuebernahme von neuen Beitritten
  beziehungsweise Eigentuemerpositionen.
- CommunityMembershipPeriod speichert Beginn und Ende jedes bekannten Zeitraums.
  Ein partieller eindeutiger Index erlaubt hoechstens einen offenen Zeitraum.
  Austritt/Entfernen beendet ihn; Wiedereintritt eroeffnet einen neuen Zeitraum,
  ohne die erste Position zu ersetzen. Historie gibt keinerlei Inhaltszugriff.
- Datenbank-Trigger halten aktuelle Mitgliedschaft und Historie in derselben
  Transaktion konsistent, auch bei bestehenden/nested Prisma-Schreibpfaden.
  Rollbacks rollen auch die Historie zurueck. joinedAt und die Identitaet einer
  vorhandenen Mitgliedschaft koennen nicht nachtraeglich umgeschrieben werden.
- Eigentuemer haben weiterhin implizite Mitgliedschaft. Neue Communities erfassen
  ihre Eigentuemerposition, ohne zusaetzliche Mitgliedschaftszeilen anzulegen.
- Bestandsmigration: Erhaltenes GroupLinkMember.joinedAt wird uebernommen. Fuer
  Eigentuemer ohne Mitgliedschaftszeile ist nur die Eigentuemerschaft zum Zeitpunkt
  der Migration belegt. Deshalb wird keine fruehere Zugehoerigkeit erfunden.
  Nicht dokumentierte alte Austritte und Wiedereintritte bleiben unbekannt.
- Loeschen eines Profils oder einer Community loescht auch deren Historie und
  Zeitraeume. Austritt und Entfernen tun dies nicht.

Die Migration 20261006150000_community_membership_history muss nach der
Sichtbarkeitsmigration ausgefuehrt werden. Sie sperrt GroupLink/GroupLinkMember
waehrend Baseline und Trigger-Installation gegen parallele Schreibzugriffe und
laeuft in einer Transaktion. Vor Produktiveinsatz auf einer PostgreSQL-Testkopie
pruefen, einschliesslich Laufzeit, Sperrverhalten und paralleler Beitritte.
prisma db push ersetzt diese SQL-Migration nicht: Trigger, Check und partieller
Index sind absichtlich Teil der Migration. Noch keine Produktionsausfuehrung.

Verifikation: 38 erfolgreiche Tests einschliesslich uebergeordnetem Testfall;
Prisma-Schema validiert und Backend-Typecheck erfolgreich. Neue Tests decken
Baseline, Wiederholungen, Rollback, Austritt/Wiedereintritt in einer Transaktion,
Entfernen, unabhaengige Profile desselben Accounts, Eigentuemerwechsel und
kaskadierende Loeschung ab. PGlite ist kein Nachweis fuer parallele Last auf
Produktions-PostgreSQL. Keine neue mobile Oberflaeche oder Punkteberechnung.

## Stand von Arbeitspaket 4: Dach-Community

- Eine interne, eindeutige GroupLink.systemKey-Kennung BVRLY kennzeichnet die
  Dach-Community. Sie ist oeffentlich und vom Typ COMMUNITY. Normale Nutzer koennen
  diese Kennung weder anlegen noch aendern. Eine gleichnamige normale Community
  erhaelt keine Sonderrechte. Bestehende private Communities werden nicht umgewandelt.
- CommunityMembershipHistory.seniorityAt ist bei normalen Communities firstJoinedAt,
  bei der Dach-Community dagegen Profile.createdAt. Reale Mitgliedschaftszeiten
  beginnen erst bei Aufnahme; keine rueckwirkende Aktivitaet oder Punktegutschrift.
- Nach ausdruecklicher Aktivierung nimmt ein Profile-INSERT-Trigger neue Profile in
  derselben Transaktion auf, auch bei Registrierung mit nested Prisma-Create.
  Keine Aufnahme bei Login oder Profilbearbeitung. Mehrere Profile eines Accounts
  werden weiterhin eigenstaendig behandelt.
- Ein administrativer Bestandslauf nimmt nur Profile ohne bisherige Dach-Historie
  auf. Austritt und Entfernen bleiben daher auch bei Wiederholung erhalten.
  Bewusster Wiedereintritt per Link bleibt moeglich und eroeffnet einen neuen
  Mitgliedschaftszeitraum ohne die Fruehposition zu ersetzen. Der Eigentuemer bleibt
  wie bisher implizites Mitglied und kann nicht selbst austreten.
- Keine paarweisen Connections, keine Thread-/ThreadMember-Massenanlage. Ein
  manueller Beitritt legt ebenfalls keinen Chat oder solche Connections an.
  Auch API-Aufrufe, veraltete Chat-Zeilen und Eigentuemeraktionen erlauben keinen
  Dach-Chat; die vorhandene Community-Ansicht blendet die Chat-Steuerung dort aus.
- Persoenliche Mitglieder-Posts werden nicht allein wegen der Dach-Mitgliedschaft
  in den Moments-Mix aufgenommen. Explizite Dach-Beitraege bleiben enthalten.
  Der Mitglieder-Mix normaler Communities bleibt unveraendert. Vorsorglich werden
  Dach-Connections auch im Homefeed nicht als persoenlicher Empfehlungsgrund genutzt.
- Die Dach-Community bleibt oeffentlich suchbar, wird aber nicht im Community-
  Vorschlagsblock erneut beworben, auch nicht nach einem Austritt.

### Aktivierung und Betrieb

Die Migration 20261006170000_network_community folgt auf die Historienmigration.
Sie installiert Struktur und Trigger, erstellt aber keine Dach-Community und
nimmt alleine noch keine Profile auf. Kein Startguthaben oder Einflussranking.
Wie die vorherige Migration zuerst auf einer PostgreSQL-Testkopie pruefen;
prisma db push allein reicht wegen der SQL-Trigger nicht.

Das lokale Verwaltungsskript verwendet die konfigurierte DATABASE_URL und braucht
die explizite ID eines bestehenden, nicht gesperrten Verwaltungsprofils. Der Name
oder ein vorhandener Admin wird nicht automatisch als Eigentuemer ausgewaehlt.
Nach Tests und bewusster Auswahl der Zielumgebung vom Repository-Root aus:

```sh
# Nur Vorschau: keine Aenderungen, betroffene Profilanzahl und Eigentuemer pruefen.
pnpm --filter server community:setup --owner-id <PROFILE_ID>

# Erst nach ausdruecklicher Freigabe fuer diese Datenbank aktivieren.
pnpm --filter server community:setup --owner-id <PROFILE_ID> --apply
```

Aktivierung und Bestandsaufnahme laufen atomar. Nur dieser Verwaltungslauf sperrt
Profile, GroupLink und GroupLinkMember gegen parallele Schreibzugriffe, damit weder
neue Profile im Aktivierungsfenster verloren gehen noch Austritte ueberholt werden.
Sperrwartezeit maximal 5 Sekunden, Transaktionszeit maximal 60 Sekunden. Auf echten
Bestandsmengen testen und in einem Wartungsfenster ausfuehren; bei Fehlern wird
zurueckgerollt. Normale Registrierungen brauchen keine solche Tabellensperre.
Die Vorschau ist eine Momentaufnahme, kein Lock oder verbindlicher spaeterer Zaehler.

Ein erneuter Lauf wechselt weder Eigentuemer noch Sichtbarkeit und aktiviert keine
deaktivierte/abgelaufene Dach-Community. Solange diese inaktiv oder abgelaufen ist,
werden auch neue Profile nicht automatisch aufgenommen. Endgueltige Loeschung
des Eigentuemerprofils loescht wie bisher seine Communities samt Historie; deshalb
ein dauerhaft vorgesehenes Verwaltungsprofil waehlen, keine Loeschsperre erfinden.

Verifikation: 46 erfolgreiche Tests einschliesslich uebergeordnetem Testfall;
Backend-Typecheck erfolgreich. Die Tests pruefen echte Migrationen, dry-run und
Wiederholung, Senioritaet, Austritt/Entfernen, direkte/nested/API-Profilanlage,
Rollback, separate Profile desselben Accounts, explizite Posts, normale Community-
Funktionen, Chat-Sperren, interne Kennung und Deaktivierung. Keine native Abnahme
oder Mehrbenutzer-Lastmessung auf Produktions-PostgreSQL. App-Typecheck weiterhin
mit den sechs bereits bekannten Fehlern ausserhalb dieser Aenderung.
Noch kein produktiver Aktivierungslauf, keine Migration auf Produktion und kein Push.

## Stand von Arbeitspaket 5: Inaktive Buchungsgrundlage

CommunityInfluenceSettlement und CommunityInfluenceCredit speichern interne
Abrechnungsbelege und profilbezogene Gutschriften. Die Migration
20261006190000_community_influence_ledger folgt auf die Dach-Migration und legt
nur leere Tabellen an. Es gibt keine Startgutschriften, keine API zum Erzeugen
von Einfluss, keinen Scheduler, keine Erfassung von Aktivitaeten und kein Ranking.

recordCommunityInfluenceSettlement ist nur fuer einen spaeteren internen Rechner
vorgesehen. Dieser muss qualifizierte, zeitanteilige Betraege liefern. Der
Buchungsdienst selbst berechnet keine Gewichte oder Aktivitaetspunkte.

- Jeder Beleg speichert Community, abgeschlossenes Zeitfenster [Beginn, Ende),
  Regelversion, Hash der Berechnungsgrundlage und Hash der kanonisch sortierten
  Gutschriften. Ganzzahlige BigInt-Recheneinheiten vermeiden Rundungsfehler;
  deren spaetere Darstellung als Punkte ist noch nicht festgelegt.
- Identische Wiederholung gibt denselben Beleg zurueck. Geaenderte Regelversion,
  Grundlage, Budget oder Verteilung fuer denselben Zeitraum werden abgelehnt,
  nicht stillschweigend ein zweites Mal verbucht.
- Eine transaktionale Zeilensperre auf der Community serialisiert interne
  Abrechnungen; auch anders zugeschnittene, ueberlappende Zeitraeume werden
  abgelehnt. Angrenzende Zeitraeume und andere Communities bleiben getrennt.
- Beleg und alle Gutschriften werden gemeinsam geschrieben oder zurueckgerollt.
  Negative/Null-Gutschriften, doppelte Profile, Budgetueberschreitung, zukuenftige
  Zeitraeume und fehlende Provenienz werden abgelehnt. Leere Abrechnungen sind
  moeglich. Fremdschluessel verhindern communityfremde Gutschriften.
- Neue Buchungen verlangen eine aktive oeffentliche Community sowie positive
  Ueberschneidung mit belegter Mitgliedschaft und ein aktuell nicht gesperrtes
  Empfaengerprofil. Der spaetere Rechner muss den genauen Zeitanteil bestimmen;
  die Buchungspruefung ist kein Ersatz dafuer oder fuer Aktivitaetsqualifizierung.
- Austritt loescht keine Gutschriften. Reine Abwesenheitsintervalle sind nicht
  abrechenbar. Endgueltige Profil-/Community-Loeschung entfernt die zugehoerigen
  Gutschriften. Eine Wiederholung eines schon abgeschlossenen Belegs stellt
  geloeschte Profilgutschriften nicht wieder her. Beleg-Summen dokumentieren die
  urspruengliche Abrechnung; aktuelle Bestaende ergeben sich aus noch vorhandenen
  profilbezogenen Gutschriften.

56 Tests einschliesslich des uebergeordneten Testfalls erfolgreich;
Backend-Typecheck erfolgreich. Tests umfassen Wiederholungen, Konflikte,
Ueberlappung, Zeitgrenzen, BigInt-Genauigkeit, Budgets, Rollback nach Schreibvorgaengen,
Mitgliedschaftszeiten, Null-Zeitraeume, Austritt, separate Profile und Loeschung.
Mehrere echte PostgreSQL-Sessions und grosse Abrechnungen sind noch zu pruefen;
die isolierte PGlite-Suite ersetzt keinen Parallelitaets-/Lasttest.

Der obige Abschnitt beschreibt den vorherigen Zwischenstand der Buchungsgrundlage.
Die folgende Erweiterung schliesst Paket 5 lokal ab. Keine Produktionsmigration,
Aktivierung oder Veroeffentlichung.

## Stand von Arbeitspaket 5: Einflusserwerb

Die Migration 20261006210000_community_influence_accrual ergaenzt ein Ereignisjournal,
eine leere Einstellungstabelle und getrennte Gutschriftanteile. Sie startet keinen
Erwerb. Ein Punkt entspricht intern 1.000.000 BigInt-Einheiten.
20261006230000_influence_growth_positions ergaenzt eine gespeicherte Eintrittsposition,
einen persoenlichen Wachstumszaehler sowie die Wachstumsmenge je Gutschrift. Auch diese
Migration erfindet keine historischen Punkte und aktiviert nichts.

### Startkalibrierung

| Bestandteil | Startwert | Begrenzung pro Community und UTC-Tag |
| --- | --- | --- |
| Neues qualifiziertes Profil | Differenz des kumulativen Wachstumswerts, siehe Formel unten | Hoechstens Netto-Mitgliederzuwachs; kein fixes Tageslimit von 20 Profilen |
| Gemeinschaftliche Aktivitaet | 0,25 Punkte je unterschiedlichem aktivem Profil, ohne Beitrittsmultiplikator | Hoechstens 20 aktive Profile |
| Eigene Beteiligung | 1 Punkt fuer Reaktion auf den Beitrag eines anderen Autors | Hoechstens 10 verschiedene Autoren je Profil |
| Resonanz | 2 Punkte je anderem reagierenden Profil | Hoechstens 20 verschiedene reagierende Profile je Autor |

Der bisherige pauschale Faktor 1 bis 4 entfaellt. Fuer jedes Profil wird nur das
qualifizierte Wachstum G gezaehlt, das nach seinem ersten Beitritt und waehrend
eigener Mitgliedschaft erfasst wurde. Eigene und exakt gleichzeitige Beitritte
zaehlen nicht. Abwesenheit erhoeht weder Punkte noch den Wachstumszaehler.

P ist die bei der ersten Abrechnung gespeicherte historische Eintrittsposition nach
seniorityAt, nicht die aktuelle Zahl aktiver Mitglieder. Gleichzeitige Zeitstempel
teilen dieselbe Position. In der Dach-Community bestimmt Profile.createdAt diese
Reihenfolge, ohne alte Wachstumspunkte zu vergeben. Austritte behalten ihre Historie;
Loeschungen anderer Profile aendern bereits gespeicherte eigene Positionen nicht.

```text
Referenz R = max(100, P)
Kumulativer Wachstumswert W(G) = 8 * G * (1 + log2(1 + G / R))
Neue Gutschrift = W(G bisher + neu miterlebtes Wachstum) - W(G bisher)
```

Der logarithmische Anteil wird auf Millionstel abgerundet; die restliche Rechnung
und Speicherung erfolgen ganzzahlig. 8 und 100 sind konfigurierbare Startwerte.
Bei G = 0 bleibt der Wert null, unabhaengig von der Groesse der Community beim
Eintritt. Die Referenz 100 verhindert grosse Multiplikatorspruenge in Kleinstgruppen.
Mit demselben qualifizierten Wachstum ergibt eine grosse Welle oder eine Verteilung
ueber mehrere Tage denselben kumulativen Wert. Es wird nur die Differenz gebucht,
kein bereits verdienter Betrag erneut ausgeschuettet.

Beispiele ohne Aktivitaet, Abwesenheit und Austritte:
- Erster miterlebter Beitritt bei Position 1: rund 8,115 Punkte, nicht pauschal 32.
- Position 10, anschliessend 9.990 qualifizierte Beitritte: rund 611.930 Punkte.
- Position 9.000, anschliessend 1.000 qualifizierte Beitritte: rund 9.216 Punkte.
  Der fruehe Einstieg erhaelt hier ueber 60-mal so viel Wachstumseinfluss.

Es gibt keinen gemeinsamen Punktetopf und keine Teilung persoenlicher Punkte durch
die Mitgliederzahl. Eigene Beteiligung und Resonanz liefern weiterhin bis zu 10
bzw. 40 Punkten taeglich zusaetzlich zur gemeinsamen Entwicklung. Ein endlicher
Vorsprung kann bei stagnierendem Wachstum ueberholt werden, aber ein sehr grosser
Wachstumserfolg kann mit diesen Startwerten jahrelangen Vorsprung bedeuten. Die
Simulation eines 320-Punkte-Vorsprungs beweist keine faire Aufholzeit fuer jede
Community-Groesse. Diese Relation und die spaetere Rankingwirkung vor Aktivierung
an realistischen Szenarien kalibrieren; keine garantierte Influencer-Reichweite.

### Qualifizierung und Grenzen

- Beitritte werden atomar mit der Mitgliedschaft erfasst. Nur der erste Beitritt
  liefert ein Ereignis; Wiedereintritt erneuert es nicht. Fuer Wachstum muss dieser
  Zeitraum bis zum Tagesende durchgehend bestehen. Kein 48-Stunden-/7-Tage-Modell.
- Nettozuwachs ist die positive Differenz der aktiven, nicht gesperrten Profile
  unmittelbar vor Beginn und Ende des Zeitfensters. Austritte koennen neue Beitritte
  aufzehren; wiederkehrende alte Profile allein erzeugen keine Wachstumspunkte.
- Dach-Bestandsimporte werden explizit als administrativer Vorgang markiert und
  erzeugen keine Wachstumsereignisse. Erst nach Aktivierung neu erstellte Profile
  koennen dort qualifiziertes Wachstum liefern. Kein nachtraegliches Startguthaben.
- Likes/Kommentare erfassen pro Profil und Beitrag nur den ersten Vorgang in der
  Community. Loeschen und Wiederholen eroeffnet keine neue Berechtigung. Pro
  reagierendem Profil und Autor zaehlt zudem hoechstens eine Reaktion pro Tag.
- Nur explizite IMPORT-Zuordnung zu einer oeffentlichen aktiven Community zaehlt.
  Private, verwaiste oder gemischt private Zuordnungen werden ausgeschlossen.
  Selbstreaktionen, reine Views und die Anzahl der Uploads liefern keine Punkte.
- Das reagierende Profil muss zur Ereigniszeit Mitglied sein. Persoenliche Resonanz
  erhaelt der Autor nur waehrend eigener Mitgliedschaft. Abwesenheit wird nicht
  nachvergutet; bereits gebuchter Einfluss bleibt bei Austritt erhalten.
- Bei der Abrechnung muss noch ein Like oder Kommentar dieses Profils existieren,
  der vor Ende des Zeitfensters angelegt wurde. Geloeschte Reaktionen, Sperren,
  Blocks und entfernte Community-Zuordnungen koennen ungebuchten Erwerb ausschliessen.
  Abgeschlossene Belege werden danach nicht nachtraeglich umgeschrieben.
- Profile eines Accounts bleiben eigenstaendig. Die Grenzen erschweren Wiederholungs-
  und Mengenfarming, beweisen aber weder unterschiedliche Menschen noch inhaltliche
  Qualitaet. Absprachen und viele kontrollierte Profile bleiben ein Missbrauchsrisiko.
  Eine Aktivitaetspflicht und ein Limit auf wenige staerkste Community-Positionen
  wurden ausdruecklich abgelehnt und sind nicht eingebaut. Kein Startbonus verhindert
  nicht jedes Farming durch viele fortbestehende, kontrollierte Profile/Communities.
  Rankingwirkung und Missbrauchsbeobachtung bleiben Teil der spaeteren Abnahme.

### Betrieb und Aktivierung

Erst auf einer PostgreSQL-Testkopie pruefen. Die vorhandenen Zeitspalten haben keinen
Zeitzonentyp; die Verbindung muss UTC verwenden. Aktivierung/Abrechnung pruefen dies
und verweigern andere Datenbankzeitzonen. Historische Daten nicht blind umkonvertieren.

```sh
# Nur Vorschau, keine Schreibvorgaenge:
pnpm --filter server community:influence --activate

# Bewusste Aktivierung in der gewaehlten DATABASE_URL, fruehestens naechste UTC-Mitternacht:
pnpm --filter server community:influence --activate --apply

# Vorschau der naechsten offenen Tagesabrechnung, getrennte Anteilssummen:
pnpm --filter server community:influence --run

# Abgeschlossene Tage buchen, ohne Rankingwirkung:
pnpm --filter server community:influence --run --apply
```

Optional --policy-file <datei.json> bei Aktivierung akzeptiert ein vollstaendiges,
validiertes Regelobjekt. Aktivierte Regeln sind als Snapshot mit Versionshash fixiert;
spaetere Aenderungen brauchen eine ausdrueckliche neue Regelversion mit Gueltigkeits-
zeitraeumen, die diese erste Fassung noch nicht anbietet. Keine stille Neuberechnung.
Die neue Formelfassung verwendet community-v2 und ein geaendertes Regelobjekt. Eine
bereits aktivierte v1-Konfiguration wird abgelehnt, nicht still umgerechnet. Auch
ein manuelles Aendern von Regeln samt Hash darf nicht an bisherige Tagesbelege mit
anderer Regelversion anschliessen. Vor einem solchen spaeteren Upgrade ist ein
ausdruecklicher Versionsuebergang erforderlich; bisher wurde nichts produktiv aktiviert.

Der Scheduler ist nur mit ENABLE_COMMUNITY_INFLUENCE_WORKER=true aktiv, stuendlich
um Minute 10 UTC. Ohne gespeicherte Aktivierung tut er nichts. Abrechnung erst nach
Tagesende plus 5 Minuten. Ein Lauf bearbeitet maximal 100 Communities mit je 7 Tagen
Rueckstand, die aeltesten offenen Zeitfenster zuerst. Fehler werden gemeldet und beim
naechsten Lauf erneut versucht. Abschalten des Workers pausiert nur die Abrechnung,
nicht das nach Aktivierung laufende Journal; spaeteres Nachholen bleibt moeglich.

Gemeinschaftssperre, Beleg, Gutschriften, Eintrittsposition und Wachstumszaehler liegen
in derselben Transaktion. growthCount je Gutschrift dokumentiert die neue Menge;
der Mitgliedschaftszaehler wird genau einmal entsprechend erhoeht. Ein Rollback
setzt alles zurueck. Vorschau und Wiederholung erhoehen keinen Zaehler.
Ereignisse werden nach der gemeinsamen Sperre zeitgestempelt. Wiederholte Jobs
geben bestehende Belege zurueck; keine doppelten oder ueberlappenden Tagesgutschriften.
Es gibt keine oeffentliche Mutations-API zum Erzeugen von Punkten. Kein automatisches
Loeschen des Journals: Deduplizierungsschluessel duerfen nicht durch Aufraeumen
verloren gehen. Endgueltige Profil-/Post-/Community-Loeschung kaskadiert wie definiert.

Verifikation: 85 Tests inkl. uebergeordnetem Fall erfolgreich, Backend-Typecheck
erfolgreich. Noch ausstehend vor Aktivierung: echte PostgreSQL-Parallelitaet mit
Beitritt/Austritt/Loeschung und mehreren Workern, Query-Plaene und Laufzeit auf grossen
Dach-Communities, Betriebsueberwachung und fachliche Kalibrierung. Das Journal und
die pro Profil gespeicherten Tagesgutschriften wachsen mit Nutzung; PGlite ist kein
Lastnachweis. Paket 6 soll die persoenlichen Anteile und den Abrechnungsstand sichtbar
machen; aktuell gibt es weder neue Punkte-UI noch veraenderte Feed-Sortierung.
Die Wachstumstests vergleichen zusaetzlich 10 gegen 9.000 bei 10.000 Mitgliedern,
Wellen gegen verteiltes Wachstum, Abwesenheitsluecken, gleichzeitige Beitritte,
fehlende Aktivitaetspflicht, additive Community-Positionen und die effiziente
Intervallzaehlung gegen eine einfache Referenzberechnung. Diese vermeidet eine
Mitglieder-mal-Beitritte-Schleife, ersetzt aber keine Datenbank-Lastmessung.

## Stand von Arbeitspaket 6: Widerrufbare Unterstuetzung

Die Migration 20261007090000_influence_support ergaenzt genau eine optionale
Zuordnung je eigener Mitgliedschaftshistorie. Sie aktiviert weder Erwerb noch
Ranking und erzeugt keine Credits. Ohne Empfaenger gilt das eigene Profil.
Der vorhandene Beitritts- und Wachstumsfortschritt bleibt unveraendert.

- Der gesamte selbst erworbene Einfluss einer Community einschliesslich kuenftiger
  Gutschriften kann genau einem Empfaenger zugeordnet werden. Keine Teilbetraege.
- Wechsel und Ruecknahme aendern nur die Zuordnung, nie den Eigentuemer oder Betrag
  einer Gutschrift. Der vorige Empfaenger behaelt keine Kopie des Einflusses.
- Empfangene Unterstuetzung wird separat summiert und niemals weitergereicht.
  Auch gegenseitige Zuordnungen erzeugen keine Rekursion oder Multiplikation.
- Verschiedene Profile desselben Accounts bleiben eigenstaendig. Empfaenger muessen
  nicht Mitglied der Community sein; eine Zuordnung verleiht keine Inhaltsrechte.
- Austritt aus einer oeffentlichen Community erhaelt die Zuordnungsmoeglichkeit fuer
  den bestehenden Einfluss. Weitere Gutschriften entstehen nur waehrend Mitgliedschaft.
- Private Communities erzeugen keinen Einfluss und erlauben keine neue Zuordnung.
  Nach Austritt wird ihre aktuelle Metadatenzeile auch hier nicht mehr ausgeliefert.
- Gesperrte Profile, beidseitig gepruefte Blockierungen zwischen Geber und Empfaenger
  sowie inaktive/abgelaufene Communities pausieren die Unterstuetzung. Ebenso pausiert
  eine Quelle bei einer Sperre ihres Eigentuemers oder einem Block zwischen Geber
  und Community-Eigentuemer. Credits bleiben erhalten; nach Entsperrung kann die
  bestehende Zuordnung wieder gelten. Ruecknahme bleibt fuer ungesperrte Geber moeglich.
- Wird ein Empfaenger geloescht, faellt die Position an den Geber zurueck (SET NULL).
  Endgueltige Loeschung von Geberhistorie/Community entfernt ihre Zuordnung.

Neue APIs: myCommunityInfluence (eigene paginierte Positionen und Gesamtsummen),
communityInfluenceRecipients (begrenzte Profilsuche) und setCommunityInfluenceRecipient
(eigene Zuordnung setzen/loeschen). Die Mutation prueft expectedProfileId gegen die
authentifizierte Identitaet, damit ein paralleler Profilwechsel keine andere Position
aendert. Empfaengerdaten verwenden einen kompakten Typ ohne Account oder private Inhalte.
Alle Punktbetraege werden als exakte ganzzahlige Zeichenketten uebertragen.

Die Uebersicht verwendet einen konsistenten Repeatable-Read-Snapshot. Zuordnungen
werden pro Historie serialisiert, in derselben Sperrreihenfolge wie die Abrechnung.
Die Gesamtsummen sind unabhaengig von der angezeigten Seite. Positionslisten sind
paginiert, Gesamtberechnung liest derzeit aber alle eigenen und eingehenden Quellen;
Lastmessung und gegebenenfalls SQL-Aggregationsoptimierung bleiben vor Produktion offen.

App: Blitzsymbol rechts oben in Moments, eigener Bildschirm ohne neuen Haupttab.
Er zeigt erworbenen, empfangenen und zugeordneten Einfluss, die Community-Positionen,
die drei Erwerbsanteile und den letzten Abrechnungsstand. Die Empfaengeransicht zeigt
Profilbild/Namen mit einer animierten Verbindung. Bewegung pausiert im Hintergrund,
bei nicht fokussiertem Bildschirm und bei reduzierter Bewegung. Auswahl erfolgt per
Profilsuche und ausdruecklicher Bestaetigung; Ruecknahme setzt das eigene Profil ein.
Private Communities haben den gewuenschten Info-Hinweis. Nicht aktiver Erwerb und
fehlende Rankingwirkung werden als Status ausgewiesen, nicht als bereits aktive Reichweite.

Die Ansicht verwendet keine gemeinsam gecachten Kontostaende. Profilwechsel setzt
ihren Zustand zurueck; spaete Such-/Ladeantworten ersetzen keine neueren Daten.
Mutationserfolg wird serverseitig erneut gelesen. Fehler bleiben lokal mit Retry,
anstatt zusaetzlich das globale Netzwerkfehlerfenster zu zeigen. Deutsch/Englisch,
Pull-to-refresh, Pagination, Leer-, Lade-, Fehler- und gesperrte Zustaende sind vorhanden.

Verifikation: 96 API-/Migrationstests erfolgreich, Backend-Typecheck erfolgreich.
Die reale RN-Komponente wurde mit RN Web/Playwright bei 320, 390, 768 und 1280 Pixeln
in hell/dunkel und DE/EN geprueft, einschliesslich Animation, reduzierter Bewegung,
Bildern, Suchrennen, Mutation-Retry, Zuordnung/Ruecknahme, privaten Hinweisen,
Pagination und leerer Ansicht. Native Bridges und Navigation waren dabei ersetzt.
Native iOS-/Android-Abnahme und echte PostgreSQL-Parallelitaet stehen aus.
App-Typecheck zeigt dieselben sechs vorhandenen Fehler wie vor Paket 6, keine neuen.
Keine Produktionsmigration, keine Erwerbsaktivierung, kein Push, kein Ranking-Eingriff.

## Stand von Arbeitspaket 7: Begrenzte Rankingwirkung

Einfluss ist in homeFeed (SONGVERWANDT/personalisiert) und communityMomentsFeed
(Communities-Mix im Moments-Tab) eingebunden. FOLLOWING, direkte groupLinkPosts,
postsByUser/Profilraster, Kontextfeeds, reelsFeed und Explore bleiben unveraendert.
Die mobilen Listen uebernehmen die Reihenfolge dieser APIs bereits ohne Nachsortierung.
Es gibt keine neue oeffentliche Punktzahl am Post und keine zusaetzliche Navigation.

Die Quellen und Sichtbarkeitsfilter bleiben vorgeschaltet. Einfluss kann weder
eine nicht passende Community als Empfehlungsgrund hinzufuegen noch private,
blockierte oder gesperrte Inhalte sichtbar machen. Auch eine Dach-Mitgliedschaft
erweitert dadurch nicht automatisch den Kandidatenkreis um alle persoenlichen Posts.

Berechnung pro Anfrage:

- Nur bereits sichtbare Kandidaten und deren berechtigte Autoren werden betrachtet.
- Eine gebuendelte SQL-Abfrage summiert selbst behaltene und zugeordnete Credits.
  Sie verwendet die gleichen Block-, Sperr-, Ablauf- und Community-Regeln wie die
  Einflussuebersicht. Empfangene Credits werden niemals erneut weitergereicht.
  Es gibt keinen globalen Cache, der einen Empfaengerwechsel laenger wirken laesst.
- Alle Positionen zaehlen, auch von mehreren Profilen desselben Accounts. Der
  Ledger bleibt exakt in BigInt-Einheiten; nur die Sortierung verwendet Gleitkomma.
- Ohne gueltige Rankingaktivierung oder ohne berechtigte neue Post-Kandidaten
  findet keine zusaetzliche Einflussabfrage statt.

Vorlaeufige Startwerte: 72 Stunden Beitragsalter, 24 Stunden Halbwertszeit,
hoechstens 12 Rangplaetze Einflussvorsprung innerhalb eines 60-Post-Quellfensters.
Staerke = sqrt(Punkte / 5000) / (1 + sqrt(Punkte / 5000)). Der Vorrang ist
12 * Staerke * 2^(-AlterStunden / 24). So ergeben 100 Punkte bei einem ganz neuen
Beitrag etwa 1,49, 5.000 Punkte 6 und 600.000 Punkte etwa 11 Rangplaetze.
Das sind Sortierparameter, keine versprochenen Views, Follower oder Impressions.
Die Punktberechnung aus Paket 5 selbst wird nicht geaendert.

Vollstaendige chronologische 60er-Kandidatenfenster werden vor der Pagination
geladen. Innerhalb dieser Fenster bleibt die bisherige Kontextprioritaet die
Grundreihenfolge, auf die der begrenzte Vorrang angewendet wird. Aeltere Fenster
koennen nicht nach vorne springen. Damit ist bei aktiviertem Ranking auch die
Kontextsortierung bewusst auf frische Fenster begrenzt. Beide Modi verwenden
weiterhin die vorhandenen Quellmischungen und Profilvorschlagsbloecke.
Eine anschliessende lokale Abwechslungskorrektur vermeidet drei gleiche Autoren
nacheinander, wenn in den naechsten drei Positionen eine Alternative vorhanden ist.
Sie laesst Profilvorschlagsplaetze stehen. Diese separate Korrektur kann einen
Post je Tausch um bis zu drei Plaetze versetzen; 12 ist keine absolute Endplatzgarantie.
Fehlen andere Autoren, werden weder Posts verworfen noch Duplikate erzeugt.

Eindeutige Post-Abfragen begrenzen die Kandidaten bereits in der Datenbank;
mehrere Kontextzuordnungen erzeugen keine wiederholten Kandidaten. Quellen sind
auch jenseits des geladenen Ausschnitts voneinander abgegrenzt. Tests pruefen
mehrere Fenster und unterschiedliche Seitengroessen gegen dieselbe Datenbasis.
Die bestehenden Offset-APIs sind trotzdem kein eingefrorener Feed-Snapshot:
neue/entfernte Posts, neue Tagescredits oder ein Empfaengerwechsel waehrend des
Scrollens koennen spaetere Seiten veraendern. Client-Deduplizierung bleibt bestehen.

Aktivierung und Ruecknahme:

- ENABLE_COMMUNITY_INFLUENCE_RANKING ist standardmaessig false.
- Zusaetzlich ist COMMUNITY_INFLUENCE_RANKING_STARTS_AT als fester UTC-Zeitpunkt
  (ISO mit Z) erforderlich. Ohne Datum, bei ungueltigen Werten oder vor diesem
  Zeitpunkt bleibt Ranking aus. Das Datum darf nicht bei jedem Neustart neu
  erzeugt oder fuer alte Archive rueckdatiert werden.
- COMMUNITY_INFLUENCE_RANKING_MAX_AGE_HOURS (bis 168), HALF_LIFE_HOURS,
  MAX_PROMOTION (bis 20) und HALF_STRENGTH_POINTS verwenden jeweils denselben
  COMMUNITY_INFLUENCE_RANKING_-Praefix. Vollstaendige Namen in apps/server/.env.example.
- Abschalten des Flags stellt den bisherigen Feedpfad wieder her, ohne Credits
  oder Zuordnungen zu loeschen. Erwerbsworker und Dach-Aufnahme sind unabhaengig.
- rankingEnabled in der bestehenden API und die DE/EN-Hinweise zeigen den echten
  Konfigurationsstatus. Kein dauerhaft eingebautes "noch nicht aktiv" bei Aktivierung.

Verifikation: 107 Tests der isolierten Community-Suite erfolgreich, darunter
Aktivierung/Abschaltung, Altersgrenzen, Rundung, grosse Summen, vollstaendige
Community-Summierung, batchweise Abfrage, begrenztes Vorruecken, Autorenabwechslung,
Seitenkonsistenz, echte Resolver-Sortierung, Zuordnung/Ruecknahme und Zugriffsschutz.
Die bestehenden Unterstuetzungstests vergleichen nach jedem Zustandswechsel die
SQL-Rankingsumme mit der API-Uebersicht (Kreise, Bloecke, Sperren, Austritt, Loeschung).
Backend-Typecheck und git diff --check sind erfolgreich. Die reale RN-Ansicht
wurde erneut via RN Web/Playwright bei 320, 390, 768 und 1280 Pixeln geprueft,
zusaetzlich mit aktivem Rankingstatus in DE/EN bei 320 Pixeln. Native Bridges und
Navigation sind in dieser Vorschau ersetzt. Der App-Typecheck meldet weiterhin
dieselben sechs bestehenden Fehler aus Paket 6, keine neuen Fehler.
Produktive Lastmessung, native Abnahme und Kalibrierung der Startwerte bleiben
Bestandteil von Paket 8. Keine neue Migration in Paket 7; keine Aktivierung,
Produktionsaenderung, Veroeffentlichung oder Push ausgefuehrt.

## Stand von Arbeitspaket 8: Lokale Releasevorbereitung

Die sechs bekannten App-Typecheckfehler sind behoben: vorhandenes Expo-Dateisystem
statt fehlendem react-native-fs, Theme-Typ, statische Menurand-Stile und korrekt
verschachtelte Profilmarkierungen. Der letzte Punkt beseitigt auch einen moeglichen
Laufzeitfehler beim Oeffnen der Markierungen. Backend und App bestehen TypeScript.

Ein isolierter PostgreSQL-14.17-Testlauf wendet alle sieben Migrationen per Prisma
auf eine historische Fixture-Baseline an. Erneutes Deploy ist ein No-op;
Schemavergleich ohne Differenz. Zwei UUID-Defaultausdruecke und vier onUpdate-Regeln
im Prisma-Modell wurden an die bestehenden SQL-Migrationen angeglichen; keine
Migration wurde dafuer nachtraeglich umgeschrieben.

Echte Parallelitaet deckte einen Unique-Konflikt bei wiederholten gleichzeitigen
Beitritten auf. Mitgliedschaft und erstmalige Community-Chat-Erstellung behandeln
diese Wiederholungen jetzt atomar. Bestehende Chats brauchen keinen Insertversuch.
Der Test prueft echte GraphQL-Beitritte, einmalige Abrechnung und konkurrierende
Zuordnungen. 112 Tests auf PostgreSQL erfolgreich; PGlite 108 erfolgreich und vier
PostgreSQL-spezifische Tests uebersprungen.

Neu: community:check als rein lesender Vorabcheck fuer Migrationschecksummen,
Trigger, UTC und Aktivierungsparameter. Er aktiviert oder repariert nichts.
Die getrennte Migration/Dach-Aufnahme/Erwerbs-/Ranking-Aktivierung samt Rueckfallplan
steht in [community-release-checklist.md](community-release-checklist.md).

Offline-Expo/Hermes-Exporte fuer beide Plattformen erfolgreich; keine signierten
nativen Builds. RN-Web-Abnahme der Einflussansicht erneut erfolgreich; zusaetzlich
Markierungsansicht und Menurand-Stile geprueft. Native Bridges waren ersetzt.
Native End-to-End-Abnahme, Tests mit realistischer Datenmenge, vollstaendige
Schreibrennen bei Austritt/Loeschung und fachliche Kalibrierung bleiben offene
Freigabeschritte. Keine Produktionsmigration, Aktivierung oder Veroeffentlichung.

## Arbeitspakete

- [x] 1. Grundregeln und Paket-2-Zugriffe abgestimmt; offene Einflussparameter oben dokumentiert.
- [x] 2. Community-Typ, Sichtbarkeit und Berechtigungen lokal implementiert und API-getestet; native Abnahme offen.
- [x] 3. Community-Suche und Vorschlaege lokal implementiert, API und RN-Web-Komponenten geprueft; native Abnahme offen.
- [x] 4. Zugehoerigkeitshistorie und Dach-Community lokal implementiert und API-getestet; produktive Aktivierung separat.
- [x] 5. Erwerbsrechner, Ereignisjournal und Tagesabrechnung lokal getestet; konfigurierbare Startwerte, produktiv inaktiv.
- [x] 6. Widerrufbare Unterstuetzung und kompakte Moments-Ansicht lokal implementiert und getestet; native Abnahme offen.
- [x] 7. Einfluss in personalisiertem Homefeed und Moments-Mix lokal implementiert und getestet; separat deaktiviert.
- [ ] 8. Lokale Releasevorbereitung abgeschlossen; native Abnahme, Staging-Lastprobe und Freigabe offen.

Als Naechstes die offenen Freigaben der Release-Checkliste gemeinsam abarbeiten:
native Tests gegen Staging, Lastprobe und Ranking-Kalibrierung.
Produktive Migration, Aktivierung und Veroeffentlichung bleiben ausdruecklich separat.
