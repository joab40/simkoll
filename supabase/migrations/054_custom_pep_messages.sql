-- Allow swimmers to send a short, moderated custom pep message.
alter table public.kudos add column if not exists content text;
alter table public.group_pep add column if not exists content text;

alter table public.kudos drop constraint if exists kudos_template_key_check;
alter table public.kudos add constraint kudos_template_key_check check (template_key in ('great_job', 'great_energy', 'nice_technique', 'thanks', 'fun_together', 'strong_effort', 'custom'));

alter table public.group_pep drop constraint if exists group_pep_template_key_check;
alter table public.group_pep add constraint group_pep_template_key_check check (template_key in ('group_energy', 'group_fun', 'group_great_job', 'group_thanks', 'group_spirit', 'custom'));

alter table public.kudos add constraint kudos_content_length_check check (content is null or char_length(content) between 1 and 300);
alter table public.group_pep add constraint group_pep_content_length_check check (content is null or char_length(content) between 1 and 300);
