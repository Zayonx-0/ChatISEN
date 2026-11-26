/** Façade du module messaging. */
export {MessageService} from './application.js';
export {registerMessageRoutes} from './adapters/in/http.js';
export type {Message,MessageTimeline} from './ports.js';
