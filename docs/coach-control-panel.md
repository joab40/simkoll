# Tränarens kontrollpanel

Kontrollpanelen nås i tränarvyn och följer det valda gruppfiltret. Den
sammanfattar den valda kalenderveckans identifierade incheckningar och visar
rapporterade genomförda aktiviteter, RPE, skriftlig/passrelaterad
återkoppling och belastning när både RPE och minuter är angivna. Belastningen
är `RPE × rapporterade minuter`, inte ett medicinskt mått eller planerad
träningsmängd. En tävlingsincheckning räknas inte som träningspass.

Den tidigare sidan **Förra veckan** finns nu i kontrollpanelen. Ett gemensamt
veckoval styr planeringsmatrisen, rapportkorten och veckans incheckningar,
inklusive känslor, dag-för-dag, aktivitet, kommentarer och klickbara svar.
Pågående vecka visar svar till och med idag; framtida veckor visar planering.
Knappen Uppdatera laddar planering, incheckningar, sömn och sjukdomskoll igen.
Veckans svar hämtas separat i paginerade, datumavgränsade läsningar, inte från
appens begränsade lista med de senaste svaren. Delvisa resultat visas inte
som en fullständig sammanställning. Anonyma svar visas bara när alla grupper är valda.

Listan **Ta en dialog** är minimerad från början, med antalet simmare synligt
även när den är stängd. Kropp/dagskänsla följer 14 dagar, övriga signaler
sju dagar fram till periodens sista dag (idag för pågående vecka). Rätt
datumintervall visas per signal och nollställs inte på måndagar.
2 = segt ger ingen uppföljningsvarning i sig. Rött för ihållande kropp eller
dagskänsla kräver 1/5 på minst fem olika dagar under 14 dagar, i samma mått,
med ett spann på minst åtta kalenderdagar och minst två sådana dagar de
senaste tre dagarna. Kropp och dagskänsla läggs inte ihop för att nå fem.
Aktuella ettor utan ihållande mönster och upprepad hög RPE visas gult i den
separata minimerade listan **Bevaka utvecklingen**. Direkta
sjukdomssvar idag/igår ger rött utan att vänta på upprepade trötthetsdagar.
Lite sjukdomskänningar ger gult; tre sådana dagar inom sju med ett aktuellt
känningar-svar idag/igår ger rött. Planeringsluckor ger ingen hälsovarning.
Fritext tolkas inte automatiskt. Listan är ett samtalsstöd, inte en diagnos eller ett automatiskt
träningsbeslut. Tränaren kan öppna simmarkortet eller skriva ett privat
meddelande via den befintliga meddelandesidan. Sömnvarningar följer samma
regler som simmarkortet: de senaste tre rapporterade nätterna med högst sju
timmar ger gul/orange signal; fem sådana nätter inom sju dagar ger röd signal.
Upplevd sömnkvalitet, inte RPE eller sovtid, bestämmer sömnpilens riktning.
Saknat sömn-/sjukdomsunderlag visas tydligt och antalet märks då som ett minimiantal.
Sömnsignaler från minst två Dålig-nätter eller minst tre nätter med snitt
under 7h ger fortsatt rött. Exakta produktregler finns i `docs/daily-illness.md`.
Rapporterad sjukdom räknar Sjuk-incheckning och Jag känner mig sjuk som
en enda dag per simmare; Lite känningar redovisas separat.

Varje uppföljningssignal har en informationsikon. Hovra, fokusera med
tangentbordet eller tryck på signalen för att se frågan, gränsen och vilket
datumintervall som används. Tryck igen, tryck utanför eller använd Escape
för att stänga. Låg känsla gäller den allmänna dagskänslan (”Hur känns det
idag?”), medan låg kroppskänsla gäller den fysiska upplevelsen av kroppen
(till exempel tung/öm eller pigg/fräsch). Vid gymträning motsvarar
Kraftlös = 1 och Seg = 2; bara ettan ingår i tungt-mönstret. Varje dag med minst en etta
räknas en gång, även om simmaren svarat flera gånger den dagen. Det är
antal dagar, inte ett medelvärde; saknade svar räknas inte som ettor eller
bevis på återhämtning. Trösklarna är justerbara produktregler, inte medicinska gränser.

Gruppens expanderbara tabell visar också en försiktig jämförelse av
självskattad fartkänsla mellan vald och föregående kalendervecka. Det krävs minst två
svar i vardera perioden. Kontrollpanelen använder befintliga data och gör
inga AI-anrop. Den nya frivilliga sjukdomskollen kräver SQL 112; befintlig
historik skrivs inte om.
