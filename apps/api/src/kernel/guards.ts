import type {FastifyReply} from 'fastify';
import type {PostgresRepository} from '../repositories/postgres.js';
import {postgresAuthenticator,invalid,type AuthRequest} from '../identity/postgres-routes.js';
import {csrfOk} from '../security.js';

export const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Lecture : session valide. Écriture : session, origine de l'application et jeton CSRF. */
export function guards(repo:PostgresRepository){
  const authenticate=postgresAuthenticator(repo);
  const mutation=async(req:AuthRequest,reply:FastifyReply)=>{
    await authenticate(req,reply);if(reply.sent)return;
    if(!process.env.CORS_ORIGIN||req.headers.origin!==process.env.CORS_ORIGIN)return invalid(reply,403,'ORIGIN_DENIED','Origine refusée');
    if(!csrfOk(req.identity!.token,String(req.headers['x-csrf-token']||'')))return invalid(reply,403,'CSRF_FAILED','Jeton CSRF invalide');
  };
  return {authenticate,mutation};
}
