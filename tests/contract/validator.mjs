/** Tiny dependency-free JSON Schema subset used by the contract fixtures.
 * Runtime API validation is performed by Fastify/TypeBox in the application;
 * this test validator keeps the contracts testable before that app exists. */
export function validate(value, schema, root = schema, path = '$') {
  if (schema.$ref) {
    const prefix = '#/';
    if (!schema.$ref.startsWith(prefix)) throw new Error(`unsupported ref ${schema.$ref}`);
    let target = root;
    for (const part of schema.$ref.slice(prefix.length).split('/')) target = target[part];
    return validate(value, target, root, path);
  }
  if (schema.allOf) {
    for (const item of schema.allOf) validate(value, item, root, path);
  }
  if (schema.oneOf) {
    const valid = schema.oneOf.filter((item) => { try { validate(value, item, root, path); return true; } catch { return false; } });
    if (valid.length !== 1) throw new Error(`${path}: oneOf matched ${valid.length} schemas`);
  }
  if (schema.anyOf) {
    if (!schema.anyOf.some((item) => { try { validate(value, item, root, path); return true; } catch { return false; } })) throw new Error(`${path}: anyOf did not match`);
  }
  if (schema.not) {
    try { validate(value, schema.not, root, path); throw new Error(`${path}: not matched`); } catch (error) { if (error.message.endsWith('not matched')) throw error; }
  }
  if (schema.const !== undefined && JSON.stringify(value) !== JSON.stringify(schema.const)) throw new Error(`${path}: expected const`);
  if (schema.enum && !schema.enum.some((item) => JSON.stringify(item) === JSON.stringify(value))) throw new Error(`${path}: enum`);
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const okay = types.some((type) => type === 'null' ? value === null : type === 'array' ? Array.isArray(value) : type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value) : type === 'integer' ? Number.isInteger(value) : type === 'number' ? typeof value === 'number' && Number.isFinite(value) : typeof value === type);
    if (!okay) throw new Error(`${path}: type`);
  }
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) throw new Error(`${path}: minLength`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) throw new Error(`${path}: maxLength`);
    if (schema.pattern && !(new RegExp(schema.pattern, 'u').test(value))) throw new Error(`${path}: pattern`);
    if (schema.format === 'uuid' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) throw new Error(`${path}: uuid`);
    if (schema.format === 'date-time' && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value)) throw new Error(`${path}: date-time`);
    if (schema.format === 'uri' && !/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) throw new Error(`${path}: uri`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) throw new Error(`${path}: minimum`);
    if (schema.maximum !== undefined && value > schema.maximum) throw new Error(`${path}: maximum`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) throw new Error(`${path}: minItems`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) throw new Error(`${path}: maxItems`);
    if (schema.uniqueItems) { const seen = new Set(value.map((item) => JSON.stringify(item))); if (seen.size !== value.length) throw new Error(`${path}: uniqueItems`); }
    if (schema.items) value.forEach((item, index) => validate(item, schema.items, root, `${path}[${index}]`));
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required || []) if (!(key in value)) throw new Error(`${path}: missing ${key}`);
    const known = collectProperties(schema, root);
    if (schema.additionalProperties === false) for (const key of Object.keys(value)) if (!(key in known)) throw new Error(`${path}: additional ${key}`);
    for (const [key, child] of Object.entries(schema.properties || {})) if (key in value) validate(value[key], child, root, `${path}.${key}`);
    if (schema.maxProperties !== undefined && Object.keys(value).length > schema.maxProperties) throw new Error(`${path}: maxProperties`);
  }
  return value;
}

function collectProperties(schema, root, seen = new Set()) {
  if (!schema || typeof schema !== 'object') return {};
  if (schema.$ref) {
    if (seen.has(schema.$ref)) return {};
    seen.add(schema.$ref);
    let target = root;
    for (const part of schema.$ref.replace(/^#\//, '').split('/')) target = target[part];
    return collectProperties(target, root, seen);
  }
  const out = { ...(schema.properties || {}) };
  for (const child of schema.allOf || []) Object.assign(out, collectProperties(child, root, seen));
  return out;
}

export function schemaAt(document, pointer) {
  let target = document;
  for (const part of pointer.replace(/^#\//, '').split('/')) target = target[part];
  return target;
}
