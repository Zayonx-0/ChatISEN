SET LOCAL lock_timeout = '3s';
ALTER TABLE files.files ADD COLUMN attached_at timestamptz;
