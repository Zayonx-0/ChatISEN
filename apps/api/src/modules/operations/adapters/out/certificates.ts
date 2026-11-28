import {checkServerIdentity,connect} from 'node:tls';
import type {Certificates} from '../../ports.js';

export function publicCertificates(webHost:string|undefined,turnHost:string|undefined):Certificates{
  return {expiry(endpoint){
    const host=endpoint==='load-balancer'?webHost:turnHost;
    if(!host)return Promise.resolve(null);
    const port=endpoint==='load-balancer'?443:5349;
    return new Promise(resolve=>{
      const socket=connect({host,port,servername:host,rejectUnauthorized:false});
      const timer=setTimeout(()=>complete(null),2500);
      const complete=(date:string|null)=>{clearTimeout(timer);socket.destroy();resolve(date);};
      socket.once('error',()=>complete(null));
      socket.once('secureConnect',()=>{
        const certificate=socket.getPeerCertificate();
        const expiry=Date.parse(certificate.valid_to);
        const trusted=socket.authorized||String(socket.authorizationError)==='CERT_HAS_EXPIRED';
        complete(trusted&&Number.isFinite(expiry)&&!checkServerIdentity(host,certificate)?new Date(expiry).toISOString():null);
      });
    });
  }};
}
