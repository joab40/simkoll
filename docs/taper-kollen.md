# Toppningskollen · testversion

Eget, initialt minimerat kort direkt under Formkollen i tränarens simmarkort.
Öppning hämtar data först på begäran och gör inga AI-anrop. Personligt aktuellt
tränarkonto krävs på servern. Simmare, delade koder, inaktiva/ej godkända profiler
och testprofiler har ingen åtkomst. AI-dialogen är som tidigare begränsad till
huvudtränare och superadmin med godkänd profil, aktiv AI-switch och budget.

## Aktivering

Kör `supabase/migrations/122_coach_taper_goals.sql` manuellt. Ingen migration
körs av appen eller av detta arbete. RLS är aktiverat, anon/authenticated saknar
direkta rättigheter. Nya målversioner sparas med serverkontrollerat profil-ID,
tränar-ID, tävlingsnamn och datum från kalendern. Även avaktivering är en ny rad.
Kalenderns ID är en snapshotreferens utan FK: en senare borttagen tävling ska
inte radera tränarens historik. Simmarens borttagning raderar målversionerna.
Senaste version per simmare/tävling gäller (created_at, id). Ingen samtidig
redigeringslåsning finns; senaste sparandet gäller. Backup/restore inkluderar
tabellen. Saknad SQL ger ett tydligt fel, inte en påhittad tom mållista.

## Plan, signal och samtal

- A/B/C gäller simmaren; officiella mästerskap antas inte automatiskt vara A.
- Flera mål och flera A-mål stöds. Nästa A-mål väljs först, men tränaren kan
  välja annan kommande tävling. Passerade aktiva mål finns i målhanteringen.
- Viktigaste tävlingsdag måste ligga inom tävlingen. Valfri lättningsstart får
  ligga högst 56 dagar före måldagen: en valideringsgräns, inte ett träningsråd.
- Planerad fas bestäms av tränarens datum, aldrig av känsloskattningar.
- Observerat läge använder Formkollens aktuella tre kalenderdagar och flaggor.
  Höga känslor är inte verifierad tävlingsberedskap; hög fart och tung kropp
  förblir blandade signaler. Varningar prioriteras framför positiva etiketter.
- Belastning är känd sjudagars-sRPE med rapporttäckning. Uppskattad planerad
  tid märks; minskad rapportering bevisar inte lättning. Ingen målprocent eller
  förutsagd formtoppsdag räknas fram. Om signalhämtning misslyckas kan målen
  fortfarande hanteras; ingen tom hälsobedömning konstrueras.
- Två A-mål inom 21 dagar ger en samtalspunkt. Det är en justerbar produktregel,
  inte evidens för att en viss individ inte kan prestera vid båda tävlingarna.
- Kalenderändringar jämförs mot sparad snapshot och markeras i målhanteringen.
  Mål flyttas inte automatiskt och pass/tävlingsanmälningar ändras aldrig.

## Tränardialog och dataval

Kortets dialog återanvänder simmarassistenten med förifylld, redigerbar fråga
om valt mål. Kategorin `taper` är ett uttryckligt känsligt tillval: målnoteringar,
senaste sparade målversioner och gruppens planering följande 28 dagar, tydligt
märkt som framtida/inte genomförd. Ingen godtycklig SQL eller skrivfunktion ges.
Det generella grundurvalet utökas inte automatiskt. Från Toppningskollen förväljs
det befintliga grundurvalet, träningstider och taper; sömn/sjukdom, kommentarer
och övriga privata tränaranteckningar är fortsatt separata tillval.

Förhandsgranskning visar exakt valt underlag. Aktiv bekräftelse krävs före
sändning till OpenAI; käll-/mål-/modelländring ogiltigförklarar signerad granskning.
Token-, kostnads- och storleksloggen samt sexfrågegränsen återanvänds. Inga
konversationer sparas i Simkoll. Responses API med `store:false`, strukturerat
svar, utan verktyg. Det är inte garanti för noll leverantörslagring:
[officiell OpenAI-dokumentation](https://developers.openai.com/api/docs/guides/migrate-to-responses).

Modellen får resonera om alternativa fokus/veckoupplägg men måste ange underlag,
osäkerhet och uppföljning. Inga fasta individuella belastningsprocent, säkra
sluttider, diagnoser eller klartecken vid sjukdom. Om hälsodata inte valts kan
assistenten inte bedöma sjukdomsläge/återhämtning. Resultat måste vara jämförbara
innan prestationsutveckling påstås. Gruppass och alternativ får inte summeras
som säkert genomförda pass. Fritext är källdata, inte instruktioner.

## Evidens och verifiering

Generell forskningsbakgrund finns som märkta källposter i taper-urvalet:
[Bosquet m.fl. 2007](https://pubmed.ncbi.nlm.nih.gov/17762369/) och
[trötthet inför toppning, 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC10915210/).
Forskningen validerar inte denna produkt eller dess trösklar. Ingen individuell
prediktionsmodell eller automatiskt träningsprogram har införts.

`tests/taper-kollen*` och `tests/taper-assistant.test.mjs` testar validering,
flera tävlingar, prioritering, signalbrist, append-only, roll/session/profil,
ingen planmutation, valda kategorier, framtida data och samtyckes-/signaturgränsen.
`/taper-kollen-qa.html` använder riktiga komponenter med fiktiva data och lokala
mockar för läsning, sparande, målkonflikt, sjukdomsflagga och tränardialog.
