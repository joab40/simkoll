-- Artefakter representerar en konkret positiv handling och ger därför 5 poäng.
update public.point_events
set points = 5
where event_type = 'artifact';
