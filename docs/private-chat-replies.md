# Privata svar i Info från tränarna

Kör migration 101_private_chat_replies.sql före publicering.

Tränaren klickar på en simmares ursprungliga meddelande. Ett privat svarsfält öppnas direkt under meddelandet i samma chattfönster. Svaret läggs där som en inbakad del märkt Privat svar. Simmaren får svaret i samma vy och kan även läsa det i sina privata meddelanden. Övriga simmare får inte svarstexten i API-svaret. Tränarkonton kan läsa svaren enligt befintliga privata meddelandebehörigheter.

Svaret sparas i private_messages med reply_to_open_chat_id, aldrig som en grupppost. Servern kontrollerar att ursprungsmeddelandet är från den valda, aktiva och godkända simmaren och inte är borttaget. Befintlig privat push används. Läsning av trådsvar filtrerar både mottagare och synliga ursprungsmeddelanden, sidindelas och dubbelkontrollerar ägarskap vid mappning. Om läsningen misslyckas visas en varning.

Grupputkastet påverkas inte. Vid sändningsfel behålls text och mottagare, och användaren kan försöka igen. Svarsfältets knapp visar sändning och bekräftelse, blockerar upprepade klick medan sändningen pågår och kan stängas med Escape. Borttagning av ett ursprungsmeddelande döljer tråden i chatten men sparade privata meddelanden finns kvar tills de tas bort via den befintliga funktionen.
