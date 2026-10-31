# Vår överenskommelse i simmarkortet

I tränarvyn, Simmare → öppna ett simmarkort, visas kortet **Vår överenskommelse**
direkt under Simmarens riktning. Kortet laddas bara för det öppna simmarkortet.

Källan är det senaste **genomförda** utvecklingssamtalet med en icke-tom sparad
överenskommelse. Samtalsdatum, därefter skapandetid och ID, avgör ordningen.
En senare redigering av ett äldre samtal byter inte källa. Ett nytt utkast,
Redo för samtal eller ett genomfört samtal utan text ersätter inte tidigare
överenskommelse. Avstängning av förberedelser återkallar inte texten i ett
genomfört samtal. En uttryckligt tömd `summary` återupplivar inte äldre textfält.

Kortet visar ett kort textutdrag, samtalsdatum och eventuellt uppföljningsdatum.
Visa hela/Visa mindre växlar till hela den sparade överenskommelsen.
Markdown-rubrikmarkörer och fetstilsmarkörer tas bort för läsbarhet; inga mål
tolkas, skapas eller ändras. Texten renderas som vanlig React-text, inte HTML.
Ingen ny AI-sammanfattning görs. Uppföljningsdatumet är en sparad planering,
inte en automatisk markering att en uppföljning fortfarande är ogjord.

Öppna utvecklingssamtalet går till exakt källsamtal och simmare, även om posten
inte ryms i den generella listans 200 senaste samtal. Befintlig samtalsredigering
används, inklusive skydd för osparade ändringar. Tillbaka till simmarkortet
återöppnar samma simmare och hämtar överenskommelsen på nytt. Uppdatera gör en
ny läsning utan att ändra någonting. Länken visas bara om samtalsmenyn är synlig.

Läsning använder `/api/goals?agreementCard=true&profileId=...`, endast för tränare,
med UUID-validering och avgränsning till en simmare. Endast överenskommelse och
referensdatum hämtas, utan interna anteckningar, simmarens formulärsvar eller
tränarens AI-underlag. Sökningen är paginerad och skiljer saknad text från
läsfel/avbruten sökning. Resultat för föregående profil visas inte när profil
eller inloggning byts. API-svaret får inte cachelagras.

Kortet gör inga skrivningar, AI-anrop, pushutskick eller nya målregistreringar.
Ingen SQL-migration behövs. Simmarens befintliga Mina utvecklingssamtal är oförändrad.
