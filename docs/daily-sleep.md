# Sömnkoll

Kör `supabase/migrations/100_daily_sleep.sql` före publicering. Inga nya miljövariabler krävs.

Vid profilkopplad check-in visas en frivillig sömnkoll direkt efter känslan, oavsett aktivitet. Anonym check-in får ingen identifierad sömnpost. Sovtid 0–840 minuter i kvartsteg och kvalitet 1/3/5 (Dålig/Okej/Bra). Ingen kvalitet är förvald. Sovtidens utgångsvärde 7 timmar sparas först efter aktiv bekräftelse.

Sömnkollen sparas separat direkt på Spara och fortsätt. Även avbruten check-in behåller den sparade sömnposten. Hoppa över idag sparar bara en överhoppningsmarkering. Primärnyckeln (profil, aktivitetsdatum) och ignore-duplicates hindrar dubbla svar eller överskrivning från två enheter. Aktivitetsdatum tillåts endast idag eller igår enligt Europe/Stockholm. Befintlig före/efter-check-in och poäng påverkas inte.

GET `/api/responses?sleep=true&start=YYYY-MM-DD&end=YYYY-MM-DD` läser egna poster för simmare. Angivet profileId ignoreras för simmare. Tränare kan läsa aktiva godkända simmares data i klubben, och filtrera med profileId. Direktåtkomst är spärrad med RLS. Läsningen är sidindelad och misslyckas uttryckligt vid kapacitetsgränsen.

Historik visas i träningsdagboken för vald period och i simmarkortet (senaste 28 dagarna). Tabellen jämför datum, sovtid, kvalitet, känsla och RPE. Nätter saknas när inga svar finns; inga nollor eller uppskattningar skapas. Staplarna avser registrerade nätter, inte obruten tid. Två distinkta dagar med kvalitet Dålig senaste sju dagarna ger en dialogsignal i kontrollpanelen. Ingen timgräns, diagnos eller automatisk träningsändring används.
