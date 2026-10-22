# Rättelse av återkommande felaktig eftermiddagsnärvaro

Träningsloggens GET skapade tidigare eftermiddagspass från samtliga gamla efter-svar. Den använde svarstid i stället för aktivitetsdatum och tog inte hänsyn till aktivitet, passval eller avmarkerad närvaroregistrering. Den skrev också tillbaka dessa gissningar till personal_training_sessions för inloggade simmare. En ny check-in hämtar träningsloggen igen, vilket återskapade borttagna felaktiga pass.

GET visar nu endast sparade registreringar. Check-in skapar fortfarande en registrering när svaret skickas med uttryckligt passval och registrering aktiverad. Manuell markering och tränarens närvaroregistrering fortsätter använda de vanliga skrivflödena. Historiska profilsvar finns kvar; träningsdagbokens separata historiktolkning ändras inte.

Ingen SQL behövs. Redan sparad felaktig närvaro kan avmarkeras och återskapas inte längre av läsningen. Ingen automatisk radering av äldre pass sker, eftersom en äldre eftermiddagsmarkering också kan vara riktig. Regressionstestet kör gårdagens morgonincheckning, en gammal felaktig PM-registrering, avmarkering, dagens morgonincheckning och upprepade läsningar som simmare och tränare.
