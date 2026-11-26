import type {Notification,PoolClient} from 'pg';
import type {Database} from './db.js';

/**
 * Écoute PostgreSQL avec reconnexion. NOTIFY ne fait que réveiller : l'appelant relit
 * toujours la base, et son propre intervalle rattrape ce qu'une coupure aurait manqué.
 */
export function listen(db:Database,channels:string[],onNotify:(message:Notification)=>void,onError:(error:unknown)=>void,onReady:()=>void=()=>{}){
  let client:PoolClient|undefined,retry:NodeJS.Timeout|undefined,stopped=false,connecting=false;
  const schedule=()=>{if(!stopped&&!retry){retry=setTimeout(()=>{retry=undefined;void connect();},1000);retry.unref();}};
  const connect=async()=>{
    if(stopped||client||connecting)return;connecting=true;
    try{
      const next=await db.pool.connect();
      if(stopped){next.release();return;}
      client=next;
      next.on('notification',onNotify);
      next.once('error',error=>{onError(error);if(client===next){client=undefined;next.release(true);}schedule();});
      for(const channel of channels)await next.query(`LISTEN ${channel}`);
      onReady();
    }catch(error){onError(error);client?.release(true);client=undefined;schedule();}
    finally{connecting=false;}
  };
  void connect();
  // La connexion d'écoute est détruite, jamais rendue au pool avec ses LISTEN.
  return ()=>{stopped=true;if(retry)clearTimeout(retry);client?.release(true);client=undefined;};
}
