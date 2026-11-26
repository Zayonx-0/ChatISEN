export type QualitySummary={samples:number;relayShare:number;averageRttMs:number;averageJitterMs:number;lossRatio:number};

export interface QualityReport{
  summary(callId:string):Promise<QualitySummary|undefined>;
}
