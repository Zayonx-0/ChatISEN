/**
 * Runtime contract catalogue.  The objects are deliberately dependency free:
 * Fastify can consume the JSON Schema values directly and the browser can
 * import the same catalogue without bundling a validator.
 */
import http from '../schemas/http.json' with { type: 'json' };
import ws from '../schemas/ws.json' with { type: 'json' };
import openapi from '../schemas/openapi.json' with { type: 'json' };

export const CONTRACT_VERSION = 1;
export { http, ws, openapi };
export const schemas = Object.freeze({ http, ws });

export const HTTP_STATUS = Object.freeze({
  created: 201,
  ok: 200,
  accepted: 202,
  noContent: 204,
  badRequest: 400,
  unauthorized: 401,
  forbidden: 403,
  notFound: 404,
  conflict: 409,
  payloadTooLarge: 413,
  unsupportedMediaType: 415,
  tooManyRequests: 429,
  unavailable: 503
});

export const ERROR_CODES = Object.freeze(http.$defs.ErrorCode.enum);
export const WS_SERVER_TYPES = Object.freeze(ws.$defs.ServerType.enum);
export const WS_CLIENT_TYPES = Object.freeze(ws.$defs.ClientType.enum);

/** Return the canonical API path used by clients and tests. */
export function apiPath(path) {
  if (!path.startsWith('/')) throw new TypeError('path must start with /');
  return `/api/v1${path}`;
}
