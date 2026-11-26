/** Façade du module notifications. */
export {NotificationService} from './application.js';
export {registerNotificationRoutes} from './adapters/in/http.js';
export {webPushFromEnv} from './adapters/out/web-push.js';
export type {PushConfig,PushSender,PushSubscriptions,Subscription} from './ports.js';
