# Energistjärna

Ersätter hjärta/ring/storlek/puls som livevisualisering i simmarlistan. Det gamla
beräkningsunderlaget finns kvar för historiska tester och belastningsdetaljer;
gamla `heart.color`, `readiness` och `speed.motion` styr inte stjärnan.

## En betydelse: färsk rapporterad träningskänsla

- Senaste giltiga heltal 1–5 per mått: kropp, dagskänsla och simfartkänsla.
- Rapporttid strikt inom föregående 24 timmar, inte i framtiden. Aktivitet idag
  eller igår i Europe/Stockholm. Efterregistrerad äldre aktivitet tänder inte.
- Fart kommer bara från genomförd simnings-efterrapport, inte gym eller tävling.
- Saknat mått: kontur och Mer aktuellt underlag behövs. Något under 3: Tyngre
  träningskänsla. Alla minst 3: Okej / blandad. Alla minst 4: Stark. Alla 5: Maxad.
- Stark/max får effekt bara om sjukdomskollen är tillgänglig med ett aktuellt,
  ej överhoppat uttryckligt Nej inom 24 timmar. Befintliga sömnsignaler över sju
  dagar eller sjukdom rapporterad senaste dygnet pausar effekten. Ett nyare
  överhoppat svar används inte som bevis på friskhet.
- Sömn ger inga bonuspoäng. Saknad sömn gör inte stjärnan till återhämtningsbevis.
- Belastning ger aldrig bonus, större symbol eller snabbare puls.
- Stark: mjuk turkos glöd. Max: guldglöd, dubbelpuls och en 1,8 sekunders
  gnistsekvens per ny maxsignatur/browser-session. Ingen ständig gnistloop.

Stjärnan visar inte faktisk form, hälsa eller tävlingsberedskap. Tränarens
uppföljning, historiska belastningsräkning och registrerade svar ändras inte.
Klienten låter effekten löpa ut utan API-anrop; servern använder redan befintliga
källor och läser även sjukdomssvarets befintliga updated_at. Ingen SQL krävs.
Tangentbord, touch/klick, Escape, fokusåtergång, rörelseinställning och
prefers-reduced-motion stöds. FAQ-exempel är syntetiska och pausade från början.
