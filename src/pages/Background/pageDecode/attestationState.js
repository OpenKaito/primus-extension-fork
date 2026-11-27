const parseStoredJson = (value) => {
  if (!value) {
    return null;
  }
  if (typeof value === 'object') {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
};

export const PAGE_DECODE_SESSION_KEY = 'pageDecodeAttestationSession';

export const PAGE_DECODE_PHASE = {
  CAPTURING: 'capturing',
  READY: 'ready',
  ATTESTING: 'attesting',
  TERMINAL: 'terminal',
};

export const hasCompleteCaptureCheckpoint = (checkpoint, requestid) =>
  Boolean(
    checkpoint &&
      requestid &&
      checkpoint.requestid === requestid &&
      checkpoint.observed &&
      checkpoint.targetCount > 0 &&
      checkpoint.matchedTargetCount >= checkpoint.targetCount
  );

export const pageDecodeSessionBelongsToRequest = ({
  requestid,
  sessionRequestid,
  activeTemplateRequestid,
}) =>
  Boolean(
    requestid &&
      sessionRequestid === requestid &&
      (!activeTemplateRequestid || activeTemplateRequestid === requestid)
  );

export const shouldReplacePageDecodeSession = ({
  currentSession,
  requestid,
  startedAt,
}) => {
  if (!requestid) {
    return false;
  }
  if (!currentSession) {
    return true;
  }
  if (currentSession.requestid === requestid) {
    return (
      !currentSession.phase ||
      currentSession.phase === PAGE_DECODE_PHASE.CAPTURING
    );
  }
  const issuedAt = Number(startedAt);
  if (!Number.isFinite(issuedAt)) {
    return false;
  }
  const currentCreatedAt = Number(
    currentSession.createdAt ?? currentSession.updatedAt
  );
  if (!Number.isFinite(currentCreatedAt)) {
    return true;
  }
  return issuedAt >= currentCreatedAt;
};

export const isDuplicatePageDecodeInit = ({
  currentSession,
  requestid,
  acceptedInitRequestid,
}) =>
  Boolean(
    requestid &&
      acceptedInitRequestid === requestid &&
      currentSession?.requestid === requestid &&
      currentSession.phase !== PAGE_DECODE_PHASE.TERMINAL
  );

export const shouldRecoverUnreported00013 = ({
  requestid,
  terminalResult,
  outboxHasReport,
}) =>
  Boolean(
    requestid &&
      terminalResult?.requestid === requestid &&
      terminalResult?.failReason?.code === '00013' &&
      !outboxHasReport
  );

export const checkpointWriteBelongsToSession = (session, requestid) =>
  Boolean(requestid) && (!session?.requestid || session.requestid === requestid);

export const algorithmResultAlreadyReported = (rawResult) => {
  if (!rawResult) {
    return false;
  }
  try {
    const parsed =
      typeof rawResult === 'string' ? JSON.parse(rawResult) : rawResult;
    const retcode =
      parsed?.retcode === undefined || parsed?.retcode === null
        ? ''
        : String(parsed.retcode);
    return retcode === '0' || retcode === '2';
  } catch (error) {
    return false;
  }
};

const PHASE_RANK = {
  [PAGE_DECODE_PHASE.CAPTURING]: 0,
  [PAGE_DECODE_PHASE.READY]: 1,
  [PAGE_DECODE_PHASE.ATTESTING]: 2,
  [PAGE_DECODE_PHASE.TERMINAL]: 3,
};

export const createSerialQueue = () => {
  let tail = Promise.resolve();

  return {
    run(task) {
      const result = tail.then(task, task);
      tail = result.catch(() => undefined);
      return result;
    },
  };
};

export const createSingleFlight = () => {
  const activePromises = new Map();

  return {
    run(key, task) {
      if (activePromises.has(key)) {
        return activePromises.get(key);
      }
      const promise = Promise.resolve().then(task);
      activePromises.set(key, promise);
      promise.then(
        () => {
          if (activePromises.get(key) === promise) {
            activePromises.delete(key);
          }
        },
        () => {
          if (activePromises.get(key) === promise) {
            activePromises.delete(key);
          }
        }
      );
      return promise;
    },
  };
};

export const transitionPageDecodeSession = (
  currentValue,
  {
    requestid,
    phase,
    terminalResult,
    replace = false,
    allowedFrom,
    now = Date.now(),
    createdAt,
  }
) => {
  const current = parseStoredJson(currentValue);
  if (!requestid || !Object.prototype.hasOwnProperty.call(PHASE_RANK, phase)) {
    return { applied: false, session: current };
  }
  if (replace) {
    return {
      applied: true,
      session: {
        requestid,
        phase,
        terminalResult:
          phase === PAGE_DECODE_PHASE.TERMINAL ? terminalResult || null : null,
        createdAt: createdAt ?? now,
        updatedAt: now,
      },
    };
  }
  if (!current || current.requestid !== requestid) {
    return { applied: false, session: current };
  }
  if (allowedFrom && !allowedFrom.includes(current.phase)) {
    return { applied: false, session: current };
  }
  if (current.phase === PAGE_DECODE_PHASE.TERMINAL) {
    return { applied: false, session: current };
  }
  if (PHASE_RANK[phase] < PHASE_RANK[current.phase]) {
    return { applied: false, session: current };
  }
  if (phase === current.phase && phase !== PAGE_DECODE_PHASE.TERMINAL) {
    return { applied: false, session: current };
  }

  return {
    applied: true,
    session: {
      ...current,
      phase,
      terminalResult:
        phase === PAGE_DECODE_PHASE.TERMINAL ? terminalResult || null : null,
      updatedAt: now,
    },
  };
};

export const resolvePageDecodeAttestationState = ({
  requestid,
  pageDecodeSession,
  activeTemplateRequestid,
  isReady,
  hasStarted,
  terminalResult,
  beginAttest,
  activeRequestAttestation,
  attestationPresetParams,
  attestationReportContext,
}) => {
  const storedSession = parseStoredJson(pageDecodeSession);
  const storedActiveRequest = parseStoredJson(activeRequestAttestation);
  const storedPreset = parseStoredJson(attestationPresetParams);
  const storedReportContext = parseStoredJson(attestationReportContext);
  const storedAlgorithmResponse = parseStoredJson(
    storedReportContext?.getAttestationResultRes
  );
  const storedActiveRequestid = storedActiveRequest?.requestid;
  const beginRequestid =
    storedActiveRequestid || storedPreset?.requestid || null;
  const algorithmResponseRequestid = storedReportContext?.requestid || null;
  const hasBoundAlgorithmResponse =
    Boolean(algorithmResponseRequestid) &&
    storedReportContext?.getAttestationResultResCount > 0 &&
    storedAlgorithmResponse?.isUserClick === 'true';
  const hasStoredAlgorithmEvidence =
    (Boolean(beginRequestid) && beginAttest === '1') ||
    hasBoundAlgorithmResponse;
  const currentRequestid =
    storedSession?.requestid ||
    activeTemplateRequestid ||
    storedPreset?.requestid ||
    (hasStoredAlgorithmEvidence ? storedActiveRequestid : null) ||
    storedActiveRequestid ||
    algorithmResponseRequestid ||
    terminalResult?.requestid ||
    null;
  const isConflictingRequest = Boolean(
    requestid && currentRequestid && requestid !== currentRequestid
  );
  const inMemoryRequestMatches =
    !requestid ||
    !activeTemplateRequestid ||
    requestid === activeTemplateRequestid;
  const beginRequestMatches =
    Boolean(beginRequestid) && (!requestid || requestid === beginRequestid);
  const algorithmResponseMatches =
    hasBoundAlgorithmResponse &&
    (!requestid || requestid === algorithmResponseRequestid);
  const hasPersistedStart =
    (beginRequestMatches && beginAttest === '1') || algorithmResponseMatches;
  const sessionMatches =
    Boolean(storedSession?.requestid) &&
    (!requestid || requestid === storedSession.requestid);
  const sessionIsReady =
    sessionMatches &&
    [PAGE_DECODE_PHASE.READY, PAGE_DECODE_PHASE.ATTESTING].includes(
      storedSession.phase
    );
  const sessionHasStarted =
    sessionMatches && storedSession.phase === PAGE_DECODE_PHASE.ATTESTING;
  const sessionIsTerminal =
    sessionMatches && storedSession.phase === PAGE_DECODE_PHASE.TERMINAL;
  const sessionTerminalResult = sessionIsTerminal
    ? storedSession.terminalResult
    : null;

  return {
    requestid: currentRequestid || requestid || null,
    isCurrentRequest: !isConflictingRequest,
    phase: sessionMatches ? storedSession.phase : null,
    isReady:
      !isConflictingRequest &&
      !sessionIsTerminal &&
      (sessionIsReady || (inMemoryRequestMatches && Boolean(isReady))),
    hasStarted:
      !isConflictingRequest &&
      !sessionIsTerminal &&
      (sessionHasStarted ||
        (inMemoryRequestMatches && Boolean(hasStarted)) ||
        hasPersistedStart),
    hasAlgorithmResponse: !isConflictingRequest && algorithmResponseMatches,
    terminalResult: !isConflictingRequest
      ? sessionTerminalResult ||
        ((!requestid ||
          !terminalResult?.requestid ||
          terminalResult.requestid === requestid) &&
        terminalResult
          ? terminalResult
          : null)
      : null,
  };
};
