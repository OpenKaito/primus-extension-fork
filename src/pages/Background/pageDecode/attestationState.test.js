import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PAGE_DECODE_PHASE,
  createSerialQueue,
  createSingleFlight,
  hasCompleteCaptureCheckpoint,
  resolvePageDecodeAttestationState,
  transitionPageDecodeSession,
} from './attestationState.js';

const activeRequest = (requestid) =>
  JSON.stringify({
    requestid,
    isUserClick: 'true',
  });

describe('pageDecode authoritative attestation state', () => {
  it('distinguishes complete capture checkpoints from partial or stale ones', () => {
    assert.equal(
      hasCompleteCaptureCheckpoint(
        {
          requestid: 'request-1',
          observed: true,
          matchedTargetCount: 2,
          targetCount: 2,
        },
        'request-1'
      ),
      true
    );
    assert.equal(
      hasCompleteCaptureCheckpoint(
        {
          requestid: 'request-1',
          observed: true,
          matchedTargetCount: 1,
          targetCount: 2,
        },
        'request-1'
      ),
      false
    );
    assert.equal(
      hasCompleteCaptureCheckpoint(
        {
          requestid: 'old-request',
          observed: true,
          matchedTargetCount: 2,
          targetCount: 2,
        },
        'request-1'
      ),
      false
    );
  });

  it('advances monotonically from capture through terminal', () => {
    let session = transitionPageDecodeSession(null, {
      requestid: 'request-1',
      phase: PAGE_DECODE_PHASE.CAPTURING,
      replace: true,
    }).session;

    for (const phase of [
      PAGE_DECODE_PHASE.READY,
      PAGE_DECODE_PHASE.ATTESTING,
      PAGE_DECODE_PHASE.TERMINAL,
    ]) {
      const transition = transitionPageDecodeSession(session, {
        requestid: 'request-1',
        phase,
        terminalResult:
          phase === PAGE_DECODE_PHASE.TERMINAL
            ? { result: 'success', requestid: 'request-1' }
            : undefined,
      });
      assert.equal(transition.applied, true);
      session = transition.session;
    }

    assert.equal(session.phase, PAGE_DECODE_PHASE.TERMINAL);
  });

  it('allows 00013 only while the request is capturing', () => {
    const terminalResult = {
      result: 'warn',
      failReason: { code: '00013' },
      requestid: 'request-1',
    };
    const capturing = {
      requestid: 'request-1',
      phase: PAGE_DECODE_PHASE.CAPTURING,
    };
    const committed = transitionPageDecodeSession(capturing, {
      requestid: 'request-1',
      phase: PAGE_DECODE_PHASE.TERMINAL,
      terminalResult,
      allowedFrom: [PAGE_DECODE_PHASE.CAPTURING],
    });
    const rejected = transitionPageDecodeSession(
      {
        requestid: 'request-1',
        phase: PAGE_DECODE_PHASE.READY,
      },
      {
        requestid: 'request-1',
        phase: PAGE_DECODE_PHASE.TERMINAL,
        terminalResult,
        allowedFrom: [PAGE_DECODE_PHASE.CAPTURING],
      }
    );

    assert.equal(committed.applied, true);
    assert.equal(rejected.applied, false);
  });

  it('keeps terminal absorbing when a late ready transition arrives', () => {
    const terminal = {
      requestid: 'request-1',
      phase: PAGE_DECODE_PHASE.TERMINAL,
      terminalResult: {
        result: 'warn',
        failReason: { code: '00013' },
        requestid: 'request-1',
      },
    };
    const transition = transitionPageDecodeSession(terminal, {
      requestid: 'request-1',
      phase: PAGE_DECODE_PHASE.READY,
    });

    assert.equal(transition.applied, false);
    assert.deepEqual(transition.session, terminal);
  });

  it('restores terminal result after worker memory is lost', () => {
    const terminalResult = {
      result: 'success',
      requestid: 'request-1',
    };
    const state = resolvePageDecodeAttestationState({
      requestid: 'request-1',
      pageDecodeSession: {
        requestid: 'request-1',
        phase: PAGE_DECODE_PHASE.TERMINAL,
        terminalResult,
      },
      isReady: true,
      hasStarted: true,
    });

    assert.deepEqual(state.terminalResult, terminalResult);
    assert.equal(state.phase, PAGE_DECODE_PHASE.TERMINAL);
    assert.equal(state.isReady, false);
    assert.equal(state.hasStarted, false);
  });

  it('rejects an old start after init switches requestid', () => {
    const current = {
      requestid: 'request-2',
      phase: PAGE_DECODE_PHASE.CAPTURING,
    };
    const transition = transitionPageDecodeSession(current, {
      requestid: 'request-1',
      phase: PAGE_DECODE_PHASE.ATTESTING,
    });

    assert.equal(transition.applied, false);
    assert.deepEqual(transition.session, current);
  });

  it('recovers a started request from storage after worker memory is lost', () => {
    const state = resolvePageDecodeAttestationState({
      requestid: 'request-1',
      beginAttest: '1',
      activeRequestAttestation: activeRequest('request-1'),
    });

    assert.equal(state.isCurrentRequest, true);
    assert.equal(state.hasStarted, true);
    assert.equal(state.isReady, false);
  });

  it('uses beginAttest with matching preset after active params are cleared', () => {
    const state = resolvePageDecodeAttestationState({
      requestid: 'request-1',
      beginAttest: '1',
      attestationPresetParams: JSON.stringify({
        requestid: 'request-1',
      }),
    });

    assert.equal(state.isCurrentRequest, true);
    assert.equal(state.hasStarted, true);
  });

  it('treats a matching algorithm response as proof that attestation started', () => {
    const state = resolvePageDecodeAttestationState({
      requestid: 'request-1',
      activeRequestAttestation: activeRequest('request-1'),
      attestationReportContext: {
        requestid: 'request-1',
        getAttestationResultResCount: 80,
        getAttestationResultRes: JSON.stringify({
          retcode: '1',
          isUserClick: 'true',
        }),
      },
    });

    assert.equal(state.hasStarted, true);
    assert.equal(state.hasAlgorithmResponse, true);
  });

  it('rejects stale window state for a different active request', () => {
    const state = resolvePageDecodeAttestationState({
      requestid: 'old-request',
      beginAttest: '1',
      activeRequestAttestation: activeRequest('new-request'),
    });

    assert.equal(state.requestid, 'new-request');
    assert.equal(state.isCurrentRequest, false);
    assert.equal(state.hasStarted, false);
  });

  it('does not suppress 00013 before capture readiness or algorithm start', () => {
    const state = resolvePageDecodeAttestationState({
      requestid: 'request-1',
      activeTemplateRequestid: 'request-1',
      isReady: false,
      hasStarted: false,
    });

    assert.equal(state.isCurrentRequest, true);
    assert.equal(state.isReady, false);
    assert.equal(state.hasStarted, false);
    assert.equal(state.hasAlgorithmResponse, false);
  });

  it('still allows 00013 after worker restart when only the preset exists', () => {
    const state = resolvePageDecodeAttestationState({
      requestid: 'request-1',
      attestationPresetParams: JSON.stringify({
        requestid: 'request-1',
      }),
    });

    assert.equal(state.isCurrentRequest, true);
    assert.equal(state.isReady, false);
    assert.equal(state.hasStarted, false);
  });

  it('does not use an algorithm response from another request', () => {
    const state = resolvePageDecodeAttestationState({
      requestid: 'request-2',
      activeTemplateRequestid: 'request-2',
      attestationReportContext: {
        requestid: 'request-1',
        getAttestationResultResCount: 80,
        getAttestationResultRes: JSON.stringify({
          retcode: '1',
          isUserClick: 'true',
        }),
      },
    });

    assert.equal(state.isCurrentRequest, true);
    assert.equal(state.hasStarted, false);
    assert.equal(state.hasAlgorithmResponse, false);
  });

  it('does not treat preAlgorithm response as formal attestation', () => {
    const state = resolvePageDecodeAttestationState({
      requestid: 'request-1',
      pageDecodeSession: {
        requestid: 'request-1',
        phase: PAGE_DECODE_PHASE.CAPTURING,
      },
      attestationReportContext: {
        requestid: 'request-1',
        getAttestationResultResCount: 1,
        getAttestationResultRes: JSON.stringify({
          retcode: '1',
          isUserClick: 'false',
        }),
      },
    });

    assert.equal(state.hasStarted, false);
    assert.equal(state.hasAlgorithmResponse, false);
  });

  it('does not let stale storage override a new request without start evidence', () => {
    const state = resolvePageDecodeAttestationState({
      requestid: 'new-request',
      activeTemplateRequestid: 'new-request',
      activeRequestAttestation: activeRequest('old-request'),
    });

    assert.equal(state.requestid, 'new-request');
    assert.equal(state.isCurrentRequest, true);
    assert.equal(state.hasStarted, false);
  });
});

describe('pageDecode session queue', () => {
  it('serializes lifecycle transitions', async () => {
    const queue = createSerialQueue();
    const order = [];
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });

    const first = queue.run(async () => {
      order.push('first:start');
      await gate;
      order.push('first:end');
    });
    const second = queue.run(async () => {
      order.push('second');
    });

    await Promise.resolve();
    assert.deepEqual(order, ['first:start']);
    release();
    await Promise.all([first, second]);
    assert.deepEqual(order, ['first:start', 'first:end', 'second']);
  });
});

describe('pageDecode start single flight', () => {
  it('runs concurrent starts only once and permits a later retry', async () => {
    const singleFlight = createSingleFlight();
    let calls = 0;
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const start = () =>
      singleFlight.run('request-1', async () => {
        calls += 1;
        await gate;
        return 'started';
      });

    const first = start();
    const second = start();
    assert.equal(first, second);
    assert.equal(calls, 0);

    release();
    assert.deepEqual(await Promise.all([first, second]), [
      'started',
      'started',
    ]);
    assert.equal(calls, 1);

    await start();
    assert.equal(calls, 2);
  });
});
