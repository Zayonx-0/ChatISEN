CREATE SCHEMA operations;
CREATE TABLE operations.restart_gate (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  retry_at timestamptz,
  operation_id uuid,
  actor_id uuid,
  target text CHECK (target IN ('app-a','app-b','sfu-1','sfu-2','coturn','supervision')),
  vm_name text,
  boot_before double precision,
  started_at timestamptz,
  uncertainty_audited boolean NOT NULL DEFAULT false,
  CHECK (num_nonnulls(operation_id,actor_id,target,vm_name,boot_before,started_at) IN (0,6))
);
INSERT INTO operations.restart_gate DEFAULT VALUES;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='chatisen_api') THEN
    GRANT USAGE ON SCHEMA operations TO chatisen_api;
    GRANT SELECT, UPDATE ON operations.restart_gate TO chatisen_api;
  END IF;
END $$;
