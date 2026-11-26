import type {Queryable} from '../../../../platform/db.js';
import type {Sample} from '../../domain.js';
import type {QualitySummary} from '../../ports.js';

/** Un lot renvoyé après une coupure ne crée pas de doublon. */
export async function insert(db:Queryable,callId:string,userId:string,samples:Sample[]){
  await db.query(`insert into quality.samples(call_id,participant_user_id,captured_at,packets_received,packets_lost,jitter_ms,rtt_ms,bitrate_kbps,candidate_type)
    select $1,$2,s."capturedAt",s."packetsReceived",s."packetsLost",s."jitterMs",s."rttMs",s."bitrateKbps",s."candidateType"
    from jsonb_to_recordset($3::jsonb) as s("capturedAt" timestamptz,"packetsReceived" bigint,"packetsLost" bigint,"jitterMs" numeric,"rttMs" numeric,"bitrateKbps" numeric,"candidateType" text)
    on conflict(call_id,participant_user_id,captured_at) do nothing`,[callId,userId,JSON.stringify(samples)]);
}
export async function summary(db:Queryable,callId:string):Promise<QualitySummary|undefined>{
  const row=(await db.query(`select count(*)::int as samples,
      avg((candidate_type='relay')::int)::float as relay_share,avg(rtt_ms)::float as rtt,avg(jitter_ms)::float as jitter,
      (sum(packets_lost)::float/nullif(sum(packets_lost)+sum(packets_received),0)) as loss
    from quality.samples where call_id=$1`,[callId])).rows[0];
  return row.samples?{samples:row.samples,relayShare:row.relay_share,averageRttMs:row.rtt,averageJitterMs:row.jitter,lossRatio:row.loss??0}:undefined;
}
