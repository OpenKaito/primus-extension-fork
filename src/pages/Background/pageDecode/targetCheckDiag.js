export const TARGET_CHECK_DEBUG_KEY = 'kaitoTargetCheckDebug';

const MAX_KEYS = 8;
const MAX_TARGETS = 8;
const SAFE_KEY = /^[A-Za-z_][A-Za-z0-9_-]{0,31}$/;

function keyName(key) {
  return SAFE_KEY.test(key) ? key : '~';
}

export function describeKeys(value) {
  if (Array.isArray(value)) return `[${value.length}]`;
  if (value === null || typeof value !== 'object') return typeof value;
  const keys = Object.keys(value);
  const shown = [...new Set(keys.slice(0, MAX_KEYS).map(keyName))];
  return shown.join('/') + (keys.length > MAX_KEYS ? `/+${keys.length - MAX_KEYS}` : '');
}

function pathOf(item) {
  if (typeof item === 'string') return item;
  if (item && typeof item === 'object' && typeof item.field === 'string') return item.field;
  return undefined;
}

function prefixes(path) {
  const parts = path.match(/^\$|\.\.?[^.[\]]+|\[[^\]]*\]/g) || [];
  const out = [];
  let acc = '';
  for (const part of parts) {
    acc += part;
    out.push(acc);
  }
  return out;
}

function exists(query, value, path) {
  try {
    return query(value, path).length > 0;
  } catch {
    return false;
  }
}

export function describeTargetCheck(query, jsonPathArr, result, replayError) {
  if (result === undefined || result === null) {
    const status = /status: (\d{3})/.exec(replayError || '')?.[1];
    return { outcome: status ? `http${status}` : 'replay_failed' };
  }
  if (typeof result !== 'object') return { outcome: `not_json:${typeof result}` };
  const missing = [];
  for (const item of jsonPathArr || []) {
    const path = pathOf(item);
    if (!path) continue;
    if (item?.op === 'MATCH_ONE') continue;
    if (!exists(query, result, path)) missing.push(path);
  }
  if (missing.length === 0) return { outcome: 'ok' };
  const first = missing[0];
  const found = prefixes(first)
    .filter((p) => exists(query, result, p))
    .pop();
  let at;
  try {
    at = found && found !== '$' ? query(result, found)[0] : result;
  } catch {
    at = undefined;
  }
  return {
    outcome: 'path_missing',
    missing: missing.slice(0, 3),
    found: found || '$',
    keys: describeKeys(at),
  };
}

export function mergeTargetCheck(record, templateUrl, check, at = Date.now()) {
  const targets = { ...((record && record.targets) || {}) };
  const prev = targets[templateUrl];
  targets[templateUrl] = { ...check, n: ((prev && prev.n) || 0) + 1, at };
  const urls = Object.keys(targets);
  for (const url of urls.slice(0, Math.max(0, urls.length - MAX_TARGETS))) delete targets[url];
  return { at, targets };
}
