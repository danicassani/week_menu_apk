-- Run as project administrator after migration 27. Enable Supabase Cron first.
-- This is separate from migrations so local PostgreSQL/PGlite tests need no Cron extension.
create extension if not exists pg_cron;
do $$begin
 if exists(select 1 from cron.job where jobname='planning-history-retention') then
  perform cron.unschedule('planning-history-retention');
 end if;
 perform cron.schedule('planning-history-retention','17 3 * * *','select app_private.purge_planning_history()');
end$$;
-- Verify installation: select jobname,schedule,active from cron.job where jobname='planning-history-retention';
-- Verify executions: select * from cron.job_run_details where jobid=(select jobid from cron.job where jobname='planning-history-retention') order by start_time desc limit 10;
