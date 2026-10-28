import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isStreamResponseValueType,
  responseTemplateIndicatesStream,
  STREAM_REVEAL_OP,
} from './streamTemplate.js';

describe('streamTemplate', () => {
  it('recognizes STREAM valueType case-insensitively', () => {
    assert.equal(isStreamResponseValueType('STREAM'), true);
    assert.equal(isStreamResponseValueType('stream'), true);
    assert.equal(isStreamResponseValueType('FIXED_VALUE'), false);
    assert.equal(isStreamResponseValueType(undefined), false);
  });

  it('marks a response template as stream when any slot is STREAM', () => {
    assert.equal(responseTemplateIndicatesStream(null), false);
    assert.equal(
      responseTemplateIndicatesStream([{ valueType: 'FIXED_VALUE', resolver: { expression: '$' } }]),
      false
    );
    assert.equal(
      responseTemplateIndicatesStream([
        { resolver: { type: 'JSON_PATH', expression: '$' }, valueType: 'STREAM', feilds: [{ key: 'body' }] },
      ]),
      true
    );
  });

  it('reveals stream bodies as hex', () => {
    assert.equal(STREAM_REVEAL_OP, 'REVEAL_HEX_STRING');
  });
});
