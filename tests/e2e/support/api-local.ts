/**
 * API de la cible avec un Object Storage local : même parcours que Cloud Storage
 * (URL d'envoi, PUT direct depuis le navigateur, contrôle, URL de téléchargement).
 */
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {buildApp} from '../../../apps/api/src/app.js';

const bucket=new Map<string,{bytes:Buffer;mediaType:string;fileName?:string}>();
const storage=createServer((request,response)=>{
  const url=new URL(request.url!,'http://storage'),key=url.pathname.slice(1);
  response.setHeader('Access-Control-Allow-Origin',process.env.CORS_ORIGIN!);
  response.setHeader('Access-Control-Allow-Methods','GET,PUT');
  response.setHeader('Access-Control-Allow-Headers','content-type,x-goog-content-length-range,x-goog-if-generation-match');
  if(request.method==='OPTIONS'){response.writeHead(204).end();return;}
  if(request.method==='PUT'){
    if(request.headers['x-goog-if-generation-match']!=='0'){response.writeHead(400).end();return;}
    const chunks:Buffer[]=[];request.on('data',chunk=>chunks.push(chunk));
    request.on('end',()=>{
      if(bucket.has(key)){response.writeHead(412).end();return;}
      bucket.set(key,{bytes:Buffer.concat(chunks),mediaType:String(request.headers['content-type'])});response.writeHead(200).end();
    });
    return;
  }
  const object=bucket.get(key);
  if(!object){response.writeHead(404).end();return;}
  response.writeHead(200,{'Content-Type':object.mediaType,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(url.searchParams.get('name')!)}`}).end(object.bytes);
});
await new Promise<void>(ready=>storage.listen(0,'127.0.0.1',ready));
const base=`http://127.0.0.1:${(storage.address() as {port:number}).port}`;

const {app}=await buildApp({databaseUrl:process.env.DATABASE_URL!,objects:{
  signUpload:async(key,mediaType,size)=>({url:`${base}/${key}`,headers:{'content-type':mediaType,'x-goog-content-length-range':`${size},${size}`,'x-goog-if-generation-match':'0'}}),
  signDownload:async(key,fileName)=>`${base}/${key}?name=${encodeURIComponent(fileName)}`,
  inspect:async key=>{const o=bucket.get(key);return o&&{size:o.bytes.length,mediaType:o.mediaType,sha256:createHash('sha256').update(o.bytes).digest('hex'),head:o.bytes.subarray(0,4096)};},
  remove:async key=>{bucket.delete(key);},
}});
await app.listen({host:'127.0.0.1',port:Number(process.env.PORT)});
const stop=()=>{storage.close();app.close().then(()=>process.exit(0),()=>process.exit(1));};
process.once('SIGTERM',stop);process.once('SIGINT',stop);
