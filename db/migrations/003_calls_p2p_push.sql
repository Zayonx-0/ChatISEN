-- Appels à deux en pair-à-pair, topic personnel et notifications Web Push.
ALTER TABLE calls ADD COLUMN IF NOT EXISTS topology varchar(3) NOT NULL DEFAULT 'p2p';
ALTER TABLE calls DROP CONSTRAINT IF EXISTS calls_topology_check;
ALTER TABLE calls ADD CONSTRAINT calls_topology_check CHECK (topology IN ('p2p', 'sfu'));

-- Événements du topic user:{userId}. PostgreSQL les conserve brièvement : une offre vidéo
-- dépasse la taille d'une notification NOTIFY, qui ne transporte donc que l'identifiant.
CREATE TABLE IF NOT EXISTS user_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id uuid,
  frame jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_events_created_idx ON user_events (created_at);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions (user_id);

-- File d'envoi écrite dans la transaction de l'événement (message ou appel).
CREATE TABLE IF NOT EXISTS push_outbox (
  event_id uuid PRIMARY KEY,
  kind varchar(16) NOT NULL CHECK (kind IN ('message', 'call')),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expanded_at timestamptz
);
CREATE INDEX IF NOT EXISTS push_outbox_pending_idx ON push_outbox (created_at) WHERE expanded_at IS NULL;

CREATE TABLE IF NOT EXISTS push_deliveries (
  event_id uuid NOT NULL REFERENCES push_outbox(event_id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  state varchar(16) NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'sent', 'failed', 'expired')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  PRIMARY KEY (event_id, subscription_id)
);
CREATE INDEX IF NOT EXISTS push_deliveries_pending_idx ON push_deliveries (available_at) WHERE state = 'pending';
