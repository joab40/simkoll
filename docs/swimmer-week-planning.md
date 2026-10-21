# Planera denna vecka och nästa vecka

I simmarvyn finns **Denna vecka** och **Nästa vecka** ovanför rutnätet i
**Min träning den här veckan**. Veckoväljaren ändrar datum och planering i
rutnätet. Träningssummeringen, volymen och måluppföljningen ovanför gäller
alltid pågående vecka.

Planering kan ändras från idag till och med söndag nästa vecka. Genomförd
träning kan markeras för pågående vecka, till och med idag. Framtida
genomföranden blockeras både i formuläret och i API:et.

Varje plan sparas med måndagen för den vecka passet faktiskt hör till.
Planeringsbonusen (+2 poäng vid minst tre planerade dagar) gäller den veckan
och ges högst en gång, även om planeringen görs i förväg och ändras senare.
Nästa veckas plan syns också i tränarens kontrollpanel när den veckan väljs.

Sparade planer återläses för pågående och kommande vecka. Ingen SQL-uppdatering
behövs; befintliga planeringsrader och poängnycklar används.
