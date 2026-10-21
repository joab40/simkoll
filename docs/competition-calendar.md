# Tävlingskalender och original-PM

1. Skapa tävlingen med datum, namn och berörda grupper. PM kan bifogas direkt
   i formuläret eller senare på tävlingskortet. PDF, JPG, PNG och WebP stöds
   upp till 3 MB. Om tävlingen sparas men filuppladdningen misslyckas visas det
   uttryckligen; ett nytt försök uppdaterar samma tävling.
2. Redigera tävling ändrar datum, plats, grupper och kommentarer. Det sparade
   grenprogrammet, anmälningsläget och det befintliga PM:et behålls. Äldre
   tävlingar har samma tillgängliga reglage som kommande tävlingar. Kalenderns
   dagar i veckoplaneringen följer tävlingens datum och grupper. Två tävlingar
   samma dag hålls isär; manuella planeringsrader ändras inte.
3. Original-PM lagras separat från AI-tolkningen. Granska och spara det tolkade
   grenprogrammet innan grenanmälan öppnas. Tom åldersklass visas som ej angiven,
   med hänvisning till PM, och betyder inte automatiskt alla åldrar.
4. Öppna grenanmälan kräver ett sparat program med valbara grenar. Att stänga
   anmälan raderar inga tidigare val. Simmaren kan läsa PM i Mina grenar även
   innan anmälan öppnats, för kommande tävlingar som gäller den egna gruppen.
5. PM kan bytas eller tas bort utan att grenprogrammet ändras. Ta bort tävling
   raderar däremot tävlingen och dess program, anmälningar och bilaga permanent
   efter en uttrycklig bekräftelse.

## Databasuppdatering

Kör `supabase/migrations/099_competition_pm_documents.sql` innan publicering.
Den skapar en separat PM-kolumn, en privat lagringsbucket, kopplingen till
veckoplaneringen och en transaktion för att spara grenval. Den kräver inga nya
miljövariabler eller API-rutter.
Tidigare val bevaras om grenkontroll eller en skrivning misslyckas; API:t gör
ingen destruktiv HTTP-reservlösning om funktionen saknas.

Alla tränare kan bifoga och läsa PM. Simmare behöver en giltig profil och
tävlingen måste gälla deras grupp (eller vara gruppgemensam). Servern utfärdar
en tidsbegränsad länk först efter kontrollen. Lagringssökvägar lämnas inte ut
i kalenderlistan. Bilagan påverkas inte när AI-programmets metadata uppdateras.
