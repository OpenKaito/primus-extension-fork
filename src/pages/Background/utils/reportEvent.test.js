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
      source: 'binance',
      schemaType: 'ASSETS',
      sigFormat: 'EVM',
      event: 'assets-proof',
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
    assert.equal(values[ATTESTATION_REPORT_CONTEXT_KEY].source, 'binance');
    assert.equal(values[ATTESTATION_REPORT_CONTEXT_KEY].schemaType, 'ASSETS');
    assert.deepEqual(rawData.detail.attConditions, [[{ op: '>', value: 500 }]]);
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
  });

  it('keeps same-request progress across a respawn re-init', async () => {
    await initAttestationReportContext({
      requestid: 'primus-1',
      targetCount: 2,
    });
    await updateAttestationStepProgress('captured', { completed: 2, total: 2 });
    await updateAttestationStepProgress('replayed', { completed: 2, total: 2 });
    await updateAttestationStepProgress('validated', {
      completed: 1,
      total: 2,
    });
    await recordAttestationAlgorithmResponse(
      'getAttestation',
      '{"retcode":"1"}',
      'primus-1'
    );

    await initAttestationReportContext({
      requestid: 'primus-1',
      targetCount: 2,
    });
    const context = values[ATTESTATION_REPORT_CONTEXT_KEY];
    assert.equal(context.stepProgress.captured.completed, 2);
    assert.equal(context.stepProgress.replayed.completed, 2);
    assert.equal(context.stepProgress.validated.completed, 1);
    assert.deepEqual(context.steps, ['captured', 'replayed']);
    assert.equal(context.getAttestationResCount, 0);
    assert.equal(context.getAttestationRes, undefined);

    await updateAttestationStepProgress('captured', { completed: 0, total: 2 });
    await updateAttestationStepProgress('replayed', { completed: 1, total: 2 });
    await updateAttestationStepProgress('validated', {
      completed: 2,
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
    assert.equal(rawData.detail.stepProgress.captured.completed, 2);
    assert.equal(rawData.detail.stepProgress.captured.status, 'success');
    assert.equal(rawData.detail.stepProgress.replayed.completed, 2);
    assert.equal(rawData.detail.stepProgress.validated.completed, 2);
    assert.deepEqual(rawData.detail.steps, [
      'captured',
      'replayed',
      'validated',
    ]);
  });

  it('keeps a replay floor as a completed and skipped pair', async () => {
    await initAttestationReportContext({
      requestid: 'primus-1',
      targetCount: 2,
    });
    await updateAttestationStepProgress('replayed', {
      completed: 1,
      skipped: 1,
      total: 2,
    });
    await initAttestationReportContext({
      requestid: 'primus-1',
      targetCount: 2,
    });
    await updateAttestationStepProgress('replayed', {
      completed: 1,
      skipped: 0,
      total: 2,
    });

    const replayed =
      values[ATTESTATION_REPORT_CONTEXT_KEY].stepProgress.replayed;
    assert.equal(replayed.completed, 1);
    assert.equal(replayed.skipped, 1);
    assert.equal(replayed.status, 'skipped');
  });

  it('still lets in-process progress go down without a resume', async () => {
    await initAttestationReportContext({
      requestid: 'primus-1',
      targetCount: 2,
    });
    await updateAttestationStepProgress('captured', { completed: 1, total: 2 });
    await updateAttestationStepProgress('captured', { completed: 0, total: 2 });

    assert.equal(
      values[ATTESTATION_REPORT_CONTEXT_KEY].stepProgress.captured.completed,
      0
    );
  });

  it('starts a different request from zero progress', async () => {
    await initAttestationReportContext({
      requestid: 'primus-1',
      targetCount: 2,
    });
    await updateAttestationStepProgress('captured', { completed: 2, total: 2 });
    await initAttestationReportContext({
      requestid: 'primus-2',
      targetCount: 3,
    });
    await updateAttestationStepProgress('captured', { completed: 0, total: 3 });

    const context = values[ATTESTATION_REPORT_CONTEXT_KEY];
    assert.equal(context.requestid, 'primus-2');
    assert.equal(context.stepProgressFloor, undefined);
    assert.deepEqual(context.steps, []);
    assert.equal(context.stepProgress.captured.completed, 0);
    assert.equal(context.stepProgress.captured.total, 3);
  });

  it('ignores late progress from a different request', async () => {
    await initAttestationReportContext({
      requestid: 'primus-2',
      targetCount: 2,
    });
    await updateAttestationStepProgress(
      'captured',
      { completed: 2, total: 2 },
      'primus-1'
    );
    assert.equal(
      values[ATTESTATION_REPORT_CONTEXT_KEY].stepProgress.captured.completed,
      0
    );

    await updateAttestationStepProgress(
      'captured',
      { completed: 1, total: 2 },
      'primus-2'
    );
    assert.equal(
      values[ATTESTATION_REPORT_CONTEXT_KEY].stepProgress.captured.completed,
      1
    );
  });

  it('writes progress without a request ID check when none is given', async () => {
    await initAttestationReportContext({ targetCount: 2 });
    await updateAttestationStepProgress(
      'captured',
      { completed: 1, total: 2 },
      undefined
    );
    await updateAttestationStepProgress('replayed', { completed: 1, total: 2 });

    const context = values[ATTESTATION_REPORT_CONTEXT_KEY];
    assert.equal(context.stepProgress.captured.completed, 1);
    assert.equal(context.stepProgress.replayed.completed, 1);
  });

  it('does not resume progress for an init without a request ID', async () => {
    await initAttestationReportContext({ targetCount: 2 });
    await updateAttestationStepProgress('captured', { completed: 2, total: 2 });
    await initAttestationReportContext({ targetCount: 2 });

    const context = values[ATTESTATION_REPORT_CONTEXT_KEY];
    assert.equal(context.stepProgressFloor, undefined);
    assert.equal(context.stepProgress.captured.completed, 0);
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
    assert.equal(values[ATTESTATION_REPORT_CONTEXT_KEY].requestid, 'primus-2');
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
    assert.equal(values[ATTESTATION_REPORT_CONTEXT_KEY].requestid, 'primus-1');
  });
});
