import {writeSync} from 'node:fs';
import {createServer} from 'node:http';
import {buildApp} from './app.js';
import {collectMetrics,registry} from './platform/metrics.js';
import {serializeError} from './platform/logging.js';

function required(name:string){
  const value=process.env[name];
  if(!value)throw new Error(`${name} est obligatoire`);
  return value;
}

export async function start(){
  const databaseUrl=required('DATABASE_URL');
  if(process.env.NODE_ENV==='production'){required('CSRF_SECRET');required('CORS_ORIGIN');}
  const port=Number(process.env.PORT||3000),host=process.env.HOST||'0.0.0.0';
  // Avec METRICS_PORT, les métriques quittent le port applicatif : seul Prometheus joint ce second port.
  const metricsPort=Number(process.env.METRICS_PORT||0);
  const {app,db}=await buildApp({databaseUrl,logger:true,metricsRoute:!metricsPort});
  if(metricsPort){
    const server=createServer((request,response)=>{
      if(request.url!=='/metrics'){response.writeHead(404).end();return;}
      collectMetrics(db.pool).then(body=>{response.writeHead(200,{'Content-Type':registry.contentType});response.end(body);}).catch(()=>response.writeHead(500).end());
    });
    await new Promise<void>((ok,fail)=>{server.once('error',fail);server.listen(metricsPort,host,ok);});
    app.addHook('onClose',async()=>{server.close();});
  }
  await app.listen({port,host});
  app.log.info({port,host},'ChatISEN API ready');
  const stop=()=>{app.close().then(()=>process.exit(0),()=>process.exit(1));};
  process.once('SIGTERM',stop);process.once('SIGINT',stop);
  return app;
}
if(import.meta.url===`file://${process.argv[1]}`)start().catch(error=>{
  writeSync(process.stderr.fd,JSON.stringify({level:50,msg:'Démarrage de l’API impossible',err:serializeError(error)})+'\n');
  process.exit(1);
});
