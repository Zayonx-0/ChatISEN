ALTER TABLE calls.calls ADD COLUMN first_media_route text CHECK (first_media_route IN ('direct', 'relay'));
