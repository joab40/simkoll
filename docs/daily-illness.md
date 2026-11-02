# Sjukdomskänningar och uppföljning

Kör `supabase/migrations/112_daily_illness.sql` i Supabase före publicering.
Ingen äldre tids-, RPE- eller sjukdomsdata skrivs om. Tabellen är privat med RLS;
endast appserverns service-roll har åtkomst. Profilägaren härleds ur sessionen.
Profilradering tar med dagsvaren via FK. Inga nya AI-underlag läggs till.

Frivillig fråga en gång per profil/aktivitetsdag: Nej, Lite känningar, Jag känner
mig sjuk. Kan hoppas över. Vanlig sparning är idempotent (ignore-duplicates).
Explicit ändring i egen dagbok får ersätta svaret för idag/igår, inklusive
ta bort (status null, skipped true). Tränare får läsa men inte ändra.
Sparandet är separat och sker direkt, även om resten av incheckningen avbryts.

Samma sjudagarsregler används i simmarkort och kontrollpanel:

- Rött: sjuk idag/igår, eller lite känningar på minst tre dagar med senaste
  aktuella dagsvar lite känningar idag/igår.
- Rött: både kropp och dagskänsla 1–2 på samma minst tre olika dagar, minst
  en av dessa idag/igår. Enstaka/två tunga dagar blir inte röda i sig.
- Gult: låg kropp/känsla, äldre sjukdomssvar, aktuella lite känningar, eller
  RPE 8–10 på minst två olika dagar.
- Befintliga sömnregler behålls: två Dålig-nätter eller minst tre nätter med
  snitt <7h ger rött. Senaste tre rapporterade nätterna <=7h ger gult, minst
  fem <=7h inom veckan ger rött. Detta är produktregler, inte sömnmål.
- Planering utan registrerat genomförande visas separat och färgar inte
  hälsotrafikljuset. Bara planering ger inget måendeunderlag (grått).

Flera låga svar på samma dag räknas en gång. Minst ett lågt kroppssvar och
ett lågt känslosvar på dagen krävs för kombinationen; de kan vara olika
incheckningar samma aktivitetsdag. Saknade svar räknas aldrig som noll.
Trafikljusets tidigare period räknas om med samma nya regler. Därför är det
inte möjligt att tolka en ändrad rödsiffra efter releasen som en hälsoförändring.

Aktuella positiva sjukdomssvar blockerar hjärtats positiva lägen, även vid
låg träningsbelastning. Historiska svar visas med datum, inte som diagnos.
Varken tung kropp, RPE eller belastningsförändring används som en beräknad
sjukdomsrisk. Följ upp observationerna med simmaren.

För driftsättning: granska de tidigare röda simmarnas orsaker och nya färger
med tränaren i läsläge. Inget påstående görs här om hur många av de tio som
byter färg; det kräver det verkliga underlaget. Ingen produktions-SQL körd
av kodändringen.
