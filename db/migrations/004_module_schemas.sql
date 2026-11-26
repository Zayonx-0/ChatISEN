-- Un schéma SQL par module du monolithe, plus « realtime » pour le noyau (journal et outbox).
-- Migration non rétrocompatible : l'ancienne API ne retrouve plus ses tables après son passage.
-- Elle précède la mise en service de la cible ; les suivantes devront rester compatibles.

-- Les tables retirées plus bas n'ont jamais été écrites par la version PostgreSQL : on le vérifie.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.attachments) OR EXISTS (SELECT 1 FROM public.quality_samples) THEN
    RAISE EXCEPTION 'attachments ou quality_samples contient des données : migration à revoir';
  END IF;
END $$;

CREATE SCHEMA identity;
CREATE SCHEMA groups;
CREATE SCHEMA messaging;
CREATE SCHEMA files;
CREATE SCHEMA calls;
CREATE SCHEMA quality;
CREATE SCHEMA notifications;
CREATE SCHEMA realtime;

-- identity ------------------------------------------------------------------
ALTER TABLE public.users SET SCHEMA identity;
ALTER TABLE public.sessions SET SCHEMA identity;
ALTER TABLE identity.users
  ADD COLUMN global_role varchar(8) NOT NULL DEFAULT 'user' CHECK (global_role IN ('user', 'admin')),
  ADD COLUMN disabled_at timestamptz;
CREATE TABLE identity.audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid NOT NULL,
  action varchar(64) NOT NULL CHECK (action ~ '^[a-z][a-z0-9_.-]{2,63}$'),
  target_type varchar(32) NOT NULL,
  target_id uuid NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now()
);

-- groups --------------------------------------------------------------------
ALTER TYPE public.conversation_type SET SCHEMA groups;
ALTER TYPE public.member_role SET SCHEMA groups;
-- La valeur n'est pas utilisée dans cette transaction, ce que PostgreSQL exige.
ALTER TYPE groups.member_role ADD VALUE IF NOT EXISTS 'moderator' BEFORE 'member';
ALTER TABLE public.conversations SET SCHEMA groups;
ALTER TABLE public.conversation_members SET SCHEMA groups;
ALTER TABLE groups.conversation_members RENAME TO members;
ALTER TABLE public.group_creation_commands SET SCHEMA groups;
ALTER TABLE groups.group_creation_commands RENAME TO creation_commands;

-- realtime : le numéro de séquence et le journal appartiennent au noyau -------
CREATE TABLE realtime.streams (
  id uuid PRIMARY KEY,
  last_seq bigint NOT NULL DEFAULT 0 CHECK (last_seq >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO realtime.streams (id, last_seq, updated_at) SELECT id, last_seq, updated_at FROM groups.conversations;
ALTER TABLE groups.conversations DROP COLUMN last_seq, DROP COLUMN updated_at;

DROP TRIGGER IF EXISTS conversation_events_notify ON public.conversation_events;
DROP FUNCTION IF EXISTS public.chatisen_notify_conversation_event();
ALTER TABLE public.conversation_events SET SCHEMA realtime;
ALTER TABLE realtime.conversation_events RENAME TO events;
ALTER TABLE realtime.events RENAME COLUMN conversation_id TO stream_id;
-- Le contrat nomme « id » l'identifiant du message dans l'événement.
UPDATE realtime.events SET payload = (payload - 'messageId') || jsonb_build_object('id', payload -> 'messageId') WHERE payload ? 'messageId';

CREATE FUNCTION realtime.notify_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('chatisen_conversation_events', json_build_object('conversationId', NEW.stream_id::text, 'seq', NEW.seq::text)::text);
  RETURN NEW;
END;
$$;
CREATE TRIGGER events_notify AFTER INSERT ON realtime.events FOR EACH ROW EXECUTE FUNCTION realtime.notify_event();

ALTER TABLE public.user_events SET SCHEMA realtime;

-- Événements destinés aux modules situés plus haut dans le graphe de dépendances.
CREATE TABLE realtime.outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type varchar(64) NOT NULL CHECK (event_type ~ '^[a-z][a-z0-9_.-]{2,63}$'),
  conversation_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  entity_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX outbox_pending_idx ON realtime.outbox (event_type, created_at) WHERE processed_at IS NULL;

-- messaging -----------------------------------------------------------------
ALTER TYPE public.message_kind SET SCHEMA messaging;
ALTER TABLE public.messages SET SCHEMA messaging;
ALTER TABLE messaging.messages ADD COLUMN file_id uuid;
ALTER TABLE messaging.messages DROP CONSTRAINT messages_kind_shape;
ALTER TABLE messaging.messages ADD CONSTRAINT messages_kind_shape CHECK (
  (kind = 'text' AND file_id IS NULL AND text IS NOT NULL AND char_length(btrim(text)) > 0)
  OR (kind = 'file' AND file_id IS NOT NULL AND (text IS NULL OR char_length(btrim(text)) > 0)));
CREATE UNIQUE INDEX messages_file_idx ON messaging.messages (file_id) WHERE file_id IS NOT NULL;

-- files : les octets vont dans Cloud Storage, la base ne garde que la fiche ----
DROP TABLE public.attachments;
CREATE TABLE files.files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  file_name varchar(255) NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 255),
  media_type varchar(64) NOT NULL CHECK (media_type IN ('image/png', 'image/jpeg', 'application/pdf', 'text/plain')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 26214400),
  sha256 bytea NOT NULL CHECK (octet_length(sha256) = 32),
  object_key varchar(200) NOT NULL UNIQUE,
  state varchar(10) NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'available', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX files_pending_idx ON files.files (created_at) WHERE state = 'pending';

-- calls ---------------------------------------------------------------------
ALTER TYPE public.call_mode SET SCHEMA calls;
ALTER TYPE public.call_state SET SCHEMA calls;
ALTER TYPE public.participant_state SET SCHEMA calls;
ALTER TYPE public.media_job_kind SET SCHEMA calls;
ALTER TYPE public.media_job_state SET SCHEMA calls;
ALTER TABLE public.calls SET SCHEMA calls;
ALTER TABLE public.call_participants SET SCHEMA calls;
ALTER TABLE calls.call_participants RENAME TO participants;
ALTER TABLE public.media_jobs SET SCHEMA calls;
ALTER TABLE public.webhook_receipts SET SCHEMA calls;
-- Deux évictions du même participant peuvent attendre : une immédiate, une après l'expiration du jeton.
ALTER TABLE calls.media_jobs DROP CONSTRAINT media_jobs_kind_call_id_participant_user_id_state_key;

-- quality -------------------------------------------------------------------
DROP TABLE public.quality_samples;
CREATE TABLE quality.samples (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  call_id uuid NOT NULL,
  participant_user_id uuid NOT NULL,
  captured_at timestamptz NOT NULL,
  packets_received bigint NOT NULL CHECK (packets_received >= 0),
  packets_lost bigint NOT NULL CHECK (packets_lost >= 0),
  jitter_ms numeric(12,3) NOT NULL CHECK (jitter_ms >= 0),
  rtt_ms numeric(12,3) NOT NULL CHECK (rtt_ms >= 0),
  bitrate_kbps numeric(14,3) NOT NULL CHECK (bitrate_kbps >= 0),
  candidate_type varchar(5) NOT NULL CHECK (candidate_type IN ('host', 'srflx', 'prflx', 'relay')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (call_id, participant_user_id, captured_at)
);

-- notifications ---------------------------------------------------------------
-- Les envois en attente durent 120 secondes au plus : ils ne sont pas repris.
DROP TABLE public.push_deliveries;
DROP TABLE public.push_outbox;
ALTER TABLE public.push_subscriptions SET SCHEMA notifications;
CREATE TABLE notifications.push_deliveries (
  event_id uuid NOT NULL,
  subscription_id uuid NOT NULL REFERENCES notifications.push_subscriptions(id) ON DELETE CASCADE,
  kind varchar(16) NOT NULL CHECK (kind IN ('message', 'call')),
  conversation_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  entity_id uuid NOT NULL,
  call_mode varchar(5),
  event_at timestamptz NOT NULL,
  state varchar(16) NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'sent', 'failed', 'expired')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  PRIMARY KEY (event_id, subscription_id)
);
CREATE INDEX push_deliveries_pending_idx ON notifications.push_deliveries (available_at) WHERE state = 'pending';

-- Aucune clé étrangère entre schémas : les références restent des UUID, et le module
-- propriétaire garantit leur cohérence par ses ports et ses événements.
DO $$
DECLARE link record;
BEGIN
  FOR link IN
    SELECT c.conrelid::regclass AS source, c.conname
    FROM pg_constraint c
    JOIN pg_class s ON s.oid = c.conrelid
    JOIN pg_class t ON t.oid = c.confrelid
    JOIN pg_namespace n ON n.oid = s.relnamespace
    WHERE c.contype = 'f' AND s.relnamespace <> t.relnamespace
      AND n.nspname IN ('identity', 'groups', 'messaging', 'files', 'calls', 'quality', 'notifications', 'realtime')
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', link.source, link.conname);
  END LOOP;
END $$;

ALTER TABLE realtime.events ADD CONSTRAINT events_stream_fk FOREIGN KEY (stream_id) REFERENCES realtime.streams(id) ON DELETE CASCADE;
