# Vercel Speed Insights

`@vercel/speed-insights/react` monteras en gång bredvid `<App />`, inte inuti
simmarens `<Shell>`. Därmed omfattas även inloggning, tränarvy och återställning.
Mätningen laddas bara i produktionsbyggen. Ingen databasändring eller API-nyckel
behövs. Integrationen skickar inte Simkolls profil-, tränings- eller chattdata.
`beforeSend` tar bort alla URL-parametrar, fragment och URL-inloggningsuppgifter
så att återställningstoken och pushlänkars profilreferenser inte följer med.

## Publicera och verifiera

1. Aktivera Speed Insights i rätt Vercel-projekt om det inte redan är aktiverat.
2. Publicera en ny produktionsdeploy med paketet och komponenten.
3. Besök produktionsadressen i en webbläsare utan blockerande tillägg.
4. Kontrollera i DevTools att Speed Insights-skriptet laddas från
   `/_vercel/speed-insights/script.js` eller Vercels genererade intake-sökväg.
5. Interagera med sidan och växla till en annan flik. Kontrollera att en
   `vitals`-förfrågan skickas; vissa mått skickas först när sidan döljs/lämnas.
6. Kontrollera Speed Insights-panelen för rätt projekt, miljö och tidsintervall.
   Inga historiska besök fylls på retroaktivt. Sammanställningen behöver trafik.

Ingen ytterligare telefonpush, AI-anrop eller användaridentifiering läggs till.
Simkolls interna vyer byter React-state utan att byta URL; detta är därför inte
en rapport över besök per intern skärm.

Officiell dokumentation:
- https://vercel.com/docs/speed-insights/quickstart
- https://vercel.com/docs/speed-insights/troubleshooting
- https://vercel.com/docs/speed-insights/package#beforesend
