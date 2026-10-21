# Gruppens veckoplanering i kontrollpanelen

Kontrollpanelen visar en veckomatris med morgonsimning, styrka, landträning och
eftermiddagssimning. Veckoväljaren visar måndag–söndag och följer det valda
gruppfiltret. **Uppdatera** hämtar nya registreringar.

Varje ruta visar antal simmare som har planerat passet i sin veckoplan (◆),
antal med registrerat genomförande eller närvaro (✓), samt antal som saknar
veckoplanering för passet. Planerat och genomfört räknas oberoende: en simmare
kan både ha planerat och genomfört samma pass. Ej planerat säger inget om
förväntad närvaro. Testprofiler räknas inte.

Tryck på en ruta för namn, planeringsstatus och status för just det passet,
exempelvis **Ska träna idag**, **Har tränat** eller **Ej närvarande**. Listan
kan sökas och filtreras på planerat, ej planerat och genomfört. Genomförandets
källa visas: efterrapport, egen veckomarkering, styrkeregistrering eller
tränarens närvaromarkering. Namnet öppnar simmarkortet.

Morgon- och eftermiddagspass hålls isär. En senare närvarorättelse kan ersätta
en äldre efterrapport, och en nyare efterrapport kan ersätta en äldre
närvaromarkering. Enbart avsikten att träna ändrar inte registrerad närvaro.
Efterrapporter utan närvaroregistrering visas som svar men räknas inte som
registrerade genomföranden. Efterregistreringar visas på aktivitetsdagen.
Tävling räknas inte som simträning och svar utan tydligt passval kopplas inte
automatiskt till morgon eller eftermiddag.

Underlaget hämtas bara för vald vecka via ett tränarskyddat API. Alla sidor
hämtas när veckan har många registreringar. Om någon källa inte går att läsa
visas ett fel, inte ofullständiga nollor. Ingen ny databasmigrering behövs.
