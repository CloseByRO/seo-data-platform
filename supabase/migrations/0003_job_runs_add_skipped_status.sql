-- Allow ingestion jobs to be "skipped" when optional integration config is missing.

alter table job_runs drop constraint if exists job_runs_status_check;

alter table job_runs
  add constraint job_runs_status_check
  check (status in ('running', 'success', 'failed', 'skipped'));

