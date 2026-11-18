// Keep in sync with KaitoPulseExtension primus-adapter.ts polling timeout.
export const DEFAULT_ATTEST_TIMEOUT_MS = 10 * 60 * 1000;
export const PRIMUS_RESPONSE_TIMEOUT_MS = 6 * 60 * 1000;
export const VERIFYING_DIALOG_GRACE_MS = 45 * 1000;

export const computeEffectiveAttestationTimeoutMs = (attRequest) => {
  if (attRequest && typeof attRequest.timeout === 'number') {
    return Math.min(attRequest.timeout, PRIMUS_RESPONSE_TIMEOUT_MS);
  }
  return DEFAULT_ATTEST_TIMEOUT_MS;
};

export const computeVerifyingDialogTimeoutMs = (attRequest) =>
  computeEffectiveAttestationTimeoutMs(attRequest) + VERIFYING_DIALOG_GRACE_MS;