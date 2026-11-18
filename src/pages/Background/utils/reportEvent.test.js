import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ATTESTATION_REPORT_CONTEXT_KEY,
  clearAttestationReportContext,
  enrichAttestationReportRawData,
  initAttestationReportContext,
  recordAttestationAlgorithmResponse,
  updateAttestationStepProgress,
} from './reportEvent.js';

const values = {};

globalThis.chrome = {
  storage: {
    local: {
      async get(keys) {
        return Object.fromEntries(
          keys.filter((key) => key in values).map((key) => [key, values[key]])
        );
      },
      async set(entries) {
        Object.assign(values, entries);
      },
      async remove(keys) {
        keys.forEach((key) => delete values[key]);
      },
    },
  },
};

beforeEach(() => {
  Object.keys(values).forEach((key) => delete values[key]);
});

describe('attestation report context', () => {
  it('adds stable identity, failure responses, and conditions', async () => {
    await initAttestationReportContext({
      address: '0xabc',
      requestid: 'primus-1',
      kaitoRequestId: 'kaito-1',
      templateId: 'template-1',
      attConditions: [[{ op: '>', value: 500 }]],
      targetCount: 1,
    });
    await recordAttestationAlgorithmResponse('getAttestation', '{"retcode":"0"}');

    const rawData = await enrichAttestationReportRawData(
      'ATTESTATION_GENERATE',
      {
        status: 'FAILED',
        reason: 'Not met the requirements',
        detail: { code: '00104', desc: 'Not eligible' },
      }
    );

    assert.equal(rawData.address, '0xabc');
    assert.equal(rawData.requestid, 'primus-1');
    assert.equal(rawData.kaitoRequestId, 'kaito-1');
    assert.deepEqual(rawData.detail.attConditions, [
      [{ op: '>', value: 500 }],
    ]);
    assert.equal(rawData.ext.getAttestationResCount, 1);
    assert.equal(rawData.ext.getAttestationResultResCount, 0);
  });

  it('reports completed and partial stages for 00013', async () => {
    await initAttestationReportContext({ targetCount: 2 });
    await updateAttestationStepProgress('captured', {
      completed: 2,
      total: 2,
    });
    await updateAttestationStepProgress('replayed', {
      completed: 1,
      total: 2,
    });

    const rawData = await enrichAttestationReportRawData(
      'ATTESTATION_GENERATE',
      {
        status: 'FAILED',
        detail: { code: '00013', desc: 'Target data missing' },
      }
    );

    assert.deepEqual(rawData.detail.steps, ['captured']);
    assert.equal(rawData.detail.stepProgress.replayed.status, 'partial');
    assert.equal(rawData.detail.stepProgress.replayed.completed, 1);
  });

  it('clears the context', async () => {
    await initAttestationReportContext({ requestid: 'primus-1' });
    await clearAttestationReportContext();
    assert.equal(values[ATTESTATION_REPORT_CONTEXT_KEY], undefined);
  });
});
