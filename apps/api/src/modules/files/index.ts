/** Façade du module files. */
export {FileService} from './application.js';
export {registerFileRoutes} from './adapters/in/http.js';
export {gcsStore} from './adapters/out/gcs.js';
export type {FileCatalog,ObjectStore,StoredObject} from './ports.js';
