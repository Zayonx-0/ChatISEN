import {createHash,createHmac,pbkdf2Sync,randomBytes} from 'node:crypto';
import pg from 'pg';

async function readSecret(){
  const metadata='http://metadata.google.internal/computeMetadata/v1/';
  const read=async(url,headers)=>{
    const response=await fetch(url,{headers,signal:AbortSignal.timeout(10_000)});
    if(!response.ok)throw Object.assign(new Error('Lecture du secret impossible'),{code:'HTTP_'+response.status});
    return response;
  };
  const headers={'Metadata-Flavor':'Google'};
  const [project,identity]=await Promise.all([
    read(metadata+'project/project-id',headers).then(response=>response.text()),
    read(metadata+'instance/service-accounts/default/token',headers).then(response=>response.json()),
  ]);
  const endpoint='https://secretmanager.googleapis.com/v1/projects/'+encodeURIComponent(project.trim())+'/secrets/db-api-password/versions/latest:access';
  const secret=await (await read(endpoint,{Authorization:'Bearer '+identity.access_token})).json();
  return Buffer.from(secret.payload.data,'base64').toString('utf8');
}

// Le SQL envoyé au serveur contient un vérificateur SCRAM, sans le mot de passe.
function verifier(password){
  const salt=randomBytes(16),rounds=4096;
  const key=pbkdf2Sync(password,salt,rounds,32,'sha256');
  const hmac=label=>createHmac('sha256',key).update(label).digest();
  const stored=createHash('sha256').update(hmac('Client Key')).digest('base64');
  return `SCRAM-SHA-256$${rounds}:${salt.toString('base64')}$${stored}:${hmac('Server Key').toString('base64')}`;
}

let client,transaction=false,phase='configuration';
try{
  const {DATABASE_URL,API_ROLE_GRANTS_SQL,API_ROLE_PASSWORD}=process.env;
  if(!DATABASE_URL||!API_ROLE_GRANTS_SQL)throw new Error();
  phase='lecture de db-api-password';
  const password=API_ROLE_PASSWORD??await readSecret();
  if(!/^[\x21-\x7e]+$/.test(password))throw new Error();
  phase='connexion PostgreSQL';
  client=new pg.Client({connectionString:DATABASE_URL,connectionTimeoutMillis:10_000});
  client.on('error',()=>{});
  await client.connect();
  phase='préparation du rôle chatisen_api';
  await client.query('BEGIN');
  transaction=true;
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('chatisen:prepare-api-role'))");
  const {rows:[role]}=await client.query(`SELECT rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls,
    EXISTS (SELECT 1 FROM pg_auth_members WHERE member=r.oid) AS memberships
    FROM pg_roles r WHERE rolname='chatisen_api'`);
  if(role&&Object.values(role).some(Boolean))throw Object.assign(new Error(),{code:'ROLE_PRIVILEGIE'});
  const {rows:[owner]}=await client.query('SELECT rolcreaterole FROM pg_roles WHERE rolname=current_user');
  const manageRole=async sql=>{
    if(!owner.rolcreaterole)await client.query('SET LOCAL ROLE cloudsqlsuperuser');
    await client.query(sql);
    if(!owner.rolcreaterole)await client.query('RESET ROLE');
  };
  if(!role)await manageRole('CREATE ROLE chatisen_api NOLOGIN NOINHERIT');
  phase='application des droits de chatisen_api';
  await client.query(API_ROLE_GRANTS_SQL);
  const {rows:[access]}=await client.query("SELECT has_database_privilege('chatisen_api',current_database(),'CONNECT') AS allowed");
  if(!access.allowed)throw Object.assign(new Error(),{code:'42501'});
  phase='activation de chatisen_api';
  await manageRole(`ALTER ROLE chatisen_api LOGIN NOINHERIT PASSWORD '${verifier(password)}'`);
  await client.query('COMMIT');
  console.log('Rôle chatisen_api préparé.');
}catch(error){
  if(transaction)await client.query('ROLLBACK').catch(()=>{});
  const code=typeof error?.code==='string'&&/^(?:[0-9A-Z]{5}|HTTP_[0-9]{3}|ROLE_PRIVILEGIE)$/.test(error.code)?` (${error.code})`:'';
  console.error(`Échec de la préparation SQL — ${phase}${code}.`);
  process.exitCode=1;
}finally{
  await client?.end().catch(()=>{});
}
