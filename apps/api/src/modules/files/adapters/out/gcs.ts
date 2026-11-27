/**
 * Cloud Storage sans SDK : URL signées V4. La clé privée ne quitte pas Google, la signature
 * est demandée à IAM (signBlob) avec le compte de service de la VM.
 */
import {createHash} from 'node:crypto';
import type {MediaType} from '../../domain.js';
import type {ObjectStore} from '../../ports.js';

const host='storage.googleapis.com';
const metadata='http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/';
const encode=(value:string)=>encodeURIComponent(value).replace(/[!'()*]/g,c=>`%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export type Signer={email():Promise<string>;sign(value:string):Promise<Buffer>};

export function signedUrl(input:{method:'GET'|'PUT';bucket:string;key:string;email:string;headers:Record<string,string>;query?:Record<string,string>;seconds:number;now:Date}){
  const timestamp=input.now.toISOString().replace(/[-:]|\.\d{3}/g,'');
  const scope=`${timestamp.slice(0,8)}/auto/storage/goog4_request`;
  const headers=Object.entries({...input.headers,host}).map(([name,value])=>[name.toLowerCase(),value.trim()]).sort(([a],[b])=>a<b?-1:1);
  const signedHeaders=headers.map(([name])=>name).join(';');
  const query=Object.entries({...input.query,'X-Goog-Algorithm':'GOOG4-RSA-SHA256','X-Goog-Credential':`${input.email}/${scope}`,'X-Goog-Date':timestamp,'X-Goog-Expires':String(input.seconds),'X-Goog-SignedHeaders':signedHeaders})
    .map(([name,value])=>`${encode(name)}=${encode(value)}`).sort().join('&');
  const path=`/${input.bucket}/${input.key.split('/').map(encode).join('/')}`;
  const canonical=[input.method,path,query,headers.map(([name,value])=>`${name}:${value}\n`).join(''),signedHeaders,'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign=['GOOG4-RSA-SHA256',timestamp,scope,createHash('sha256').update(canonical).digest('hex')].join('\n');
  return {stringToSign,url:(signature:Buffer)=>`https://${host}${path}?${query}&X-Goog-Signature=${signature.toString('hex')}`};
}

/** Identité de la VM, lue sur le serveur de métadonnées. */
export function metadataSigner(){
  let token:{value:string;until:number}|undefined,address:string|undefined;
  const read=async(path:string)=>{
    const response=await fetch(metadata+path,{headers:{'Metadata-Flavor':'Google'},signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw new Error(`metadata ${path}: ${response.status}`);
    return response;
  };
  const accessToken=async()=>{
    if(!token||token.until<Date.now()){
      const body=await (await read('token')).json() as {access_token:string;expires_in:number};
      token={value:body.access_token,until:Date.now()+(body.expires_in-60)*1000};
    }
    return token.value;
  };
  const email=async()=>address??=(await (await read('email')).text()).trim();
  const sign=async(value:string)=>{
    const response=await fetch(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${await email()}:signBlob`,{method:'POST',signal:AbortSignal.timeout(10_000),
      headers:{authorization:`Bearer ${await accessToken()}`,'content-type':'application/json'},body:JSON.stringify({payload:Buffer.from(value).toString('base64')})});
    if(!response.ok)throw new Error(`signBlob: ${response.status}`);
    return Buffer.from(((await response.json()) as {signedBlob:string}).signedBlob,'base64');
  };
  return {email,sign,accessToken};
}

export function gcsStore(bucket:string,signer=metadataSigner()):ObjectStore{
  const sign=async(method:'GET'|'PUT',key:string,seconds:number,headers:Record<string,string>,query?:Record<string,string>)=>{
    const request=signedUrl({method,bucket,key,email:await signer.email(),headers,query,seconds,now:new Date()});
    return request.url(await signer.sign(request.stringToSign));
  };
  const object=(key:string)=>`https://${host}/storage/v1/b/${encode(bucket)}/o/${encode(key)}`;
  const call=async(url:string,method='GET')=>fetch(url,{method,headers:{authorization:`Bearer ${await signer.accessToken()}`},signal:AbortSignal.timeout(60_000)});
  return {
    async signUpload(key:string,mediaType:MediaType,size:number,seconds:number){
      const headers={'content-type':mediaType,'x-goog-content-length-range':`${size},${size}`,'x-goog-if-generation-match':'0'};
      return {url:await sign('PUT',key,seconds,headers),headers};
    },
    signDownload(key,fileName,seconds){
      return sign('GET',key,seconds,{},{'response-content-disposition':`attachment; filename*=UTF-8''${encode(fileName)}`});
    },
    async inspect(key,maxBytes){
      const meta=await call(object(key));
      if(meta.status===404)return undefined;
      if(!meta.ok)throw new Error(`storage metadata: ${meta.status}`);
      const {size,contentType}=await meta.json() as {size:string;contentType:string};
      if(Number(size)>maxBytes)return {size:Number(size),mediaType:contentType,sha256:'',head:Buffer.alloc(0)};
      const media=await call(`${object(key)}?alt=media`);
      if(!media.ok||!media.body)throw new Error(`storage read: ${media.status}`);
      const hash=createHash('sha256'),head:Buffer[]=[];let read=0;
      for await(const chunk of media.body as unknown as AsyncIterable<Uint8Array>){
        const bytes=Buffer.from(chunk);hash.update(bytes);if(read<4096)head.push(bytes);read+=bytes.length;
      }
      return {size:read,mediaType:contentType,sha256:hash.digest('hex'),head:Buffer.concat(head).subarray(0,4096)};
    },
    async remove(key){
      const response=await call(object(key),'DELETE');
      if(!response.ok&&response.status!==404)throw new Error(`storage delete: ${response.status}`);
    },
  };
}
