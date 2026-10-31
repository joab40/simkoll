# Förhandsgranska pass som simmare

Tränaren kan välja **Förhandsgranska som simmare** bredvid publiceringsknappen
i Lägg upp ett pass, vid redigering och i granskningen av en Drive-/Excel-import.
Det är frivilligt att förhandsgranska. Befintlig publiceringsvalidering är kvar.

Förhandsgranskningen visar det aktuella, ännu osparade utkastet, inklusive
rubrik, huvudinriktning, meter, minuter, grupper, serier, starttider och
meddelande till simmarna. Vid import ingår endast flikar markerade som pass;
ej valda insimsflikar visas inte. Alla alternativ visas först; tränaren kan
välja ett enskilt alternativ utan att ändra vilka flikar som ska publiceras.
Alternativens meter summeras inte.

Mobil och Webb använder en egen visningsyta med appens riktiga stilmallar.
Mobil är högst 390 px bred och krymper för mindre skärmar. Webb är 1 080 px
bred och kan rullas i sidled på små skärmar. Visningen är ett upplåst pass,
såsom efter incheckning, inte en simulering av en särskild simmares behörighet.

Stäng, Escape och Tillbaka och redigera återgår till formuläret och återställer
fokus till knappen. Formulärtext, valda flikar och granskningsbekräftelse ändras
inte. Förhandsgranskningen sparar eller publicerar ingenting och gör inga
API-, AI- eller pushanrop. Publicera/Spara ändringar används separat.

`src/workout-card.jsx` återanvänds av den verkliga simmarvyn och förhandsvisningen.
Stilmallarna kopieras till en sandboxad iframe som bara tillåter samma ursprung,
inte skript. React renderar texten med vanlig escaping; inga utkast interpoleras
i HTML. Den yttre vyn är en modal dialog med inbyggd fokusfälla.

Ingen databasändring eller ny inställning krävs.
