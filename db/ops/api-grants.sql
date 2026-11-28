DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO chatisen_api', current_database());
END $$;
GRANT USAGE ON SCHEMA identity, groups, messaging, files, calls, quality, notifications, realtime TO chatisen_api;
GRANT SELECT, INSERT, UPDATE ON identity.users, identity.sessions, groups.conversations, groups.members,
  calls.calls, calls.participants, calls.media_jobs, realtime.streams TO chatisen_api;
GRANT SELECT ON calls.webhook_receipts TO chatisen_api;
GRANT SELECT, INSERT ON identity.audit_log, groups.creation_commands, messaging.messages,
  quality.samples, realtime.events TO chatisen_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON files.files, notifications.push_subscriptions,
  notifications.push_deliveries, realtime.outbox TO chatisen_api;
GRANT SELECT, INSERT, DELETE ON realtime.user_events TO chatisen_api;
GRANT USAGE ON SEQUENCE identity.audit_log_id_seq, quality.samples_id_seq, realtime.user_events_id_seq TO chatisen_api;
DO $$ BEGIN
  IF to_regclass('operations.restart_gate') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA operations TO chatisen_api;
    GRANT SELECT, UPDATE ON operations.restart_gate TO chatisen_api;
  END IF;
END $$;
