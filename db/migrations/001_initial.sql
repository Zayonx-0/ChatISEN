-- ChatISEN schema v1.  This migration is safe to run twice: the runner
-- records it in _chatisen_migrations and every object is guarded as well.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE conversation_type AS ENUM ('direct', 'group');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE member_role AS ENUM ('owner', 'member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE message_kind AS ENUM ('text', 'file');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE call_mode AS ENUM ('audio', 'video');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE call_state AS ENUM ('ringing', 'active', 'ended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE participant_state AS ENUM ('invited', 'joined', 'declined', 'left', 'removed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE media_job_kind AS ENUM ('remove_participant', 'close_room', 'reconcile');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE media_job_state AS ENUM ('pending', 'running', 'done', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handle varchar(32) NOT NULL UNIQUE,
  display_name varchar(80) NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_handle_format CHECK (handle = lower(handle) AND handle ~ '^[a-z0-9_]{3,32}$')
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at <= absolute_expires_at),
  CHECK (octet_length(token_hash) = 32)
);
CREATE INDEX IF NOT EXISTS sessions_token_expiry_idx ON sessions (token_hash, expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id, expires_at);

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type conversation_type NOT NULL,
  title varchar(120),
  direct_user_low uuid REFERENCES users(id) ON DELETE RESTRICT,
  direct_user_high uuid REFERENCES users(id) ON DELETE RESTRICT,
  last_seq bigint NOT NULL DEFAULT 0 CHECK (last_seq >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  CONSTRAINT conversations_direct_pair_order CHECK (direct_user_low IS NULL OR direct_user_high IS NULL OR direct_user_low < direct_user_high),
  CONSTRAINT conversations_type_shape CHECK (
    (type = 'direct' AND direct_user_low IS NOT NULL AND direct_user_high IS NOT NULL AND title IS NULL)
    OR (type = 'group' AND direct_user_low IS NULL AND direct_user_high IS NULL AND title IS NOT NULL AND char_length(title) BETWEEN 1 AND 120)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS conversations_direct_pair_idx ON conversations (direct_user_low, direct_user_high) WHERE type = 'direct' AND closed_at IS NULL;

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role member_role NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS conversation_members_user_active_idx ON conversation_members (user_id, conversation_id) WHERE left_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS conversation_members_one_owner_idx ON conversation_members (conversation_id) WHERE role = 'owner' AND left_at IS NULL;

CREATE TABLE IF NOT EXISTS conversation_events (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  seq bigint NOT NULL CHECK (seq > 0),
  event_type varchar(64) NOT NULL CHECK (event_type ~ '^[a-z][a-z0-9_.-]{2,63}$'),
  entity_id uuid,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, seq),
  CONSTRAINT conversation_events_payload_bound CHECK (octet_length(payload::text) <= 65536)
);
CREATE INDEX IF NOT EXISTS conversation_events_time_idx ON conversation_events (conversation_id, occurred_at);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  seq bigint NOT NULL,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL,
  kind message_kind NOT NULL DEFAULT 'text',
  text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messages_event_fk FOREIGN KEY (conversation_id, seq) REFERENCES conversation_events(conversation_id, seq) ON DELETE CASCADE,
  CONSTRAINT messages_text_bound CHECK (text IS NULL OR char_length(text) BETWEEN 1 AND 4000),
  CONSTRAINT messages_kind_shape CHECK ((kind = 'text' AND text IS NOT NULL AND char_length(btrim(text)) > 0) OR (kind = 'file' AND text IS NULL)),
  UNIQUE (conversation_id, seq),
  UNIQUE (conversation_id, sender_id, client_id)
);
CREATE INDEX IF NOT EXISTS messages_conversation_order_idx ON messages (conversation_id, seq);

CREATE TABLE IF NOT EXISTS attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL UNIQUE REFERENCES messages(id) ON DELETE CASCADE,
  file_name varchar(255) NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 255),
  media_type varchar(64) NOT NULL CHECK (media_type IN ('image/png', 'image/jpeg', 'application/pdf', 'text/plain')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 5242880),
  sha256 bytea NOT NULL CHECK (octet_length(sha256) = 32),
  data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  initiator_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL,
  mode call_mode NOT NULL,
  state call_state NOT NULL DEFAULT 'ringing',
  room_name varchar(80) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  active_at timestamptz,
  ended_at timestamptz,
  end_reason varchar(80),
  UNIQUE (conversation_id, initiator_id, client_id),
  CHECK ((state = 'ended' AND ended_at IS NOT NULL) OR (state <> 'ended' AND ended_at IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS calls_one_open_per_conversation_idx ON calls (conversation_id) WHERE state <> 'ended';
CREATE INDEX IF NOT EXISTS calls_conversation_idx ON calls (conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS call_participants (
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  session_id uuid REFERENCES sessions(id) ON DELETE SET NULL,
  state participant_state NOT NULL DEFAULT 'invited',
  livekit_identity varchar(128),
  admission_expires_at timestamptz,
  joined_at timestamptz,
  left_at timestamptz,
  PRIMARY KEY (call_id, user_id),
  UNIQUE (call_id, livekit_identity)
);
CREATE INDEX IF NOT EXISTS call_participants_session_idx ON call_participants (session_id) WHERE session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS media_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind media_job_kind NOT NULL,
  call_id uuid REFERENCES calls(id) ON DELETE CASCADE,
  participant_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  state media_job_state NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  run_after timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (kind, call_id, participant_user_id, state)
);
CREATE INDEX IF NOT EXISTS media_jobs_ready_idx ON media_jobs (run_after, id) WHERE state IN ('pending', 'failed');

CREATE TABLE IF NOT EXISTS webhook_receipts (
  provider varchar(32) NOT NULL,
  provider_event_id varchar(255) NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  payload_hash bytea NOT NULL CHECK (octet_length(payload_hash) = 32),
  PRIMARY KEY (provider, provider_event_id)
);

CREATE TABLE IF NOT EXISTS quality_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  participant_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  study_session varchar(64) NOT NULL CHECK (study_session ~ '^[a-zA-Z0-9_-]{8,64}$'),
  window_start timestamptz NOT NULL,
  schema_version smallint NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  packets_received integer NOT NULL CHECK (packets_received >= 0),
  packets_lost integer NOT NULL CHECK (packets_lost >= 0),
  jitter_ms numeric(12,3) NOT NULL CHECK (jitter_ms >= 0),
  rtt_ms numeric(12,3) NOT NULL CHECK (rtt_ms >= 0),
  bitrate_kbps numeric(14,3) NOT NULL CHECK (bitrate_kbps >= 0),
  track_present boolean NOT NULL,
  scenario varchar(32),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quality_samples_time_idx ON quality_samples (study_session, window_start);

CREATE OR REPLACE FUNCTION chatisen_notify_conversation_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('chatisen_conversation_events', json_build_object('conversationId', NEW.conversation_id::text, 'seq', NEW.seq::text)::text);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS conversation_events_notify ON conversation_events;
CREATE TRIGGER conversation_events_notify AFTER INSERT ON conversation_events FOR EACH ROW EXECUTE FUNCTION chatisen_notify_conversation_event();

CREATE TABLE IF NOT EXISTS _chatisen_migrations (
  id varchar(255) PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

