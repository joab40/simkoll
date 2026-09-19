-- Ta bort äldre Swimgames-resultat som motsvarar en omöjlig tid under 8,5 sekunder.
-- Nya resultat valideras även i api/points.js.
delete from public.game_scores
where game_key = 'swimgames'
  and score > 91500;
