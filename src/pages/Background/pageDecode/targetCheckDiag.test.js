import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { describeKeys, describeTargetCheck, mergeTargetCheck } from './targetCheckDiag.js';

const query = (value, path) => {
  const parts = path.match(/\.[^.[\]]+|\[\d+\]/g) || [];
  let cur = value;
  for (const part of parts) {
    if (cur === null || typeof cur !== 'object') return [];
    const key = part.startsWith('[') ? Number(part.slice(1, -1)) : part.slice(1);
    if (!(key in cur)) return [];
    cur = cur[key];
  }
  return [cur];
};

describe('describeTargetCheck', () => {
  it('reports the replay status when the replay threw', () => {
    assert.deepEqual(describeTargetCheck(query, ['$.a'], undefined, 'HTTP error! status: 401'), {
      outcome: 'http401',
    });
    assert.deepEqual(describeTargetCheck(query, ['$.a'], undefined, 'Failed to fetch'), {
      outcome: 'replay_failed',
    });
  });

  it('is ok when every path resolves', () => {
    assert.deepEqual(describeTargetCheck(query, ['$.data.x'], { data: { x: 1 } }), { outcome: 'ok' });
  });

  it('names the missing path, the deepest prefix found, and the key names there', () => {
    const result = { data: { result: { timeline: 1, errors: 2 } } };
    assert.deepEqual(describeTargetCheck(query, ['$.data.result.metrics.views'], result), {
      outcome: 'path_missing',
      missing: ['$.data.result.metrics.views'],
      found: '$.data.result',
      keys: 'timeline/errors',
    });
  });

  it('never records values and masks keys that are not plain identifiers', () => {
    const result = { '0xabc0000000000000000000000000000000000000': { pnl: 5 }, '12345': 1, ok: true };
    const check = describeTargetCheck(query, ['$.missing'], result);
    assert.equal(check.keys, '~/ok');
    assert.equal(JSON.stringify(check).includes('5'), false);
  });

  it('describes non-object results by type', () => {
    assert.deepEqual(describeTargetCheck(query, ['$.a'], 'html'), { outcome: 'not_json:string' });
    assert.equal(describeKeys([1, 2, 3]), '[3]');
  });
});

describe('mergeTargetCheck', () => {
  it('keeps the latest check per template URL and counts attempts', () => {
    let record = mergeTargetCheck(undefined, 'https://a/x', { outcome: 'http401' }, 1);
    record = mergeTargetCheck(record, 'https://a/x', { outcome: 'ok' }, 2);
    assert.deepEqual(record.targets['https://a/x'], { outcome: 'ok', n: 2, at: 2 });
    assert.equal(record.at, 2);
  });
});
