import type {FastifyInstance} from 'fastify';

type Hook=(sessionId:string)=>Promise<unknown>;
const hooks=new WeakMap<object,Hook[]>();

/** Les modules qui dépendent d'une session s'inscrivent ici : identity ne les connaît pas. */
export function onSessionRevoked(app:FastifyInstance,hook:Hook){const list=hooks.get(app.server)??[];list.push(hook);hooks.set(app.server,list);}

export async function sessionRevoked(app:FastifyInstance,sessionId:string){
  for(const hook of hooks.get(app.server)??[])await hook(sessionId).catch(error=>app.log.error({err:error},'Session revocation hook failed'));
}
