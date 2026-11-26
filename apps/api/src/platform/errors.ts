/** Refus métier, sans dépendance à HTTP : l'adaptateur entrant les traduit en réponses. */
export type FailureKind='invalid'|'unauthorized'|'forbidden'|'not_found'|'conflict'|'too_large'|'unsupported'|'rate_limited'|'unavailable';

const defaultCodes:Record<FailureKind,string>={
  invalid:'VALIDATION_ERROR',unauthorized:'UNAUTHORIZED',forbidden:'FORBIDDEN',not_found:'NOT_FOUND',conflict:'CONFLICT',
  too_large:'PAYLOAD_TOO_LARGE',unsupported:'UNSUPPORTED_MEDIA_TYPE',rate_limited:'RATE_LIMITED',unavailable:'SERVICE_UNAVAILABLE',
};

export class Failure extends Error{
  readonly code:string;
  constructor(readonly kind:FailureKind,message:string,code?:string){super(message);this.code=code??defaultCodes[kind];}
}

export const invalid=(message:string)=>new Failure('invalid',message);
export const notFound=(message='Ressource indisponible')=>new Failure('not_found',message);
export const forbidden=(message='Action refusée')=>new Failure('forbidden',message);
export const conflict=(message:string,code?:string)=>new Failure('conflict',message,code);
export const keyReused=()=>new Failure('conflict','Clé déjà utilisée','IDEMPOTENCY_CONFLICT');
