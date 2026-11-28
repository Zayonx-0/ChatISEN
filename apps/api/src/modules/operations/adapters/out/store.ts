import type {Queryable} from '../../../../platform/db.js';
import type {Target} from '../../domain.js';

type Pending={id:string;actorId:string;target:Target;vmName:string;bootBefore:number;startedAt:Date;uncertaintyAudited:boolean};
type Row={
  now:Date;retry_at:Date|null;operation_id:string|null;actor_id:string;target:Target;vm_name:string;
  boot_before:number;started_at:Date;uncertainty_audited:boolean;
};

export async function read(db:Queryable,lock=false){
  const {rows:[row]}=await db.query<Row>(`select *,clock_timestamp() as now from operations.restart_gate where singleton${lock?' for update':''}`);
  if(!row)throw new Error('Verrou de redémarrage absent');
  const pending:Pending|null=row.operation_id?{id:row.operation_id,actorId:row.actor_id,target:row.target,vmName:row.vm_name,
    bootBefore:row.boot_before,startedAt:row.started_at,uncertaintyAudited:row.uncertainty_audited}:null;
  return {pending,now:row.now,retryAt:row.retry_at};
}

export async function reserve(db:Queryable,id:string,actorId:string,target:Target,vmName:string,bootBefore:number){
  await db.query(`update operations.restart_gate set operation_id=$1,actor_id=$2,target=$3,vm_name=$4,
    boot_before=$5,started_at=clock_timestamp() where singleton`,[id,actorId,target,vmName,bootBefore]);
}
export async function finish(db:Queryable){
  await db.query(`update operations.restart_gate set operation_id=null,actor_id=null,target=null,vm_name=null,boot_before=null,
    started_at=null,uncertainty_audited=false,retry_at=clock_timestamp()+interval '5 minutes' where singleton`);
}
export async function markUncertain(db:Queryable){
  await db.query('update operations.restart_gate set uncertainty_audited=true where singleton');
}
