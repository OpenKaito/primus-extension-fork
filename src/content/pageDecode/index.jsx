import React, { useCallback, useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import RightEl from './RightEl';
import FooterEl from './FooterEl';
import HeaderEl from './HeaderEl';
import FriendlyTip from './FriendlyTip';
import { injectFont, createDomElement, eventReport } from './utils';
import { logicForMonad } from './logicForSdk';
const ATTESTATIONPOLLINGTIMEOUT = 2 * 60 * 1000;
const PAGE_DECODE_SESSION_KEY = 'pageDecodeAttestationSession';
const AUTHORITY_MESSAGE_RETRY_DELAYS = [0, 250, 750];

const wait = (delayMs) =>
  new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });

const sendPageDecodeMessage = async (message, attempts = 1) => {
  const retryDelays = AUTHORITY_MESSAGE_RETRY_DELAYS.slice(0, attempts);
  for (const delayMs of retryDelays) {
    if (delayMs > 0) {
      await wait(delayMs);
    }
    let response = null;
    try {
      response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(message, (value) => {
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          resolve(value || null);
        });
      });
    } catch (error) {
      response = null;
    }
    if (response) {
      return response;
    }
  }
  return null;
};

import './index.scss';
console.log(
  '222padoAttestRequestStatus',
  sessionStorage.getItem('padoAttestRequestStatus')
);
let activeRequest;
let operationType;
let PADOSERVERURL;
let padoExtensionVersion;
let activeRequestid;
function removeStorageValuesFn() {
  sessionStorage.removeItem('padoAttestRequestStatus');
  sessionStorage.removeItem('padoAttestRequestReady');
  activeRequest = null;
  operationType = null;
}

function PadoCard() {
  const [UIStep, setUIStep] = useState('loading');
  const [status, setStatus] = useState('uninitialized');
  const statusRef = useRef(status);
  const backgroundHasStartedRef = useRef(false);
  const [isReadyFetch, setIsReadyFetch] = useState(false);
  const [resultStatus, setResultStatus] = useState('');
  const [errorTxt, setErrorTxt] = useState();

  var iconPado = chrome.runtime.getURL(`iconPado.svg`);

  const handleConfirm = useCallback(async () => {
    var eventInfo = {
      eventType: 'ATTESTATION_START',
      rawData: {
        source: activeRequest.dataSourceId,
        event: activeRequest.event,
        order: '2',
        requestid: activeRequestid,
      },
    };
    const { padoZKAttestationJSSDKBeginAttest } =
      await chrome.storage.local.get(['padoZKAttestationJSSDKBeginAttest']);
    if (padoZKAttestationJSSDKBeginAttest) {
      eventInfo.rawData.origin = 'padoAttestationJSSDK';
    }
    eventReport(eventInfo, PADOSERVERURL, padoExtensionVersion);

    var msgObj = {
      type: 'pageDecode',
      name: 'start',
      params: {
        requestid: activeRequestid,
      },
    };
    await chrome.runtime.sendMessage(msgObj);
  }, []);

  const applyTerminalResult = useCallback(({ result, failReason }) => {
    setStatus('result');
    sessionStorage.setItem('padoAttestRequestStatus', 'result');
    if (failReason) {
      sessionStorage.setItem(
        'padoAttestRequestErrorTxt',
        JSON.stringify(failReason)
      );
    }
    if (result === 'success') {
      sessionStorage.setItem('padoAttestRequestResultStatus', 'success');
    }
    setResultStatus(result);
    setErrorTxt(failReason);
  }, []);

  const getAuthoritativeStatus = useCallback(
    (attempts = 1) =>
      sendPageDecodeMessage(
        {
          type: 'pageDecode',
          name: 'getWebRequestReadyStatus',
          params: {
            requestid: activeRequestid,
          },
        },
        attempts
      ),
    []
  );

  const reportInterceptionFailure = useCallback(
    (attempts = 1) =>
      sendPageDecodeMessage(
        {
          type: 'pageDecode',
          name: 'interceptionFail',
          params: {
            requestid: activeRequestid,
          },
        },
        attempts
      ),
    []
  );

  const reportVerificationTimeout = useCallback(
    (attempts = 1) =>
      sendPageDecodeMessage(
        {
          type: 'pageDecode',
          name: 'dataSourcePageDialogTimeout',
          params: {
            requestid: activeRequestid,
          },
        },
        attempts
      ),
    []
  );

  const applyAuthoritativeStatus = useCallback(
    (response) => {
      if (
        response?.isCurrentRequest === false ||
        (response?.requestid &&
          activeRequestid &&
          response.requestid !== activeRequestid)
      ) {
        return true;
      }
      if (response?.terminalResult) {
        applyTerminalResult(response.terminalResult);
        return true;
      }
      if (response?.hasStarted || response?.isReady) {
        backgroundHasStartedRef.current = !!response.hasStarted;
        setIsReadyFetch(true);
        sessionStorage.setItem('padoAttestRequestReady', '1');
        const lastStatus = sessionStorage.getItem('padoAttestRequestStatus');
        if (lastStatus !== 'result') {
          setStatus('verifying');
          sessionStorage.setItem('padoAttestRequestStatus', 'verifying');
          if (lastStatus !== 'verifying' && !response.hasStarted) {
            handleConfirm();
          }
        }
        return true;
      }
      return false;
    },
    [applyTerminalResult, handleConfirm]
  );

  useEffect(() => {
    const lastStatus = sessionStorage.getItem('padoAttestRequestStatus');
    const lastResultStatus = sessionStorage.getItem(
      'padoAttestRequestResultStatus'
    );
    const lastErrorTxt = sessionStorage.getItem('padoAttestRequestErrorTxt');
    const lastIsReadyFetch = sessionStorage.getItem('padoAttestRequestReady');
    const lastPrimusUIStep = sessionStorage.getItem('primusUIStep');

    if (lastStatus) {
      setStatus(lastStatus);
      if (lastResultStatus === 'success') {
        setResultStatus('success');
      }
      if (lastErrorTxt && lastErrorTxt !== 'undefined') {
        console.log('lastErrorTxt', lastErrorTxt);
        setErrorTxt(JSON.parse(lastErrorTxt));
      }
    } else {
      setStatus('uninitialized');
    }
    if (lastIsReadyFetch) {
      setIsReadyFetch(!!lastIsReadyFetch);
    }
    if (lastPrimusUIStep) {
      setUIStep(lastPrimusUIStep);
    }
  }, []);
  useEffect(() => {
    const listenerFn = (request, sender, sendResponse) => {
      const { name, params = {} } = request;
      const { result, failReason, requestid, step } = params;
      if (requestid && requestid !== activeRequestid) {
        return;
      }
      if (name === 'setUIStep') {
        console.log('content receive:setUIStep');
        setUIStep(step);
        sessionStorage.setItem('primusUIStep', step);
      }
      if (name === 'webRequestIsReady') {
        console.log('content receive:webRequestIsReady');
        getAuthoritativeStatus().then(applyAuthoritativeStatus);
      }
      if (name === 'end') {
        console.log('content receive:end', request, failReason);
        applyTerminalResult({ result, failReason });
      }
    };
    chrome.runtime.onMessage.addListener(listenerFn);
    getAuthoritativeStatus().then(applyAuthoritativeStatus);
    return () => {
      chrome.runtime.onMessage.removeListener(listenerFn);
    };
  }, [applyAuthoritativeStatus, applyTerminalResult, getAuthoritativeStatus]);
  useEffect(() => {
    const storageListener = (changes, areaName) => {
      if (areaName !== 'local' || !changes[PAGE_DECODE_SESSION_KEY]) {
        return;
      }
      const session = changes[PAGE_DECODE_SESSION_KEY].newValue;
      if (!session) {
        return;
      }
      applyAuthoritativeStatus({
        requestid: session.requestid,
        phase: session.phase,
        terminalResult: session.terminalResult,
        isReady: ['ready', 'attesting'].includes(session.phase),
        hasStarted: session.phase === 'attesting',
      });
    };
    chrome.storage.onChanged.addListener(storageListener);
    return () => {
      chrome.storage.onChanged.removeListener(storageListener);
    };
  }, [applyAuthoritativeStatus]);

  const handleBack = useCallback(async () => {
    console.log('handleBack-tabId', activeRequest?.tabId);
    var msgObj = {
      type: 'pageDecode',
      name: 'close',
      params: {
        tabId: activeRequest?.tabId,
        extensionVersion: '0.3.27',
        requestid: activeRequestid,
      },
    };
    await chrome.runtime.sendMessage(msgObj);
    // removeStorageValuesFn();
  }, [activeRequest?.tabId]);
  useEffect(() => {
    if (isReadyFetch) {
      const lastStatus = sessionStorage.getItem('padoAttestRequestStatus');
      if (!['result'].includes(lastStatus)) {
        setStatus('verifying');
        sessionStorage.setItem('padoAttestRequestStatus', 'verifying');
        if (lastStatus !== 'verifying' && !backgroundHasStartedRef.current) {
          handleConfirm();
        }
      }
    }
  }, [handleConfirm, isReadyFetch]);

  useEffect(() => {
    const { PRE_ATTEST_PROMOT_V2 } = activeRequest;
    const uninitializedShowTime = PRE_ATTEST_PROMOT_V2?.[0]?.showTime;
    let timer = setTimeout(() => {
      const lastStatus = sessionStorage.getItem('padoAttestRequestStatus');
      if (!['verifying', 'result'].includes(lastStatus)) {
        setStatus('initialized');
        sessionStorage.setItem('padoAttestRequestStatus', 'initialized');
      }
    }, uninitializedShowTime); // uninitializedShowTime

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, []);
  useEffect(() => {
    const { PRE_ATTEST_PROMOT_V2 } = activeRequest;
    const initializedShowTime = PRE_ATTEST_PROMOT_V2?.[1]?.showTime;
    let timer2;
    let cancelled = false;
    if (status === 'initialized') {
      timer2 = setTimeout(async () => {
        let lastStatus2 = sessionStorage.getItem('padoAttestRequestStatus');
        console.log('timer2', lastStatus2, statusRef.current);
        if (
          ['verifying', 'result'].includes(statusRef.current) ||
          ['verifying', 'result'].includes(lastStatus2)
        ) {
          return;
        }

        const authoritativeStatus = await getAuthoritativeStatus(3);
        if (cancelled) {
          return;
        }
        if (applyAuthoritativeStatus(authoritativeStatus)) {
          return;
        }

        lastStatus2 = sessionStorage.getItem('padoAttestRequestStatus');
        if (
          ['verifying', 'result'].includes(statusRef.current) ||
          ['verifying', 'result'].includes(lastStatus2)
        ) {
          return;
        }

        const interceptionFailureResponse = await reportInterceptionFailure(3);
        if (cancelled) {
          return;
        }
        if (interceptionFailureResponse?.accepted === false) {
          applyAuthoritativeStatus(interceptionFailureResponse);
          return;
        }
        if (interceptionFailureResponse?.accepted === true) {
          applyAuthoritativeStatus(interceptionFailureResponse);
          return;
        }
        if (interceptionFailureResponse?.accepted !== true) {
          const finalAuthoritativeStatus = await getAuthoritativeStatus(3);
          if (cancelled) {
            return;
          }
          if (applyAuthoritativeStatus(finalAuthoritativeStatus)) {
            return;
          }
        }
      }, initializedShowTime); // initializedShowTime
    }
    let timer3;

    if (status === 'verifying') {
      const verifyingTimeoutMs =
        activeRequest?.verifyingDialogTimeoutMs ?? ATTESTATIONPOLLINGTIMEOUT;
      timer3 = setTimeout(async () => {
        const authoritativeStatus = await getAuthoritativeStatus(3);
        if (cancelled) {
          return;
        }
        if (
          authoritativeStatus?.isCurrentRequest === false ||
          (authoritativeStatus?.requestid &&
            authoritativeStatus.requestid !== activeRequestid)
        ) {
          return;
        }
        if (authoritativeStatus?.terminalResult) {
          applyTerminalResult(authoritativeStatus.terminalResult);
          return;
        }
        const timeoutResponse = await reportVerificationTimeout(3);
        if (cancelled) {
          return;
        }
        if (timeoutResponse?.terminalResult) {
          applyTerminalResult(timeoutResponse.terminalResult);
          return;
        }
        const lastStatus3 = sessionStorage.getItem('padoAttestRequestStatus');
        console.log('timer3', lastStatus3, statusRef.current);
        if (timer2) {
          clearTimeout(timer2);
        }
      }, verifyingTimeoutMs);
    }

    return () => {
      cancelled = true;
      if (timer2) {
        clearTimeout(timer2);
      }
      if (timer3) {
        clearTimeout(timer3);
      }
    };
  }, [
    applyAuthoritativeStatus,
    applyTerminalResult,
    getAuthoritativeStatus,
    reportInterceptionFailure,
    reportVerificationTimeout,
    status,
  ]);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  return (
    <>
      {(activeRequest.dataSourceId === 'chatgpt' && isReadyFetch) ||
      activeRequest.dataSourceId !== 'chatgpt' ? (
        <div className={`pado-extension-card  ${status}`}>
          <div className="pado-extension-left">
            <HeaderEl />
            <FooterEl
              status={status}
              resultStatus={resultStatus}
              errorTxt={errorTxt}
              activeRequest={activeRequest}
            />
          </div>
          <RightEl status={status} onBack={handleBack} />
        </div>
      ) : (
        <div className="padoWrapper">
          {['toLogin', 'toMessage', 'toVerify'].includes(UIStep) && (
            <FriendlyTip tipKey={UIStep}></FriendlyTip>
          )}
          {!isReadyFetch && (
            <div className="loadingStep">
              <img src={iconPado} className="iconPado" />
              <div className="loading-spinner loader"></div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

var padoStr = `<div id="pado-extension-content"></div>`;
var injectEl = createDomElement(padoStr);
document.body.appendChild(injectEl);
console.log(
  'content_scripts-content-decode inject',
  new Date().toLocaleString()
);
chrome.runtime.sendMessage(
  {
    type: 'pageDecode',
    name: 'initCompleted', // diff
  },
  (response, a, b) => {
    if (response.name === 'append') {
      console.log('content_scripts-content-decode receive:append');
      // hide in login page
      var disabledPathList = ['login', 'register', 'signin', 'signup'];
      var isDisabled = disabledPathList.some(
        (i) => window.location.href.toLowerCase().indexOf(i) > -1
      );
      if (isDisabled) {
        return;
      }
      if (response.isReady) {
        sessionStorage.setItem('padoAttestRequestReady', '1');
      }
      // avoid re-render
      if (activeRequest) {
        return;
      }

      // render
      activeRequest = { ...response.params };
      console.log('activeRequest', activeRequest);
      // TODO - templateId
      if (
        activeRequest.attTemplateID === 'be2268c1-56b2-438a-80cb-eddf2e850b63'
      ) {
        logicForMonad();
      }
      delete activeRequest.PADOSERVERURL;
      delete activeRequest.padoExtensionVersion;
      PADOSERVERURL = response.params.PADOSERVERURL;
      padoExtensionVersion = response.params.padoExtensionVersion;
      activeRequestid = response.params.requestid;
      operationType = response.operation;
      const container = document.getElementById('pado-extension-content');
      const root = createRoot(container);
      root.render(<PadoCard />);
    }
  }
);

injectFont();
