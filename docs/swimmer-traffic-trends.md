# Trafikljus i Simmare

Röd, gul och grön visar antal profiler och förändringen mot samma veckodag en vecka tidigare. Pilarna är neutrala: fler röda är inte en förbättring. Båda sidor använder samma nu valda grupper och sökning, medan färgknappen bara filtrerar listan. Testprofiler, avstängda och ej godkända profiler ingår inte. Saknad historik visas grå; utan underlag i båda perioderna visas ingen jämförelsepil.

Kompakt presentation: på dator ligger färg/antal på första raden och förändringen på andra, med en mindre pil. Filterkontroller och stängd läsförklaring delar nedersta raden. På mobil staplas dessa kontroller med minst 40 px tryckhöjd; de tre färgkorten ryms fortfarande bredvid varandra. Beräkningar och funktioner påverkas inte av layouten.

`shared/swimmer-traffic.js` är gemensam källa för kort, färgfilter och räkning. Incheckningar/sömn använder sju inkluderade aktivitetsdagar; planering/genomförande använder respektive kalendervecka fram till jämförelsedagen. Befintliga kortregler bevaras: två sjukdagar, tre ej genomförda planerade datum/pass, eller minst två låga kropps- och känslosvar ger rött. Sömnsignaler använder de gemensamma uppföljningsreglerna. Enstaka signaler ger gult; underlag utan signal ger grönt. Helt saknat underlag är aldrig grönt. Låga kropps-/känslosvar räknas per svar på kortet, inte per dag som i Kontrollpanelens Individuell uppföljning.

Historiska statusar räknas om från nu lagrade data, inte sparade skärmbilder/statusögonblick. Rättelser, ändrad planering, medlemstillkomst eller ändrad svarstäckning kan påverka jämförelsen. Detta är inte ett mått på kausalitet eller diagnos. Nya profiler får inte status före sitt skapandedatum.

Tränarskyddad GET `/api/training?traffic=true` hämtar 14 dagars smalt utvalda fält med paginering. Ingen AI, ingen skrivning, ingen rå kommentar, dagboksreflektion eller intern anteckning returneras. Varje profil får bara aktuell/tidigare klassning och signalorsaker. Om en källa eller sidgränsen misslyckas visas ett fel, inte delresultat. Vyn hämtar vid öppning, nytt datum och Uppdatera trafikljus; vanlig omrendering utlöser inte nya anrop. Ingen ny SQL eller miljövariabel krävs.
