-- Persist idempotency keys for group creation independently of message retries.
CREATE TABLE group_creation_commands (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  command_hash bytea NOT NULL CHECK (octet_length(command_hash) = 32),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, client_id)
);
