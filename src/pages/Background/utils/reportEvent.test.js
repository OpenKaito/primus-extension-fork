import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ATTESTATION_REPORT_CONTEXT_KEY,
  clearAttestationReportContext,
  enrichAttestationReportRawData,
  initAttestationReportContext,
  recordAttestationAlgorithmResponse,
  updateAttestationStepProgress,
  updateAttestationStepTarget,
} from './reportEvent.js';

const values = {};
let failNextSet = false;

globalThis.chrome = {
  storage: {
    local: {
      async get(keys) {
        return Object.fromEntries(
          keys.filter((key) => key in values).map((key) => [key, values[key]])
        );
      },
      async set(entries) {
        if (failNextSet) {
          failNextSet = false;
          throw new Error('simulated storage failure');
        }
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
  failNextSet = false;
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
    await recordAttestationAlgorithmResponse(
      'getAttestation',
      '{"retcode":"0"}',
      'primus-1'
    );

    const rawData = await enrichAttestationReportRawData(
      'ATTESTATION_GENERATE',
      {
        requestid: 'primus-1',
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
    await initAttestationReportContext({
      requestid: 'primus-1',
      targetCount: 2,
    });
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
        requestid: 'primus-1',
        status: 'FAILED',
        detail: { code: '00013', desc: 'Target data missing' },
      }
    );

    assert.deepEqual(rawData.detail.steps, ['captured']);
    assert.equal(rawData.detail.stepProgress.replayed.status, 'partial');
    assert.equal(rawData.detail.stepProgress.replayed.completed, 1);
    assert.deepEqual(rawData.detail.stepProgress.validated.targets, []);
  });

  it('reports request-bound target failures and clears recovered targets', async () => {
    await initAttestationReportContext({
      requestid: 'primus-1',
      targetCount: 3,
    });
    await updateAttestationStepProgress('captured', {
      completed: 2,
      total: 3,
      requestid: 'primus-1',
      targets: [
        {
          name: 'balance',
          templateUrl: 'https://example.com/balance',
          reason: 'not_observed',
        },
      ],
    });
    await updateAttestationStepTarget(
      'replayed',
      '1:https://example.com/positions',
      {
        name: 'positions',
        templateUrl: 'https://example.com/positions',
        httpStatus: 401,
      },
      'primus-1'
    );
    await updateAttestationStepTarget(
      'replayed',
      '1:https://example.com/positions',
      {
        name: 'positions',
        templateUrl: 'https://example.com/positions',
        httpStatus: 403,
      },
      'primus-1'
    );
    assert.deepEqual(
      values[ATTESTATION_REPORT_CONTEXT_KEY].stepProgress.replayed.targets,
      [
        {
          name: 'positions',
          templateUrl: 'https://example.com/positions',
          httpStatus: 403,
        },
      ]
    );
    await updateAttestationStepTarget(
      'validated',
      '2:https://example.com/profile',
      {
        name: 'profile',
        templateUrl: 'https://example.com/profile',
        missingPath: '$.user.tier',
      },
      'primus-1'
    );
    await updateAttestationStepTarget(
      'validated',
      'stale-target',
      {
        name: 'stale',
        templateUrl: 'https://example.com/stale',
        missingPath: '$.stale',
      },
      'primus-2'
    );
    await updateAttestationStepTarget(
      'validated',
      'unbound-target',
      {
        name: 'unbound',
        templateUrl: 'https://example.com/unbound',
        missingPath: '$.unbound',
      }
    );
    await updateAttestationStepTarget(
      'replayed',
      '1:https://example.com/positions',
      null,
      'primus-1'
    );

    const rawData = await enrichAttestationReportRawData(
      'ATTESTATION_GENERATE',
      {
        requestid: 'primus-1',
        status: 'FAILED',
        detail: { code: '00013', desc: 'Target data missing' },
      }
    );

    assert.deepEqual(rawData.detail.stepProgress.captured.targets, [
      {
        name: 'balance',
        templateUrl: 'https://example.com/balance',
        reason: 'not_observed',
      },
    ]);
    assert.deepEqual(rawData.detail.stepProgress.replayed.targets, []);
    assert.deepEqual(rawData.detail.stepProgress.validated.targets, [
      {
        name: 'profile',
        templateUrl: 'https://example.com/profile',
        missingPath: '$.user.tier',
      },
    ]);
  });

  it('reports not_marked_target in captured targets for 00013', async () => {
    await initAttestationReportContext({
      requestid: 'primus-1',
      targetCount: 2,
    });
    await updateAttestationStepProgress('captured', {
      completed: 1,
      total: 2,
      requestid: 'primus-1',
      targets: [
        {
          name: 'balance',
          templateUrl: 'https://example.com/balance',
          reason: 'not_observed',
        },
        {
          name: 'positions',
          templateUrl: 'https://example.com/positions',
          reason: 'not_marked_target',
        },
      ],
    });
    const rawData = await enrichAttestationReportRawData(
      'ATTESTATION_GENERATE',
      {
        requestid: 'primus-1',
        status: 'FAILED',
        detail: { code: '00013', desc: 'Target data missing' },
      }
    );
    assert.deepEqual(
      rawData.detail.stepProgress.captured.targets.find(
        (target) => target.templateUrl === 'https://example.com/positions'
      ),
      {
        name: 'positions',
        templateUrl: 'https://example.com/positions',
        reason: 'not_marked_target',
      }
    );
  });

  it('does not attach pipeline diagnostics to a non-00013 event', async () => {
    await initAttestationReportContext({
      requestid: 'primus-1',
      targetCount: 1,
    });
    const rawData = await enrichAttestationReportRawData(
      'ATTESTATION_GENERATE',
      {
        requestid: 'primus-1',
        status: 'FAILED',
        detail: { code: '00014', desc: 'Timed out' },
      }
    );

    assert.equal(rawData.detail.stepProgress, undefined);
  });

  it('clears the context', async () => {
    await initAttestationReportContext({ requestid: 'primus-1' });
    await clearAttestationReportContext();
    assert.equal(values[ATTESTATION_REPORT_CONTEXT_KEY], undefined);
  });

  it('continues context updates after a storage failure', async () => {
    await initAttestationReportContext({ requestid: 'primus-1' });
    failNextSet = true;
    await recordAttestationAlgorithmResponse(
      'getAttestation',
      '{"retcode":"1"}',
      'primus-1'
    );
    await recordAttestationAlgorithmResponse(
      'getAttestation',
      '{"retcode":"0"}',
      'primus-1'
    );

    assert.equal(
      values[ATTESTATION_REPORT_CONTEXT_KEY].getAttestationResCount,
      1
    );
  });

  it('does not record late or unidentified responses in a newer context', async () => {
    await initAttestationReportContext({ requestid: 'primus-2' });
    await recordAttestationAlgorithmResponse(
      'getAttestationResult',
      '{"status":"streaming","content":"from-primus-1"}',
      'primus-1'
    );
    await recordAttestationAlgorithmResponse(
      'getAttestationResult',
      '{"status":"streaming","content":"without-request-id"}'
    );

    assert.equal(
      values[ATTESTATION_REPORT_CONTEXT_KEY].getAttestationResultResCount,
      0
    );
    assert.equal(
      values[ATTESTATION_REPORT_CONTEXT_KEY].getAttestationResultRes,
      undefined
    );

    await recordAttestationAlgorithmResponse(
      'getAttestationResult',
      '{"status":"streaming","content":"from-primus-2"}',
      'primus-2'
    );

    assert.equal(
      values[ATTESTATION_REPORT_CONTEXT_KEY].getAttestationResultResCount,
      1
    );
    assert.equal(
      values[ATTESTATION_REPORT_CONTEXT_KEY].getAttestationResultRes,
      '{"status":"streaming","content":"from-primus-2"}'
    );
  });

  it('does not clear a newer attestation context', async () => {
    await initAttestationReportContext({ requestid: 'primus-1' });
    await initAttestationReportContext({ requestid: 'primus-2' });
    const rawData = await enrichAttestationReportRawData(
      'ATTESTATION_GENERATE',
      {
        requestid: 'primus-1',
        status: 'FAILED',
      }
    );
    await clearAttestationReportContext('primus-1');

    assert.equal(rawData.requestid, 'primus-1');
    assert.equal(rawData.ext, undefined);
    assert.equal(
      values[ATTESTATION_REPORT_CONTEXT_KEY].requestid,
      'primus-2'
    );
  });

  it('does not enrich or clear an event without its original request ID', async () => {
    await initAttestationReportContext({ requestid: 'primus-1' });
    const rawData = await enrichAttestationReportRawData(
      'ATTESTATION_GENERATE',
      {
        status: 'FAILED',
      }
    );

    assert.equal(rawData.requestid, undefined);
    assert.equal(rawData.ext, undefined);
    assert.equal(
      values[ATTESTATION_REPORT_CONTEXT_KEY].requestid,
      'primus-1'
    );
  });
});
