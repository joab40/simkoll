# Förvalt träningstillfälle vid Drive-import

## Tomma ytterområden i kalkylblad

Passimporten bedömer gränsen 300 rader/32 kolumner utifrån lagrade värden
och formler, inte kalkylbladets deklarerade arbetsområde. Tomma/formaterade
ytterområden från Excel och Google Kalkylark ignoreras; originalfilen ändras
inte. Noll, falskt, formelfel och formler med tomt eller saknat sparat resultat
räknas som innehåll. Även matrisformlers områden kontrolleras. Verkligt innehåll
utanför gränsen stoppar hela importen med cellreferens i felmeddelandet, utan
tyst avklippning. Gränserna 3 MB och 20 flikar kvarstår.

## Val av träningstillfälle

Granskningen av flikar hämtar coachskyddade `occasionChoices` för granskningsdatumet
med `includePlanning=true`. Publicerade pass, ej bortkopplade manuella simplaner och
tydligt namngivna, tidsatta simträningar från aktiverade SportAdmin-kalendrar ingår.
Tävlings-, läger-, anmälnings-, styrke- och landträningshändelser väljs inte som simning.
Delade kalenderposter med samma datum, klockslag och känd plats hålls ihop, inklusive
alla gruppnycklar. En redan representerad kalenderträning visas inte igen som tom träning.

- Ett gruppkompatibelt tillfälle: befintlig träning och själva tillfället förväljs.
- Flera: befintlig träning förväljs, men tränaren måste välja vilket tillfälle.
- Inget: nytt tillfälle förväljs och tränaren anger morgon/eftermiddag.
- Okänd tid på ett valt planeringstillfälle: tidsfältet visas som undantag.
- Datumbyte tömmer kopplingen och gör en ny läsning. Ett medvetet val av nytt tillfälle
  skrivs inte över om en tidigare läsning blir klar senare.
- Läsfel visas som fel, inte som att kalendern är tom. Publicering kräver antingen
  en vald befintlig träning eller ett uttryckligt nytt tillfälle.

Servern återvaliderar datum, mål, tid och grupp före skrivning. Kalendernyckelns
metadata hämtas från serverns kalenderläsning, inte från uppladdat filinnehåll.
Väljs en tom planeringsrad återanvänds just den raden, inte ett godtyckligt annat
pass samma eftermiddag. Övriga flikar får egna planeringsrader med samma alternativgrupp.
Stabila publicerings-ID:n och upplösning av förbrukad planeringsrad gör omförsök säkra.
Passalternativen summeras fortsatt inte som separata träningstillfällen.

Det vanliga formulärets äldre occasion-läsning för publicerade pass är oförändrad.
Ingen ny SQL eller miljövariabel krävs. Importgranskning och förval publicerar inget
i sig; tränaren måste fortfarande granska flikarna och trycka Publicera.
