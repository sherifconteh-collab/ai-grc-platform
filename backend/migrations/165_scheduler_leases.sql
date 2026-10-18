-- Migration 165: Scheduler leases
--
-- Why: the reminder, retention and backup schedulers start on every backend
-- instance. Behind a load balancer each instance ran each sweep, so
-- reminders were created more than once, retention purges ran concurrently,
-- and every instance wrote its own nightly pg_dump. services/jobLease.js now
-- claims a row here (using the database clock) before each run, so one
-- instance runs each job per interval. A disaster-recovery site connected to
-- a read-only replica cannot claim and stays idle until it is promoted.
--
-- Ships in: the next weekly release after PR #381.

CREATE TABLE IF NOT EXISTS scheduler_leases (
  job_name        TEXT PRIMARY KEY,
  last_started_at TIMESTAMPTZ NOT NULL,
  holder          TEXT
);
