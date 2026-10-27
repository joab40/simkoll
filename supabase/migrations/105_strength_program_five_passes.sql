-- Allow strength programs to contain up to five independently logged passes.
alter table public.strength_program_logs
  drop constraint if exists strength_program_logs_pass_number_check;

alter table public.strength_program_logs
  add constraint strength_program_logs_pass_number_check
  check (pass_number between 1 and 5);

notify pgrst, 'reload schema';
