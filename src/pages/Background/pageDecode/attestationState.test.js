import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PAGE_DECODE_PHASE,
  createSerialQueue,
  createSingleFlight,
  hasCompleteCaptureCheckpoint,
  pageDecodeSessionBelongsToRequest,
  algorithmResultAlreadyReported,
  checkpointWriteBelongsToSession,
  isDuplicatePageDecodeInit,
  mergeCapturedTargetCount,
  resolveInitCaptureCheckpoint,
  shouldRecoverUnreported00013,
  shouldReplacePageDecodeSession,
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

  it('only lets the request that still owns the session clean up listeners', () => {
    assert.equal(
      pageDecodeSessionBelongsToRequest({
        requestid: 'request-1',
        sessionRequestid: 'request-1',
        activeTemplateRequestid: 'request-1',
      }),
      true
    );
    assert.equal(
      pageDecodeSessionBelongsToRequest({
        requestid: 'request-1',
        sessionRequestid: 'request-2',
        activeTemplateRequestid: 'request-2',
      }),
      false
    );
    assert.equal(
      pageDecodeSessionBelongsToRequest({
        requestid: 'request-1',
        sessionRequestid: 'request-1',
        activeTemplateRequestid: 'request-2',
      }),
      false
    );
  });

  it('rejects a stale init and still allows a newer request to replace', () => {
    const liveSession = {
      requestid: 'request-b',
      phase: PAGE_DECODE_PHASE.CAPTURING,
      createdAt: 200,
      updatedAt: 300,
    };
    assert.equal(
      shouldReplacePageDecodeSession({
        currentSession: liveSession,
        requestid: 'request-a',
        startedAt: 100,
      }),
      false
    );
    assert.equal(
      shouldReplacePageDecodeSession({
        currentSession: liveSession,
        requestid: 'request-c',
        startedAt: 200,
      }),
      true
    );
    assert.equal(
      shouldReplacePageDecodeSession({
        currentSession: liveSession,
        requestid: 'request-b',
        startedAt: 50,
      }),
      true
    );
    assert.equal(
      shouldReplacePageDecodeSession({
        currentSession: liveSession,
        requestid: 'request-d',
      }),
      false,
      'absent startedAt rejects replace to prevent clobber'
    );
    assert.equal(
      shouldReplacePageDecodeSession({
        currentSession: {
          requestid: 'request-b',
          phase: PAGE_DECODE_PHASE.ATTESTING,
          createdAt: 200,
          updatedAt: 300,
        },
        requestid: 'request-b',
        startedAt: 50,
      }),
      false,
      'same requestid in non-capturing phase rejects duplicate init'
    );
  });

  it('keeps a same-request capture checkpoint across a respawn re-init', () => {
    const completed = {
      requestid: 'request-a',
      observed: true,
      revision: 5,
      matchedTargetCount: 2,
      targetCount: 2,
    };
    const afterReinit = resolveInitCaptureCheckpoint(completed, 'request-a', 2);
    assert.deepEqual(afterReinit, completed);
    assert.equal(hasCompleteCaptureCheckpoint(afterReinit, 'request-a'), true);

    assert.equal(
      mergeCapturedTargetCount(afterReinit, 'request-a', 1),
      2,
      'a recapture after respawn must not lower the persisted count'
    );
    assert.equal(mergeCapturedTargetCount(afterReinit, 'request-a', 2), 2);

    const fresh = resolveInitCaptureCheckpoint(completed, 'request-b', 3);
    assert.equal(fresh.requestid, 'request-b');
    assert.equal(fresh.observed, false);
    assert.equal(fresh.matchedTargetCount, 0);
    assert.equal(fresh.targetCount, 3);
    assert.equal(mergeCapturedTargetCount(fresh, 'request-b', 1), 1);
    assert.equal(mergeCapturedTargetCount(completed, 'request-b', 1), 1);
    assert.equal(
      resolveInitCaptureCheckpoint(undefined, 'request-a', 2).matchedTargetCount,
      0
    );
  });

  it('treats a same-id re-init of a live session as a no-op', () => {
    const capturing = {
      requestid: 'request-a',
      phase: PAGE_DECODE_PHASE.CAPTURING,
    };
    assert.equal(
      isDuplicatePageDecodeInit({
        currentSession: capturing,
        requestid: 'request-a',
        acceptedInitRequestid: 'request-a',
      }),
      true
    );
    assert.equal(
      isDuplicatePageDecodeInit({
        currentSession: capturing,
        requestid: 'request-a',
        acceptedInitRequestid: null,
      }),
      false,
      'worker restart must be able to rebuild in-memory state'
    );
    assert.equal(
      isDuplicatePageDecodeInit({
        currentSession: capturing,
        requestid: 'request-b',
        acceptedInitRequestid: 'request-a',
      }),
      false
    );
    assert.equal(
      isDuplicatePageDecodeInit({
        currentSession: {
          requestid: 'request-a',
          phase: PAGE_DECODE_PHASE.TERMINAL,
        },
        requestid: 'request-a',
        acceptedInitRequestid: 'request-a',
      }),
      false
    );
  });

  it('does not let a synthesized terminal session block a new init', () => {
    const synthesized = transitionPageDecodeSession(null, {
      requestid: 'request-a',
      phase: PAGE_DECODE_PHASE.TERMINAL,
      terminalResult: { result: 'warn', requestid: 'request-a' },
      replace: true,
      createdAt: 0,
      now: 2000,
    }).session;
    assert.equal(synthesized.createdAt, 0);
    assert.equal(synthesized.updatedAt, 2000);
    assert.equal(
      shouldReplacePageDecodeSession({
        currentSession: synthesized,
        requestid: 'request-b',
        startedAt: 1500,
      }),
      true
    );
    const initialized = transitionPageDecodeSession(null, {
      requestid: 'request-c',
      phase: PAGE_DECODE_PHASE.CAPTURING,
      replace: true,
      now: 1000,
    }).session;
    assert.equal(initialized.createdAt, 1000);
  });

  it('falls back to updatedAt for sessions without createdAt', () => {
    const legacySession = {
      requestid: 'request-b',
      phase: PAGE_DECODE_PHASE.CAPTURING,
      updatedAt: 200,
    };
    assert.equal(
      shouldReplacePageDecodeSession({
        currentSession: legacySession,
        requestid: 'request-c',
        startedAt: 200,
      }),
      true,
      'uses updatedAt when createdAt is absent'
    );
    assert.equal(
      shouldReplacePageDecodeSession({
        currentSession: legacySession,
        requestid: 'request-c',
        startedAt: 100,
      }),
      false,
    );
  });

  it('recovers only an unreported 00013 and treats terminal algorithm codes as reported', () => {
    const terminalResult = {
      requestid: 'request-1',
      failReason: { code: '00013' },
    };
    assert.equal(
      shouldRecoverUnreported00013({
        requestid: 'request-1',
        terminalResult,
        outboxHasReport: false,
      }),
      true
    );
    assert.equal(
      shouldRecoverUnreported00013({
        requestid: 'request-1',
        terminalResult,
        outboxHasReport: true,
      }),
      false
    );
    assert.equal(algorithmResultAlreadyReported('{"retcode":"0"}'), true);
    assert.equal(algorithmResultAlreadyReported('{"retcode":"2"}'), true);
    assert.equal(algorithmResultAlreadyReported('{"retcode":"1"}'), false);
    assert.equal(algorithmResultAlreadyReported('not-json'), false);
    assert.equal(algorithmResultAlreadyReported(null), false);
    assert.equal(
      checkpointWriteBelongsToSession(
        { requestid: 'request-b' },
        'request-a'
      ),
      false
    );
    assert.equal(
      checkpointWriteBelongsToSession(
        { requestid: 'request-a' },
        'request-a'
      ),
      true
    );
    assert.equal(checkpointWriteBelongsToSession(null, 'request-a'), true);
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
