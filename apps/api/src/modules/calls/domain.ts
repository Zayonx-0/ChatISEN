export type CallMode='audio'|'video';
export type Topology='p2p'|'sfu';
export type CallState='ringing'|'active'|'ended';
export type ParticipationState='joined'|'declined'|'left';
export type SignalType='offer'|'answer'|'ice';
export type EndReason='declined'|'expired'|'ended'|'disconnected';
export const ringingSeconds=45;
/** Un jeton d'entrée dans une salle vit peu : un membre retiré ne peut pas revenir longtemps. */
export const admissionSeconds=60;
export const maxSignalLength=30_000;

export type Call={id:string;conversationId:string;initiatorId:string;mode:CallMode;topology:Topology;state:CallState;room:string;createdAt:string;endedAt?:string;endReason?:EndReason};

/** Forme du contrat REST. */
export const callDto=(call:Call)=>({id:call.id,conversationId:call.conversationId,initiatorId:call.initiatorId,mode:call.mode,topology:call.topology,state:call.state,createdAt:call.createdAt,...(call.endedAt?{endedAt:call.endedAt}:{})});
/** Forme des événements du contrat temps réel. */
export const callEventData=(call:Call)=>({callId:call.id,conversationId:call.conversationId,initiatorId:call.initiatorId,mode:call.mode,topology:call.topology,state:call.state,...(call.endReason?{reason:call.endReason}:{})});
