import {Pool,type PoolClient} from 'pg';

export type Tx=PoolClient;
export type Queryable=Pick<Pool,'query'>|PoolClient;

export class Database{
  readonly pool:Pool;
  constructor(poolOrUrl:Pool|string){this.pool=typeof poolOrUrl==='string'?new Pool({connectionString:poolOrUrl}):poolOrUrl;}
  async close(){await this.pool.end();}
  async ping(){await this.pool.query('select 1');}
  async transaction<T>(work:(tx:Tx)=>Promise<T>):Promise<T>{
    const client=await this.pool.connect();
    try{await client.query('BEGIN');const result=await work(client);await client.query('COMMIT');return result;}
    catch(error){await client.query('ROLLBACK');throw error;}
    finally{client.release();}
  }
}

export const iso=(value:Date|string)=>new Date(value).toISOString();
