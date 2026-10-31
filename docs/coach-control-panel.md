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
Knappen Uppdatera laddar både planering, incheckningar och sömn igen.
Veckans svar hämtas separat i paginerade, datumavgränsade läsningar, inte från
appens begränsade lista med de senaste svaren. Delvisa resultat visas inte
som en fullständig sammanställning. Anonyma svar visas bara när alla grupper är valda.

Listan **Ta en dialog** är minimerad från början, med antalet simmare synligt
även när den är stängd. Den visar bara upprepade, daterade signaler under de
sju dagarna fram till periodens sista dag (idag för pågående vecka). Detta
datumintervall står i kortet, och signaler nollställs inte på måndagar.
Gränserna är minst två olika dagar med låg känsla (1–2/5), låg
kroppskänsla (1–2/5), hög RPE (8–10/10) eller rapporterad sjukfrånvaro.
En ensam skattning, utebliven incheckning och fritext ger ingen automatisk
markering. Listan är ett samtalsstöd, inte en diagnos eller ett automatiskt
träningsbeslut. Tränaren kan öppna simmarkortet eller skriva ett privat
meddelande via den befintliga meddelandesidan. Sömnvarningar följer samma
regler som simmarkortet: de senaste tre rapporterade nätterna med högst sju
timmar ger gul/orange signal; fem sådana nätter inom sju dagar ger röd signal.
Upplevd sömnkvalitet, inte RPE eller sovtid, bestämmer sömnpilens riktning.
Saknat sömnunderlag visas tydligt och antalet märks då som ett minimiantal.

Gruppens expanderbara tabell visar också en försiktig jämförelse av
självskattad fartkänsla mellan vald och föregående kalendervecka. Det krävs minst två
svar i vardera perioden. Kontrollpanelen använder befintliga data och gör
inga AI-anrop eller nya databasändringar.
