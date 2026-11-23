/* Adapter for the node-pg-migrate CLI. The canonical migration remains SQL so
 * psql, the local runner and the migration CLI execute identical statements. */
const fs = require('node:fs');
const path = require('node:path');

exports.up = (pgm) => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '001_initial.sql'), 'utf8');
  pgm.sql(sql);
};

exports.down = () => {
  throw new Error('ChatISEN v1 migration is intentionally irreversible; restore a database backup for rollback');
};
