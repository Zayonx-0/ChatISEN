/** Façade du module identity : seul fichier que les autres modules importent. */
export {IdentityService} from './application.js';
export {registerIdentityRoutes} from './adapters/in/http.js';
export type {AuditEntry,AuditTrail,PublicUser,UserDirectory} from './ports.js';
