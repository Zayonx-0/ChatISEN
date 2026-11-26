export class ApiError extends Error {constructor(readonly status:number,message:string,readonly code=''){super(message)}}

export async function api<T>(path:string,options:RequestInit={}):Promise<T>{
  const headers=new Headers(options.headers);if(options.body&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');
  const response=await fetch(`/api/v1${path}`,{...options,headers,credentials:'include'});
  if(response.status===204)return undefined as T;
  const data=await response.json().catch(()=>({}));if(!response.ok)throw new ApiError(response.status,data.message||'Une erreur est survenue.',data.code);return data as T;
}

export const write=(csrf:string,method:string,body?:unknown):RequestInit=>({method,headers:{'x-csrf-token':csrf},...(body===undefined?{}:{body:JSON.stringify(body)})});
