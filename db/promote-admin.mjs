#!/usr/bin/env node
/**
 * Nomme le premier administrateur : aucune route ne permet de se donner ce rôle.
 *   DATABASE_URL=postgres://... node db/promote-admin.mjs <identifiant>
 */
import pg from 'pg';

const handle=process.argv[2];
if(!handle||!process.env.DATABASE_URL){console.error('usage: DATABASE_URL=... node db/promote-admin.mjs <identifiant>');process.exit(2);}
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
await client.connect();
try{
  await client.query('BEGIN');
  const user=(await client.query("update identity.users set global_role='admin' where handle=$1 and disabled_at is null returning id",[handle.toLowerCase()])).rows[0];
  if(!user)throw new Error(`compte introuvable ou désactivé : ${handle}`);
  await client.query("insert into identity.audit_log(actor_id,action,target_type,target_id,detail) values($1,'user.promoted_by_operator','user',$1,'{\"globalRole\":\"admin\"}')",[user.id]);
  await client.query('COMMIT');
  console.log(`${handle} est administrateur.`);
}catch(error){await client.query('ROLLBACK');console.error(error.message);process.exitCode=1;}
finally{await client.end();}
