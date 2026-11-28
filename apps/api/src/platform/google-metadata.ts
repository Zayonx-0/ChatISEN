const metadata='http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/';
export async function readServiceAccount(path:'email'|'token'){
  const response=await fetch(metadata+path,{headers:{'Metadata-Flavor':'Google'},redirect:'error',signal:AbortSignal.timeout(3000)});
  if(!response.ok)throw new Error('Identité GCE indisponible');
  return response;
}

let token:{value:string;until:number}|undefined;
export async function serviceAccountToken(){
  if(!token||token.until<Date.now()){
    const {access_token,expires_in}=await (await readServiceAccount('token')).json() as {access_token:string;expires_in:number};
    if(typeof access_token!=='string'||!access_token||!Number.isFinite(expires_in))throw new Error('Identité GCE indisponible');
    token={value:access_token,until:Date.now()+(expires_in-60)*1000};
  }
  return token.value;
}
