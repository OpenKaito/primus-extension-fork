export const ATTESTATION_REPORT_CONTEXT_KEY = 'attestationReportContext';

const TARGET_EVENT_TYPES = new Set([
  'ATTESTATION_START_PAGEDECODE',
  'ATTESTATION_START_BACKGROUND',
  'ATTESTATION_START_OFFSCREEN',
  'ATTESTATION_GENERATE',
]);
let contextUpdateQueue = Promise.resolve();

const enqueueContextOperation = (operation) => {
  contextUpdateQueue = contextUpdateQueue
    .catch(() => {})
    .then(operation)
    .catch((error) => {
      console.warn('Failed to update attestation report context:', error);
    });
  return contextUpdateQueue;
};

const defaultStepProgress = () => ({
  captured: { status: 'pending', completed: 0, total: 0 },
  replayed: { status: 'pending', completed: 0, total: 0, skipped: 0 },
  validated: { status: 'pending', completed: 0, total: 0 },
});

export const initAttestationReportContext = ({
  address,
  requestid,
  kaitoRequestId,
  templateId,
  attConditions,
  targetCount = 0,
  source,
  schemaType,
  sigFormat,
  event,
  attestOrigin,
}) =>
  enqueueContextOperation(async () => {
    const stepProgress = defaultStepProgress();
    Object.values(stepProgress).forEach((step) => {
      step.total = targetCount;
    });
    const stored = await chrome.storage.local.get([
      ATTESTATION_REPORT_CONTEXT_KEY,
    ]);
    const existing = stored[ATTESTATION_REPORT_CONTEXT_KEY];
    // A same-request re-init only happens after the worker restarted with the
    // session still capturing; its in-memory progress is gone, so keep the
    // persisted progress and use it as a floor for later writes.
    const resumedProgress =
      Boolean(requestid) &&
      existing?.requestid === requestid &&
      existing.stepProgress
        ? {
            steps: existing.steps || [],
            stepProgress: existing.stepProgress,
            stepProgressFloor: existing.stepProgress,
          }
        : {};
    await chrome.storage.local.set({
      [ATTESTATION_REPORT_CONTEXT_KEY]: {
        address,
        requestid,
        kaitoRequestId,
        templateId,
        attConditions,
        source,
        schemaType,
        sigFormat,
        event,
        attestOrigin,
        steps: [],
        stepProgress,
        getAttestationResCount: 0,
        getAttestationResultResCount: 0,
        ...resumedProgress,
      },
    });
  });

export const clearAttestationReportContext = (requestid) =>
  enqueueContextOperation(async () => {
    if (requestid !== undefined) {
      const stored = await chrome.storage.local.get([
        ATTESTATION_REPORT_CONTEXT_KEY,
      ]);
      const context = stored[ATTESTATION_REPORT_CONTEXT_KEY];
      if (!context || context.requestid !== requestid) {
        return;
      }
    }
    await chrome.storage.local.remove([ATTESTATION_REPORT_CONTEXT_KEY]);
  });

const updateAttestationReportContext = (update, expectedRequestid) =>
  enqueueContextOperation(async () => {
    const stored = await chrome.storage.local.get([
      ATTESTATION_REPORT_CONTEXT_KEY,
    ]);
    const context = stored[ATTESTATION_REPORT_CONTEXT_KEY];
    if (
      !context ||
      (expectedRequestid !== undefined &&
        context.requestid !== expectedRequestid)
    ) {
      return;
    }
    await chrome.storage.local.set({
      [ATTESTATION_REPORT_CONTEXT_KEY]: update(context),
    });
  });

export const updateAttestationStepProgress = (
  step,
  { completed, total, skipped = 0 },
  requestid
) =>
  updateAttestationReportContext((context) => {
    const current = context.stepProgress?.[step] || {};
    const floor = context.stepProgressFloor?.[step];
    const floorCompleted = Number(floor?.completed) || 0;
    const floorSkipped = Number(floor?.skipped) || 0;
    if (completed + skipped < floorCompleted + floorSkipped) {
      completed = floorCompleted;
      skipped = floorSkipped;
    }
    const nextTotal = total ?? current.total ?? 0;
    const finished = completed + skipped;
    const status =
      nextTotal > 0 && finished >= nextTotal
        ? skipped > 0
          ? 'skipped'
          : 'success'
        : completed > 0 || skipped > 0
        ? 'partial'
        : 'pending';
    const stepProgress = {
      ...defaultStepProgress(),
      ...context.stepProgress,
      [step]: {
        ...current,
        status,
        completed,
        total: nextTotal,
        ...(step === 'replayed' ? { skipped } : {}),
      },
    };
    const orderedSteps = ['captured', 'replayed', 'validated'];
    const steps = orderedSteps.filter(
      (name) => stepProgress[name]?.status === 'success'
    );
    return { ...context, steps, stepProgress };
  }, requestid || undefined);

export const recordAttestationAlgorithmResponse = (
  resMethodName,
  res,
  requestid
) => {
  const fieldMap = {
    getAttestation: ['getAttestationRes', 'getAttestationResCount'],
    getAttestationResult: [
      'getAttestationResultRes',
      'getAttestationResultResCount',
    ],
  };
  const fields = fieldMap[resMethodName];
  if (!fields || requestid === undefined || requestid === null) {
    return Promise.resolve();
  }
  const [valueField, countField] = fields;
  return updateAttestationReportContext(
    (context) => ({
      ...context,
      [valueField]: res,
      [countField]: (context[countField] || 0) + 1,
    }),
    requestid
  );
};

export const enrichAttestationReportRawData = async (eventType, rawData) => {
  if (!TARGET_EVENT_TYPES.has(eventType)) {
    return rawData;
  }
  const originalRequestid = rawData?.requestid;
  if (originalRequestid === undefined) {
    return rawData;
  }
  await contextUpdateQueue;
  const stored = await chrome.storage.local.get([
    ATTESTATION_REPORT_CONTEXT_KEY,
  ]);
  const context = stored[ATTESTATION_REPORT_CONTEXT_KEY];
  if (!context || context.requestid !== originalRequestid) {
    return rawData;
  }
  const enriched = {
    ...rawData,
    address: context.address ?? rawData.address,
    kaitoRequestId: context.kaitoRequestId ?? rawData.kaitoRequestId,
    templateId: context.templateId ?? rawData.templateId,
  };
  if (eventType !== 'ATTESTATION_GENERATE') {
    return enriched;
  }
  if (enriched.reason === 'Not met the requirements') {
    enriched.detail = {
      ...enriched.detail,
      attConditions: context.attConditions,
    };
  }
  if (enriched.detail?.code === '00013') {
    enriched.detail = {
      ...enriched.detail,
      steps: context.steps || [],
      stepProgress: context.stepProgress || defaultStepProgress(),
    };
  }
  if (enriched.status === 'FAILED') {
    enriched.ext = {
      getAttestationRes: context.getAttestationRes ?? null,
      getAttestationResultRes: context.getAttestationResultRes ?? null,
      getAttestationResCount: context.getAttestationResCount || 0,
      getAttestationResultResCount: context.getAttestationResultResCount || 0,
    };
  }
  return enriched;
};

export const addSDKParamsToReportParamsFn = async (eventInfoRawData) => {
  let newRawData = JSON.parse(JSON.stringify(eventInfoRawData));
  const { padoZKAttestationJSSDKBeginAttest } = await chrome.storage.local.get([
    'padoZKAttestationJSSDKBeginAttest',
  ]);
  if (padoZKAttestationJSSDKBeginAttest) {
    const { padoZKAttestationJSSDKAttestationPresetParams } =
      await chrome.storage.local.get([
        'padoZKAttestationJSSDKAttestationPresetParams',
      ]);
    const activeAttestationParams =
      padoZKAttestationJSSDKAttestationPresetParams
        ? JSON.parse(padoZKAttestationJSSDKAttestationPresetParams)
        : {};
    const extendedParamsObj = activeAttestationParams?.extendedParams
      ? JSON.parse(activeAttestationParams.extendedParams)
      : {};
    const { attestOrigin, attTemplateID } = activeAttestationParams;
    const { appOrigin } = extendedParamsObj;

    if (appOrigin && appOrigin.split('-')[0] === 'NETWORK') {
      newRawData.event = appOrigin.split('-')[1];
    } else {
      // TODO report
      newRawData.event = attestOrigin;
    }
    newRawData.templateId = attTemplateID;
    if (extendedParamsObj?.appOrigin) {
      newRawData.appOrigin = appOrigin;
    }
    newRawData.attestOrigin = attestOrigin;
  }

  return newRawData;
};
