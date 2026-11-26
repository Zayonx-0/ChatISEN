import type {FastifyInstance,FastifyReply,FastifyRequest} from 'fastify';
import {randomUUID} from 'node:crypto';
import {Failure,type FailureKind} from './errors.js';
import {cookieName,csrfOk} from './security.js';

export type SessionUser={id:string;handle:string;displayName:string;createdAt:string;globalRole:'user'|'admin'};
export type Identity={user:SessionUser;session:{id:string;expiresAt:string};token:string};

/** Port que le module identity fournit au noyau et aux modules qui suivent des sessions. */
export interface SessionVerifier{
  verify(token:string):Promise<Identity|undefined>;
  activeSessionIds(sessionIds:string[]):Promise<Set<string>>;
}

type AuthenticatedRequest=FastifyRequest&{identity?:Identity};
export const identityOf=(request:FastifyRequest)=>(request as AuthenticatedRequest).identity!;

const statuses:Record<FailureKind,number>={invalid:400,unauthorized:401,forbidden:403,not_found:404,conflict:409,too_large:413,unsupported:415,rate_limited:429,unavailable:503};
export const apiError=(code:string,message:string)=>({code,message,requestId:randomUUID()});

/** Toutes les erreurs sortent au format ApiError du contrat. */
export function useApiErrors(app:FastifyInstance){
  app.setErrorHandler((error:Error&{statusCode?:number},request,reply)=>{
    if(error instanceof Failure)return reply.code(statuses[error.kind]).send(apiError(error.code,error.message));
    const status=error.statusCode;
    if(status&&status>=400&&status<500)return reply.code(status).send(apiError(status===413?'PAYLOAD_TOO_LARGE':status===429?'RATE_LIMITED':'VALIDATION_ERROR','Requête refusée'));
    request.log.error({err:error},'Unhandled request error');
    return reply.code(500).send(apiError('INTERNAL_ERROR','Erreur interne'));
  });
  app.setNotFoundHandler((_request,reply)=>reply.code(404).send(apiError('NOT_FOUND','Route inconnue')));
}

export const sameOrigin=(request:FastifyRequest)=>Boolean(process.env.CORS_ORIGIN)&&request.headers.origin===process.env.CORS_ORIGIN;
export function requireOrigin(request:FastifyRequest){if(!sameOrigin(request))throw new Failure('forbidden','Origine refusée','ORIGIN_DENIED');}

/** Lecture : session valide. Écriture : session, origine de l'application et jeton CSRF. */
export function guards(sessions:SessionVerifier){
  const authenticate=async(request:FastifyRequest,_reply?:FastifyReply)=>{
    const token=request.cookies[cookieName];
    const identity=token?await sessions.verify(token):undefined;
    if(!identity)throw new Failure('unauthorized','Authentification requise');
    (request as AuthenticatedRequest).identity=identity;
  };
  const mutation=async(request:FastifyRequest,reply:FastifyReply)=>{
    await authenticate(request,reply);
    requireOrigin(request);
    if(!csrfOk(identityOf(request).token,String(request.headers['x-csrf-token']||'')))throw new Failure('forbidden','Jeton CSRF invalide','CSRF_FAILED');
  };
  return {authenticate,mutation};
}
export type Guards=ReturnType<typeof guards>;
