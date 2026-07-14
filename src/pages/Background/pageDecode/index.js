import {
  assembleAlgorithmParams,
  assembleAlgorithmParamsForSDK,
} from '../exData';
import { PADOSERVERURL } from '@/config/envConstants';
import { padoExtensionVersion } from '@/config/constants';
import { eventReport } from '@/services/api/usertracker';
import customFetch from '../utils/request';
import {
  templateIdForMonad,
  eventListUrlForMonad,
  checkTargetRequestFnForMonad,
  formatRequestResponseFnForMonad,
} from '../lumaMonadEvent/index.js';
import {
  templateIdForNilion7Days,
  templateIdForNilion1Month,
  startTimeDistanceForNilion,
  rowForNilion,
} from '../nilionEvent/index.js';
import {
  templateIdForBinanceEarnHistory,
  formatRequestResponseFnForBinanceEarnHistory,
  updateRequestMapFnForbBinanceEarnHistory,
  templateIdForBinanceEarnHistoryABalance,
  formatRequestResponseFnForBinanceEarnHistoryABalance,
  templateIdForReputationPhalaBinanceEarnBalance,
  updateRequestMapFnForReputationPhalaBinanceEarnBalance,
  checkTargetRequestFnForReputationPhalaBinanceEarnBalance,
  formatRequestResponseFnForReputationPhalaBinanceEarnBalance,
  templateIdForBinanceSomeTokenBalance,
  templateIdForBinanceSomeTokenBalanceRequestUrl,
  checkTargetRequestFnForBinanceSomeTokenBalance,
  formatRequestResponseFnForBinanceSomeTokenBalance,
} from '../binanceEarnHistoryEvent/index.js';
import {
  templateIdForTwitch,
  formatJsonArrFnForTwitch,
  formatRequestResponseFnForTwitch,
} from '../twitchEvent/index.js';
import {
  lumaAccountTemplateId,
  lumaAccountTemplateReg,
  getLumaAccountTargetJumpUrl,
  getUserIdFromCookie,
} from '../scoreEvent/index.js';
import {
  templateIdForPhalaAccount,
  formatRequestResponseFnForPhalaAccount,
  formatRequestResponseFnForReputationPhalaCvmList,
  templateIdForReputaionPhalaCvmList,
  phalaCvmListRequestUrl,
  checkTargetRequestFnForReputationPhalaCvmList,
  templateIdForPhalaCvmList,
  formatRequestResponseFnForPhalaCvmList,
} from '../phala/index.js';
import {
  templateIdForOkxSomeTokenBalance,
  templateIdForOkxSomeTokenBalanceRequestUrl,
  checkTargetRequestFnForOkxSomeTokenBalance,
  formatRequestResponseFnForOkxSomeTokenBalance,
} from '../okx/index.js';
import {
  templateIdForCoinstatsSomeTokenBalance,
  checkTargetRequestFnForCoinstatsSomeTokenBalance,
  formatRequestResponseFnForCoinstatsSpotSomeTokenBalance,
} from '../coinstats/index.js';
import {
  isObject,
  parseCookie,
  isUrlWithQueryFn,
  checkIsRequiredUrl,
  getErrorMsgFn,
  sendMsgToTab,
} from '../utils/utils';
import { addSDKParamsToReportParamsFn } from '../utils/reportEvent.js';
import {
  extraRequestFn2,
  extraRequestHtmlFn,
  errorFn,
  checkResIsMatchConditionFn,
  checkResHtmlIsMatchConditionFn,
  getNMonthsBeforeTime,
} from './utils';

let PRE_ATTEST_PROMOT_V2 = [
  {
    text: ['Processing data'],
    showTime: 5000,
  },
  {
    text: ['Checking data', 'Ensure login and on target page.'],
    showTime: 30000,
  },
];
let dataSourcePageTabId;
let activeTemplate = {};
let currExtentionId;

let isReadyRequest = false;
let operationType = null;
let RequestsHasCompleted = false;
let formatAlgorithmParams = null;
let preAlgorithmStatus = '';
let preAlgorithmTimer = null;
let preAlgorithmFlag = false;
let chatgptHasLogin = false;
let listenerFn = () => {};
let onBeforeSendHeadersFn = () => {};
let onBeforeRequestFn = () => {};
let onCompletedFn = () => {};
let requestsMap = {};
let reportRequestIds = [];
let hasStartedPageDecodeAttestation = false;
let chatgptAuthorizationHeader = '';
let chatgptReadyPollTimer = null;
const CHATGPT_AUTH_HEADER_SESSION_KEY = 'kaitoChatGptAuthorizationHeader';

const sendMsgToSdk = async (msg) => {
  const { padoZKAttestationJSSDKDappTabId: dappTabId } =
    await chrome.storage.local.get(['padoZKAttestationJSSDKDappTabId']);
  if (dappTabId) {
    sendMsgToTab(dappTabId, msg);
  }
};
const sendMsgToDataSourcePage = async (msg) => {
  if (dataSourcePageTabId) {
    sendMsgToTab(dataSourcePageTabId, msg);
  }
};

const removeRequestsMap = async (url) => {
  // console.log('requestsMap-remove', url);
  // await chrome.storage.local.remove([
  //   'https://www.tiktok.com/passport/web/account/info/',
  //   'https://api.x.com/1.1/account/settings.json',
  // ]);
  delete requestsMap[url];
};
const storeRequestsMap = (url, urlInfo) => {
  const lastStoreRequestObj = requestsMap[url] || {};
  console.log('requestsMap-store', url, lastStoreRequestObj, urlInfo);
  const urlInfoHeaders = urlInfo?.headers;
  if (
    urlInfoHeaders &&
    (urlInfoHeaders?.['Content-Type']?.includes('text/plain') ||
      urlInfoHeaders?.['content-type']?.includes('text/plain')) &&
    lastStoreRequestObj.body
  ) {
    urlInfo.body = JSON.stringify(lastStoreRequestObj.body);
  }
  Object.assign(requestsMap, {
    [url]: { ...lastStoreRequestObj, ...urlInfo },
  });

  return requestsMap[url];
};
const redactRequestsMapForKaitoDebug = () =>
  Object.fromEntries(
    Object.entries(requestsMap).map(([key, value]) => {
      const headers = value?.headers || {};
      return [
        key,
        {
          url: value?.url,
          templateRequestUrl: value?.templateRequestUrl,
          method: value?.method,
          type: value?.type,
          isTarget: value?.isTarget,
          hasAuthorization: !!headers.Authorization || !!headers.authorization,
          statusCode: value?.statusCode,
        },
      ];
    })
  );
const describeKaitoDebugResponse = (value) => {
  if (value === undefined) {
    return { type: 'undefined' };
  }
  if (value === null) {
    return { type: 'null' };
  }
  if (Array.isArray(value)) {
    return { type: 'array', length: value.length };
  }
  if (typeof value === 'object') {
    return {
      type: 'object',
      keys: Object.keys(value).slice(0, 20),
      rateLimitKeys:
        value.rate_limit && typeof value.rate_limit === 'object'
          ? Object.keys(value.rate_limit).slice(0, 20)
          : undefined,
      primaryWindowKeys:
        value.rate_limit?.primary_window && typeof value.rate_limit.primary_window === 'object'
          ? Object.keys(value.rate_limit.primary_window).slice(0, 20)
          : undefined,
    };
  }
  return { type: typeof value, preview: String(value).slice(0, 200) };
};
const sanitizeAlgorithmParamsForKaitoDebug = (params) => ({
  source: params?.source,
  schemaType: params?.schemaType,
  templateId: params?.templateId,
  requestid: params?.requestid,
  requestCount: params?.requests?.length,
  requests: params?.requests?.map((request) => ({
    name: request?.name,
    url: request?.url,
    method: request?.method,
    hasHeaders: !!request?.headers,
    headerKeys: Object.keys(request?.headers || {}),
    hasAuthorization:
      !!request?.headers?.Authorization || !!request?.headers?.authorization,
    urlType: request?.urlType,
  })),
  responseCount: params?.responses?.length,
  responses: params?.responses?.map((response) => ({
    name: response?.name,
    conditions: response?.conditions
      ? {
          op: response.conditions.op,
          subconditionCount: response.conditions.subconditions?.length,
          fields: response.conditions.subconditions
            ?.map((condition) => condition?.field)
            .filter(Boolean),
        }
      : undefined,
  })),
});

const resetVarsFn = () => {
  isReadyRequest = false;
  operationType = null;
  RequestsHasCompleted = false;
  formatAlgorithmParams = null;
  preAlgorithmStatus = '';
  preAlgorithmTimer = null;
  preAlgorithmFlag = false;
  chatgptHasLogin = false;
  requestsMap = {};
  reportRequestIds = [];
  hasStartedPageDecodeAttestation = false;
  chatgptAuthorizationHeader = '';
  if (chatgptReadyPollTimer) {
    clearInterval(chatgptReadyPollTimer);
    chatgptReadyPollTimer = null;
  }
  chrome.runtime.onMessage.removeListener(listenerFn);
};
const getChatGptAuthorizationHeader = () => {
  if (chatgptAuthorizationHeader) {
    return chatgptAuthorizationHeader;
  }
  const authedRequest = Object.values(requestsMap).find((requestInfo) => {
    const headers = requestInfo?.headers || {};
    return !!headers.Authorization || !!headers.authorization;
  });
  const headers = authedRequest?.headers || {};
  return headers.Authorization || headers.authorization || '';
};
const getChatGptHeaderFallback = () => {
  if (getActiveTemplateDataSource() !== 'chatgpt') {
    return {};
  }
  const authedRequests = Object.values(requestsMap).filter((requestInfo) => {
    const headers = requestInfo?.headers || {};
    return !!headers.Authorization || !!headers.authorization;
  });
  const requestWithMostHeaders = authedRequests.sort((left, right) => {
    return Object.keys(right?.headers || {}).length - Object.keys(left?.headers || {}).length;
  })[0];
  return { ...(requestWithMostHeaders?.headers || {}) };
};
const readChatGptAuthorizationHeaderFromSession = async () => {
  if (chatgptAuthorizationHeader) {
    return chatgptAuthorizationHeader;
  }
  const storageArea = chrome.storage?.session || chrome.storage?.local;
  const sessionObj = await storageArea
    .get([CHATGPT_AUTH_HEADER_SESSION_KEY])
    .catch(() => ({}));
  const authorization = sessionObj?.[CHATGPT_AUTH_HEADER_SESSION_KEY];
  if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
    chatgptAuthorizationHeader = authorization;
    return authorization;
  }
  return '';
};
const getActiveTemplateDataSource = () =>
  String(activeTemplate?.dataSource || activeTemplate?.dataSourceId || '').toLowerCase();
const requestInfoMatchesTemplateRequest = (requestInfo, templateRequest) => {
  if (!requestInfo?.url || !templateRequest?.url) {
    return false;
  }
  if (requestInfo.templateRequestUrl === templateRequest.url) {
    return true;
  }
  const checkRes = checkIsRequiredUrl({
    requestUrl: requestInfo.url,
    requiredUrl: templateRequest.url,
    urlType: templateRequest.urlType,
    queryParams: templateRequest.queryParams,
  });
  if (checkRes) {
    return true;
  }
  if (getActiveTemplateDataSource() !== 'chatgpt') {
    return false;
  }
  return (
    (requestInfo.url.includes('/backend-api/accounts/check/') &&
      templateRequest.url.includes('/backend-api/accounts/check/')) ||
    (requestInfo.url.includes('/backend-api/subscriptions?') &&
      templateRequest.url.includes('/backend-api/subscriptions')) ||
    (requestInfo.url.includes('/backend-api/wham/usage') &&
      templateRequest.url.includes('/backend-api/wham/usage'))
  );
};
const findCapturedTargetEntry = (templateRequest) =>
  Object.entries(requestsMap).find(([, requestInfo]) => {
    return requestInfo?.isTarget === 1 && requestInfoMatchesTemplateRequest(requestInfo, templateRequest);
  });
const hydrateMissingChatGptRequestsFromTrace = async (requests) => {
  if (getActiveTemplateDataSource() !== 'chatgpt') {
    return;
  }
  const authorizationHeader =
    getChatGptAuthorizationHeader() ||
    (await readChatGptAuthorizationHeaderFromSession());
  const hydrationDebug = {
    at: Date.now(),
    authorizationPresent: !!authorizationHeader,
    requestCount: Array.isArray(requests) ? requests.length : 0,
    traceCount: 0,
    hydrated: [],
    skipped: [],
  };
  if (!authorizationHeader) {
    await chrome.storage.local.set({ kaitoChatGptHydrationDebug: hydrationDebug });
    return;
  }
  const { kaitoChatGptRequestDebug = [] } = await chrome.storage.local.get([
    'kaitoChatGptRequestDebug',
  ]);
  const trace = [...kaitoChatGptRequestDebug].reverse();
  hydrationDebug.traceCount = trace.length;
  for (const request of requests) {
    if (!request?.url || request.name === 'first') {
      continue;
    }
    const alreadyCapturedKey = Object.keys(requestsMap).find(
      (key) => requestsMap[key]?.templateRequestUrl === request.url
    );
    if (alreadyCapturedKey) {
      const headers = requestsMap[alreadyCapturedKey]?.headers || {};
      storeRequestsMap(alreadyCapturedKey, {
        headers: {
          ...headers,
          Authorization:
            headers.Authorization ||
            headers.authorization ||
            authorizationHeader,
        },
        isTarget: 1,
      });
      hydrationDebug.hydrated.push({
        templateRequestUrl: request.url,
        url: requestsMap[alreadyCapturedKey]?.url,
        mode: 'updated_existing',
      });
      continue;
    }
    const traceEntry = trace.find((entry) => {
      const requestUrl = entry?.url;
      if (typeof requestUrl !== 'string') {
        return false;
      }
      const checkRes = checkIsRequiredUrl({
        requestUrl,
        requiredUrl: request.url,
        urlType: request.urlType || 'REGX',
        queryParams: request.queryParams,
      });
      return (
        checkRes ||
        (requestUrl.includes('/backend-api/accounts/check/') &&
          request.url.includes('/backend-api/accounts/check/')) ||
        (requestUrl.includes('/backend-api/subscriptions?') &&
          request.url.includes('/backend-api/subscriptions')) ||
        (requestUrl.includes('/backend-api/wham/usage') &&
          request.url.includes('/backend-api/wham/usage'))
      );
    });
    if (!traceEntry?.url) {
      hydrationDebug.skipped.push({ url: request.url, reason: 'trace_missing' });
      continue;
    }
    const requestId = `kaito-chatgpt-hydrated-${request.name || request.url}`;
    storeRequestsMap(requestId, {
      headers: { Authorization: authorizationHeader },
      method: request.method || 'GET',
      url: traceEntry.url,
      requestId,
      templateRequestUrl: request.url,
      type: 'xmlhttprequest',
      isTarget: 1,
    });
    hydrationDebug.hydrated.push({
      templateRequestUrl: request.url,
      url: traceEntry.url,
    });
  }
  await chrome.storage.local.set({ kaitoChatGptHydrationDebug: hydrationDebug });
};
const handlerForSdk = async (processAlgorithmReq, operation) => {
  const {
    padoZKAttestationJSSDKBeginAttest,
    padoZKAttestationJSSDKDappTabId: dappTabId,
  } = await chrome.storage.local.get([
    'padoZKAttestationJSSDKBeginAttest',
    'padoZKAttestationJSSDKDappTabId',
  ]);
  const { activeRequestAttestation: lastActiveRequestAttestationStr } =
    await chrome.storage.local.get(['activeRequestAttestation']);
  if (processAlgorithmReq && lastActiveRequestAttestationStr) {
    processAlgorithmReq({
      reqMethodName: 'stop',
    });
  }
  if (padoZKAttestationJSSDKBeginAttest) {
    await chrome.storage.local.remove([
      'padoZKAttestationJSSDKBeginAttest',
      'padoZKAttestationJSSDKAttestationPresetParams',
      'padoZKAttestationJSSDKXFollowerCount',
      'activeRequestAttestation',
    ]);
    let desc = `The user ${operation} the attestation`;
    let resParams = { result: false };
    if (!resParams.result) {
      resParams.errorData = {
        title: '',
        desc: desc,
        code: '00004',
      };
      resParams.reStartFlag = true;
    }
    try {
      sendMsgToSdk({
        type: 'padoZKAttestationJSSDK',
        name: 'startAttestationRes',
        params: resParams,
      });
    } catch (error) {
      console.log('handlerForSdk error:', handlerForSdk);
    }
  }
};

const extraRequestFn = async () => {
  // { currentWindow: true }
  const tabs = await chrome.tabs.query({});
  const dataSourcePageTabObj = tabs.find((i) => i.id === dataSourcePageTabId);
  const pathname = new URL(dataSourcePageTabObj.url).pathname;
  const arr = pathname.split('/');
  const chatgptQuestionSessionId = arr[arr.length - 1];
  const requestUrl = 'https://chatgpt.com/backend-api/conversation';
  const fullRequestUrl = `${requestUrl}/${chatgptQuestionSessionId}`;

  // const storageRes = await chrome.storage.local.get(requestUrl);
  const storageRes = requestsMap;
  const activeInfo = Object.values(storageRes).find(
    (i) => i.url === requestUrl
  );
  try {
    const requestRes = await customFetch(fullRequestUrl, {
      method: 'GET',
      // headers: JSON.parse(storageRes[requestUrl]).headers,
      headers: activeInfo.headers,
    });

    const messageIds = [];
    Object.keys(requestRes.mapping).forEach((mK) => {
      const parts = requestRes.mapping[mK]?.message?.content?.parts;
      if (parts && parts[0]) {
        messageIds.push(mK);
      }
    });
    const obj = {
      request: {
        url: fullRequestUrl,
        method: 'GET',
        headers: {
          host: 'chatgpt.com',
        },
      },
      response: {
        messageIds,
      },
    };
    chrome.storage.local.set({
      [`${requestUrl}-extra`]: JSON.stringify(obj),
    });
    RequestsHasCompleted = true;
  } catch (e) {
    console.log('fetch chatgpt conversation error', e);
  }
};
const eventReportGenerateFn = async (rawData) => {
  var eventInfo = {
    eventType: 'ATTESTATION_GENERATE',
    rawData,
  };
  eventReport(eventInfo);
};
const handle00013 = async () => {
  let rawData = {};
  let baseRawData = {
    status: 'FAILED',
    reason: 'Something went wrong',
    detail: {
      code: '00013',
      desc: 'Target data missing',
    },
  };
  const {
    padoZKAttestationJSSDKBeginAttest,
    padoZKAttestationJSSDKAttestationPresetParams,
    activeRequestAttestation,
  } = await chrome.storage.local.get([
    'padoZKAttestationJSSDKBeginAttest',
    'padoZKAttestationJSSDKAttestationPresetParams',
    'activeRequestAttestation',
  ]);
  if (padoZKAttestationJSSDKBeginAttest) {
    if (padoZKAttestationJSSDKAttestationPresetParams) {
      const parsedActiveRequestAttestation = JSON.parse(
        padoZKAttestationJSSDKAttestationPresetParams
      );
      if (
        !reportRequestIds.includes(parsedActiveRequestAttestation.requestid)
      ) {
        reportRequestIds.push(parsedActiveRequestAttestation.requestid);
        const userAddress = parsedActiveRequestAttestation?.ext
          ?.appSignParameters
          ? JSON.parse(parsedActiveRequestAttestation.ext.appSignParameters)
              .userAddress
          : '';

        rawData = {
          source: parsedActiveRequestAttestation.dataSourceId,
          schemaType: parsedActiveRequestAttestation.schemaType,
          sigFormat: parsedActiveRequestAttestation.sigFormat,
          attestOrigin: parsedActiveRequestAttestation.attestOrigin,
          event: parsedActiveRequestAttestation.attestOrigin,
          templateId: parsedActiveRequestAttestation.attTemplateID,
          address: userAddress,
          ...baseRawData,
        };
        if (parsedActiveRequestAttestation.event) {
          rawData.event = parsedActiveRequestAttestation.event;
        }
        rawData = await addSDKParamsToReportParamsFn(rawData);
        eventReportGenerateFn(rawData);
      }
    }
  } else {
    if (activeRequestAttestation) {
      const parsedActiveRequestAttestation = JSON.parse(
        activeRequestAttestation
      );
      if (
        !reportRequestIds.includes(parsedActiveRequestAttestation.requestid)
      ) {
        reportRequestIds.push(parsedActiveRequestAttestation.requestid);
        rawData = {
          source: parsedActiveRequestAttestation.source,
          schemaType: parsedActiveRequestAttestation.schemaType,
          sigFormat: parsedActiveRequestAttestation.sigFormat,
          address: parsedActiveRequestAttestation?.address,
          ...baseRawData,
        };
        if (parsedActiveRequestAttestation.event) {
          rawData.event = parsedActiveRequestAttestation.event;
        }
        eventReportGenerateFn(rawData);
      }
    }
  }
  errorFn({
    title:
      'Target data missing. Please check that the JSON path of the data in the response from the request URL matches your template.',
    desc: 'Target data missing. Please check that the JSON path of the data in the response from the request URL matches your template.',
    code: '00013',
  });
};

const handleDataSourcePageDialogTimeout = async (processAlgorithmReq) => {
  let rawData = {};
  let baseRawData = {
    status: 'FAILED',
    reason: 'Something went wrong',
    detail: {
      code: '00014',
      desc: 'The verification process timed out.',
    },
  };
  const {
    padoZKAttestationJSSDKBeginAttest,
    padoZKAttestationJSSDKAttestationPresetParams,
    activeRequestAttestation,
  } = await chrome.storage.local.get([
    'padoZKAttestationJSSDKBeginAttest',
    'padoZKAttestationJSSDKAttestationPresetParams',
    'activeRequestAttestation',
  ]);
  const eventReportFn = async (rawData) => {
    const { beginAttest, getAttestationResultRes } =
      await chrome.storage.local.get([
        'beginAttest',
        'getAttestationResultRes',
      ]);

    if (beginAttest === '1') {
      rawData.getAttestationResultRes = getAttestationResultRes;
    }

    if (!getAttestationResultRes) {
      var eventInfo = {
        eventType: 'ATTESTATION_GENERATE',
        rawData,
      };
      eventReport(eventInfo);
    }
  };
  if (padoZKAttestationJSSDKBeginAttest) {
    if (padoZKAttestationJSSDKAttestationPresetParams) {
      const parsedActiveRequestAttestation = JSON.parse(
        padoZKAttestationJSSDKAttestationPresetParams
      );
      if (
        !reportRequestIds.includes(parsedActiveRequestAttestation.requestid)
      ) {
        reportRequestIds.push(parsedActiveRequestAttestation.requestid);
        const userAddress = parsedActiveRequestAttestation?.ext
          ?.appSignParameters
          ? JSON.parse(parsedActiveRequestAttestation.ext.appSignParameters)
              .userAddress
          : '';
        // TODO-event
        rawData = {
          source: parsedActiveRequestAttestation.dataSourceId,
          schemaType: parsedActiveRequestAttestation.schemaType,
          sigFormat: parsedActiveRequestAttestation.sigFormat,
          attestOrigin: parsedActiveRequestAttestation.attestOrigin,
          event: parsedActiveRequestAttestation.attestOrigin,
          templateId: parsedActiveRequestAttestation.attTemplateID,
          address: userAddress,
          ...baseRawData,
        };
        if (parsedActiveRequestAttestation.event) {
          rawData.event = parsedActiveRequestAttestation.event;
        }
        rawData = await addSDKParamsToReportParamsFn(rawData);
        eventReportFn(rawData);
      }
    }
  } else {
    if (activeRequestAttestation) {
      const parsedActiveRequestAttestation = JSON.parse(
        activeRequestAttestation
      );
      if (
        !reportRequestIds.includes(parsedActiveRequestAttestation.requestid)
      ) {
        reportRequestIds.push(parsedActiveRequestAttestation.requestid);
        rawData = {
          source: parsedActiveRequestAttestation.source,
          schemaType: parsedActiveRequestAttestation.schemaType,
          sigFormat: parsedActiveRequestAttestation.sigFormat,
          address: parsedActiveRequestAttestation?.address,
          ...baseRawData,
        };
        if (parsedActiveRequestAttestation.event) {
          rawData.event = parsedActiveRequestAttestation.event;
        }
        eventReportFn(rawData);
      }
    }
  }

  processAlgorithmReq({
    reqMethodName: 'stop',
  });
  errorFn({
    title: 'Request Timed Out',
    desc: 'The process did not respond within 2 minutes. Please try again later.',
    code: '00014',
  });
};

// inject-dynamic
export const pageDecodeMsgListener = async (
  request,
  sender,
  sendResponse,
  password,
  port,
  hasGetTwitterScreenName,
  processAlgorithmReq
) => {
  const { name, params, operation } = request;
  console.log('pageDecodeMsgListener');
  if (name === 'init') {
    activeTemplate = {};
    activeTemplate = params;
    resetVarsFn();
  }
  if (activeTemplate.dataSource) {
    let {
      dataSource,
      jumpTo,
      datasourceTemplate: { requests },
    } = activeTemplate;

    const checkSDKTargetRequestFn = async (requestId, templateRequestUrl) => {
      const {
        datasourceTemplate: { requests, responses },
        additionParamsObj,
        extendedParams,
      } = activeTemplate;
      const extendedParamsObj = extendedParams
        ? JSON.parse(extendedParams)
        : {};

      const thisRequestUrlIdx = requests.findIndex(
        (r) => r.url === templateRequestUrl
      );
      const thisRequestObj = requests[thisRequestUrlIdx];
      const thisResponseObj = responses[thisRequestUrlIdx];

      const { url, urlType, queryParams, ignoreResponse } = thisRequestObj;
      const bodyMatchesTemplate = (requestInfo, templateRequest) => {
        const matchKeys = templateRequest?.matchReqBodyKey;
        if (!Array.isArray(matchKeys) || matchKeys.length === 0) {
          return true;
        }
        const body = requestInfo?.body;
        if (!body || typeof body !== 'object') {
          return false;
        }
        return matchKeys.every(({ key, value }) => {
          if (!key || !(key in body)) {
            return false;
          }
          return value === undefined || String(body[key]) === String(value);
        });
      };
      const thisRequestUrlFoundFlag = Object.values(requestsMap).find(
        (v) =>
          v.templateRequestUrl === url &&
          v.isTarget === 1 &&
          bodyMatchesTemplate(v, thisRequestObj)
      );

      if (!thisRequestUrlFoundFlag) {
        if (ignoreResponse) {
          Object.values(requestsMap).some((sInfo) => {
            if (sInfo.templateRequestUrl === url && sInfo.headers) {
              if (!bodyMatchesTemplate(sInfo, thisRequestObj)) {
                return false;
              }
              sInfo.isTarget = 1;
              return true;
            }
          });
        } else {
          let matchRequestIdArr = Object.keys(requestsMap).filter((key) => {
            const checkRes = checkIsRequiredUrl({
              requestUrl: requestsMap[key].url,
              requiredUrl: url,
              urlType: urlType || 'REGX',
              queryParams: queryParams,
            });
            return checkRes && bodyMatchesTemplate(requestsMap[key], thisRequestObj);
          });
          let chatgptAuthedTargetAccepted = false;
          if (getActiveTemplateDataSource() === 'chatgpt') {
            const authorizationHeader =
              getChatGptAuthorizationHeader() ||
              (await readChatGptAuthorizationHeaderFromSession());
            if (authorizationHeader) {
              matchRequestIdArr.forEach((key) => {
                const headers = requestsMap[key]?.headers || {};
                if (!headers.Authorization && !headers.authorization) {
                  storeRequestsMap(key, {
                    headers: {
                      ...headers,
                      Authorization: authorizationHeader,
                    },
                  });
                }
              });
            }
            const authedRequestIds = matchRequestIdArr.filter((key) => {
              const headers = requestsMap[key]?.headers || {};
              return !!headers.Authorization || !!headers.authorization;
            });
            if (authedRequestIds.length > 0) {
              storeRequestsMap(authedRequestIds[0], { isTarget: 1 });
              chatgptAuthedTargetAccepted = true;
            }
          }
          if (!chatgptAuthedTargetAccepted) for (const matchRequestId of [...matchRequestIdArr]) {
            if (requestsMap[matchRequestId]?.isTarget === 1) {
              break;
            } else if (requestsMap[matchRequestId]?.isTarget === 2) {
            } else {
              let jsonPathArr = thisResponseObj.conditions.subconditions.map(
                (i) => {
                  if (i?.op === 'MATCH_ONE') {
                    return i;
                  } else {
                    return isObject(i.field) && i.field?.field
                      ? i.field.field
                      : i.field;
                  }
                }
              );
              let targetRequestUrl = requestsMap[matchRequestId].url;
              if (activeTemplate?.attTemplateID === templateIdForMonad) {
                // 'https://api.lu.ma/home/get-events?period=past&pagination_limit=1000';
                targetRequestUrl = eventListUrlForMonad(targetRequestUrl); // TODO
              }

              if (
                [templateIdForNilion7Days, templateIdForNilion1Month].includes(
                  activeTemplate?.attTemplateID
                )
              ) {
                const lastBody = requestsMap[matchRequestId].body;
                let newBody = {
                  ...lastBody,
                };
                if (
                  activeTemplate?.attTemplateID === templateIdForNilion1Month
                ) {
                  const newStartTime = getNMonthsBeforeTime(
                    lastBody.endTime,
                    startTimeDistanceForNilion
                  );
                  // console.log('nilion', 'binance time:', lastBody.endTime);
                  // console.log(
                  //   'utc time:',
                  //   getUTCDayLastSecondTime(lastBody.endTime)
                  // );
                  newBody = {
                    ...lastBody,
                    rows: rowForNilion,
                    startTime: newStartTime,
                    direction: '',
                    baseAsset: '',
                    quoteAsset: '',
                    hideCancel: false,
                    queryTimeType: 'INSERT_TIME',
                  };
                } else if (
                  activeTemplate?.attTemplateID === templateIdForNilion7Days
                ) {
                  newBody = {
                    ...lastBody,
                    rows: rowForNilion,
                  };
                }
                storeRequestsMap(matchRequestId, {
                  ...requestsMap[matchRequestId],
                  body: newBody,
                });
              }

              if (
                [
                  templateIdForBinanceEarnHistory,
                  templateIdForBinanceEarnHistoryABalance,
                  templateIdForBinanceEarnHistoryABalance,
                ].includes(activeTemplate?.attTemplateID)
              ) {
                const newRequestMap = updateRequestMapFnForbBinanceEarnHistory(
                  requestsMap[matchRequestId],
                  additionParamsObj
                );
                targetRequestUrl = newRequestMap.url;
                storeRequestsMap(matchRequestId, newRequestMap);
              }

              if (
                [templateIdForReputationPhalaBinanceEarnBalance].includes(
                  activeTemplate?.attTemplateID
                )
              ) {
                const newRequestMap =
                  updateRequestMapFnForReputationPhalaBinanceEarnBalance(
                    requestsMap[matchRequestId],
                    additionParamsObj
                  );
                targetRequestUrl = newRequestMap.url;
                storeRequestsMap(matchRequestId, newRequestMap);
              }
              let matchRequestUrlResult;
              let isTargetUrl = false;
              if (requestsMap[matchRequestId].type === 'main_frame') {
                matchRequestUrlResult = await extraRequestHtmlFn({
                  ...requestsMap[matchRequestId],
                  header: requestsMap[matchRequestId].headers,
                  url: targetRequestUrl,
                });
              if (matchRequestUrlResult) {
                if (getActiveTemplateDataSource() === 'chatgpt') {
                  const { kaitoPrimusTargetDebug = [] } =
                    await chrome.storage.local.get(['kaitoPrimusTargetDebug']);
                  await chrome.storage.local.set({
                    kaitoPrimusTargetDebug: [
                      ...kaitoPrimusTargetDebug.slice(-20),
                      {
                        templateRequestUrl: url,
                        targetRequestUrl,
                        hasAuthorization:
                          !!requestsMap[matchRequestId]?.headers?.Authorization ||
                          !!requestsMap[matchRequestId]?.headers?.authorization,
                        response: describeKaitoDebugResponse(matchRequestUrlResult),
                        jsonPathArr,
                      },
                    ],
                  });
                }
                isTargetUrl = checkResHtmlIsMatchConditionFn(
                  jsonPathArr,
                  matchRequestUrlResult
                  );
                  if (isTargetUrl) {
                    storeRequestsMap(matchRequestId, { isTarget: 1 });
                    break;
                  }
                }
              } else {
                matchRequestUrlResult = await extraRequestFn2({
                  ...requestsMap[matchRequestId],
                  header: requestsMap[matchRequestId].headers,
                  url: targetRequestUrl,
                });
              }

              if (
                matchRequestUrlResult &&
                activeTemplate?.attTemplateID === templateIdForTwitch
              ) {
                let formarRes = formatJsonArrFnForTwitch(
                  jsonPathArr,
                  requestsMap[matchRequestId],
                  thisRequestObj.matchReqBodyKey,
                  matchRequestUrlResult
                );
                if (formarRes?.checkRes) {
                  jsonPathArr = formarRes.jsonpath;
                  isTargetUrl = true;
                }
              } else {
                isTargetUrl = checkResIsMatchConditionFn(
                  jsonPathArr,
                  matchRequestUrlResult
                );
                if (getActiveTemplateDataSource() === 'chatgpt') {
                  const { kaitoPrimusTargetDebug = [] } =
                    await chrome.storage.local.get(['kaitoPrimusTargetDebug']);
                  await chrome.storage.local.set({
                    kaitoPrimusTargetDebug: [
                      ...kaitoPrimusTargetDebug.slice(-20),
                      {
                        templateRequestUrl: url,
                        targetRequestUrl,
                        hasAuthorization:
                          !!requestsMap[matchRequestId]?.headers?.Authorization ||
                          !!requestsMap[matchRequestId]?.headers?.authorization,
                        isTargetUrl,
                        response: describeKaitoDebugResponse(matchRequestUrlResult),
                        jsonPathArr,
                      },
                    ],
                  });
                }
              }
              const notMetHandler = async () => {
                const notMetCode = '00104';
                const netMetMsg = await getErrorMsgFn(
                  activeTemplate.attestationType,
                  notMetCode
                );
                handleEnd(netMetMsg);
                sendMsgToSdk({
                  type: 'padoZKAttestationJSSDK',
                  name: 'startAttestationRes',
                  params: {
                    result: false,
                    errorData: {
                      code: notMetCode,
                    },
                  },
                });
              };
              if (
                matchRequestUrlResult &&
                activeTemplate?.attTemplateID === templateIdForMonad
              ) {
                isTargetUrl = await checkTargetRequestFnForMonad(
                  targetRequestUrl,
                  matchRequestUrlResult,
                  requestsMap[matchRequestId],
                  notMetHandler
                );
              }
              if (
                matchRequestUrlResult &&
                activeTemplate?.attTemplateID ===
                  templateIdForReputaionPhalaCvmList &&
                targetRequestUrl.includes(phalaCvmListRequestUrl)
              ) {
                isTargetUrl =
                  await checkTargetRequestFnForReputationPhalaCvmList(
                    matchRequestUrlResult,
                    notMetHandler
                  );
              }

              if (
                matchRequestUrlResult &&
                activeTemplate?.attTemplateID ===
                  templateIdForReputationPhalaBinanceEarnBalance
              ) {
                isTargetUrl =
                  await checkTargetRequestFnForReputationPhalaBinanceEarnBalance(
                    matchRequestUrlResult,
                    notMetHandler,
                    additionParamsObj
                  );
              }
              if (
                matchRequestUrlResult &&
                activeTemplate?.attTemplateID ===
                  templateIdForBinanceSomeTokenBalance &&
                targetRequestUrl.includes(
                  templateIdForBinanceSomeTokenBalanceRequestUrl
                )
              ) {
                isTargetUrl =
                  await checkTargetRequestFnForBinanceSomeTokenBalance(
                    matchRequestUrlResult,
                    notMetHandler,
                    extendedParamsObj
                  );
              }

              if (
                matchRequestUrlResult &&
                activeTemplate?.attTemplateID ===
                  templateIdForOkxSomeTokenBalance &&
                targetRequestUrl.includes(
                  templateIdForOkxSomeTokenBalanceRequestUrl
                )
              ) {
                isTargetUrl = await checkTargetRequestFnForOkxSomeTokenBalance(
                  matchRequestUrlResult,
                  notMetHandler,
                  extendedParamsObj
                );
              }

              if (
                matchRequestUrlResult &&
                activeTemplate?.attTemplateID ===
                  templateIdForCoinstatsSomeTokenBalance
              ) {
                isTargetUrl =
                  await checkTargetRequestFnForCoinstatsSomeTokenBalance(
                    matchRequestUrlResult,
                    notMetHandler,
                    extendedParamsObj
                  );
              }

              if (isTargetUrl) {
                storeRequestsMap(matchRequestId, { isTarget: 1 });
                break;
              } else {
                if (requestsMap[matchRequestId]) {
                  storeRequestsMap(matchRequestId, { isTarget: 2 });
                }
              }
            }
          }
        }
      }
    };
    const checkWebRequestIsReadyFn = async () => {
      const checkReadyStatusFn = async () => {
        let {
          dataSource,
          datasourceTemplate: { requests, responses },
          sdkVersion,
        } = activeTemplate;

        const interceptorRequests = requests.filter((r) => r.name !== 'first');
        const interceptorUrlArr = interceptorRequests.map((i) => i.url);

        await hydrateMissingChatGptRequestsFromTrace(interceptorRequests);

        const storageObj = requestsMap;
        const storageArr = Object.values(storageObj);

        if (
          interceptorUrlArr.length > 0 &&
          storageArr.length >= interceptorUrlArr.length
        ) {
          let captureNum = 0;
          let f = interceptorRequests.every(async (r) => {
            const activeRequestInfo = Object.values(requestsMap).find(
              (rInfo) => {
                const checkRes = checkIsRequiredUrl({
                  requestUrl: rInfo.url,
                  requiredUrl: r.url,
                  urlType: r.urlType,
                  queryParams: r.queryParams,
                });
                return checkRes;
                // return matchReg(r.url, rInfo.url);
              }
            );
            if (activeRequestInfo) {
              let targetRequestId = activeRequestInfo.requestId;
              const sRrequestObj = requestsMap[targetRequestId] || {};
              // console.log('sRrequestObj', storageObj, url, sRrequestObj, r);
              chatgptHasLogin =
                !!sRrequestObj?.headers?.Authorization ||
                !!sRrequestObj?.headers?.authorization;
              const headersFlag =
                !r.headers || (!!r.headers && !!sRrequestObj.headers);
              const bodyFlag = !r.body || (!!r.body && !!sRrequestObj.body);
              const cookieFlag =
                !r.cookies ||
                (!!r.cookies &&
                  !!sRrequestObj.headers &&
                  !!sRrequestObj.headers.Cookie);

              if (activeRequestInfo && headersFlag && bodyFlag && cookieFlag) {
                captureNum += 1;
              }
              return activeRequestInfo && headersFlag && bodyFlag && cookieFlag;
            } else {
              return false;
            }
          });
          f = captureNum === interceptorRequests.length;

          let fl = false;
          if (sdkVersion) {
            const allRequestUrlFoundFlag = interceptorRequests.every((requestInfo) => {
              return !!findCapturedTargetEntry(requestInfo);
            });

            // const allRequestUrlFoundFlag = Object.values(requestsMap).some(
            //   (sInfo) => {
            //     if (
            //       sInfo.templateRequestUrl.includes('get_creator_channels') &&
            //       sInfo.headers &&
            //       sInfo.body
            //     ) {
            //       sInfo.isTarget = 1;
            //       return true;
            //     }
            //   }
            // );
            fl = f && !!allRequestUrlFoundFlag;
          } else {
            fl = f;
          }

          if (fl) {
            if (getActiveTemplateDataSource() === 'chatgpt') {
              if (sdkVersion) {
                if (!formatAlgorithmParams) {
                  await formatAlgorithmParamsFn();
                }
              } else {
                fl =
                  !!f &&
                  chatgptHasLogin &&
                  RequestsHasCompleted &&
                  preAlgorithmStatus === '1';
              }
            } else {
              if (!formatAlgorithmParams) {
                await formatAlgorithmParamsFn();
              }
            }
          }
          return fl;
        } else {
          return false;
        }
      };
      isReadyRequest = await checkReadyStatusFn();
      await chrome.storage.local.set({
        kaitoPrimusDebug: {
          activeTemplateDataSource: activeTemplate?.dataSource,
          activeTemplateDataSourceId: activeTemplate?.dataSourceId,
          activeTemplateKeys: Object.keys(activeTemplate || {}).slice(0, 30),
          activeTemplateRequestUrls:
            activeTemplate?.datasourceTemplate?.requests?.map((request) => request?.url) || [],
          isReadyRequest,
          chatgptHasLogin,
          RequestsHasCompleted,
          preAlgorithmStatus,
          requestsMap: redactRequestsMapForKaitoDebug(),
        },
      });
      if (isReadyRequest) {
        console.log('all web requests are captured', requestsMap);
        sendMsgToDataSourcePage({
          type: 'pageDecode',
          name: 'webRequestIsReady',
          params: {
            isReady: isReadyRequest,
          },
        });
        const { kaitoPrimusDisallowTabCreate } = await chrome.storage.local.get(
          ['kaitoPrimusDisallowTabCreate']
        );
        if (kaitoPrimusDisallowTabCreate && activeTemplate.sdkVersion) {
          await startPageDecodeAttestationFn();
        }
      }
    };

    const formatAlgorithmParamsFn = async () => {
      let {
        dataSource,
        schemaType,
        datasourceTemplate: { host, requests, responses, calculations, cipher },
        uiTemplate,
        id,
        event,
        category,
        requestid,
        algorithmType,
        sdkVersion,
      } = activeTemplate;
      const form = {
        source: dataSource,
        type: category,
        label: null,
        exUserId: null,
        requestid,
        algorithmType: algorithmType || 'proxytls',
        cipher,
      };
      if (event) {
        form.event = event;
      }
      // "X Followers" required update baseValue
      // console.log('activeTemplate', activeTemplate, dataSource);
      if (activeTemplate.id === '15') {
        form.baseValue =
          activeTemplate.datasourceTemplate.responses[1].conditions.subconditions[1].value;
      }
      if (activeTemplate.requestid) {
        form.requestid = activeTemplate.requestid;
      }
      let aligorithmParams = {};
      if (sdkVersion) {
        aligorithmParams = await assembleAlgorithmParamsForSDK(
          {
            dataSource: activeTemplate.dataSource,
            algorithmType: activeTemplate.algorithmType,
            requestid: activeTemplate.requestid,
            sslCipherSuite: activeTemplate.sslCipherSuite,
            allJsonResponseFlag: activeTemplate.allJsonResponseFlag,
          },
          activeTemplate.ext
        );
      } else {
        aligorithmParams = await assembleAlgorithmParams(form, password);
      }

      let formatRequests = [];
      for (const r of JSON.parse(JSON.stringify(requests))) {
        if (r.queryDetail) {
          continue;
        }

        let { headers, cookies, body, urlType } = r;
        // let formatUrlKey = url;
        let targetRequestId = '';
        if (sdkVersion) {
          const targetEntry = findCapturedTargetEntry(r);
          targetRequestId = targetEntry?.[0] || targetEntry?.[1]?.requestId || '';
        } else {
          targetRequestId = Object.values(requestsMap).find((rInfo) => {
            const checkRes = checkIsRequiredUrl({
              requestUrl: rInfo.url,
              requiredUrl: r.url,
              urlType: r.urlType,
              queryParams: r.queryParams,
            });
            return checkRes;
            // return matchReg(url, rInfo.url);
          })?.requestId;
          console.log(
            'formatAlgorithmParamsFn-after',
            requestsMap,
            targetRequestId
          );
        }

        const currRequestInfoObj = requestsMap[targetRequestId] || {};
        let {
          headers: curRequestHeader,
          body: curRequestBody,
          queryString,
          url,
        } = currRequestInfoObj;
        if (getActiveTemplateDataSource() === 'chatgpt') {
          const fallbackHeaders = getChatGptHeaderFallback();
          if (Object.keys(fallbackHeaders).length > 0) {
            curRequestHeader = {
              ...fallbackHeaders,
              ...(curRequestHeader || {}),
            };
          }
          const authorizationHeader =
            getChatGptAuthorizationHeader() ||
            (await readChatGptAuthorizationHeaderFromSession());
          if (authorizationHeader && (!curRequestHeader?.Authorization && !curRequestHeader?.authorization)) {
            curRequestHeader = {
              ...(curRequestHeader || {}),
              Authorization: authorizationHeader,
            };
          }
        }

        const cookiesObj = curRequestHeader
          ? parseCookie(curRequestHeader.Cookie)
          : {};
        let formateHeader = {},
          formateCookie = {},
          formateBody = {};

        if (sdkVersion) {
          Object.assign(r, {
            headers: { ...curRequestHeader },
            body: isObject(curRequestBody)
              ? { ...curRequestBody }
              : curRequestBody,
            url: queryString ? r.url + '?' + queryString : r.url,
          });
        } else {
          if (headers && headers.length > 0) {
            headers.forEach((hk) => {
              if (curRequestHeader) {
                const inDataSourceHeaderKey = Object.keys(
                  curRequestHeader
                ).find((h) => h.toLowerCase() === hk.toLowerCase());
                formateHeader[hk] = curRequestHeader[inDataSourceHeaderKey];
              }
            });
            Object.assign(r, {
              headers: formateHeader,
            });
          }

          if (cookies && cookies.length > 0) {
            cookies.forEach((ck) => {
              formateCookie[ck] = cookiesObj[ck];
            });
            Object.assign(r, {
              cookies: formateCookie,
            });
          }
          if (body && body.length > 0) {
            body.forEach((hk) => {
              formateBody[hk] = curRequestBody[hk];
            });
            Object.assign(r, {
              body: formateBody,
            });
          }
          if (queryString) {
            Object.assign(r, {
              url: r.url + '?' + queryString,
            });
          }
          if ('queryParams' in r) {
            delete r.queryParams;
          }
        }
        formatRequests.push({ ...r, url: r.name === 'first' ? r.url : url });
      }
      // const activeInfo = formatRequests.find((i) => i.headers);
      // const activeHeader = Object.assign({}, activeInfo?.headers);
      // const authInfoName = dataSource + '-auth';
      // await chrome.storage.local.set({
      //   [authInfoName]: JSON.stringify(activeHeader),
      // });
      let formatResponse = JSON.parse(JSON.stringify(responses));
      if (getActiveTemplateDataSource() === 'chatgpt') {
        const { chatGPTExpression } = activeTemplate;
        if (chatGPTExpression) {
          aligorithmParams.chatGPTExpression = chatGPTExpression;
          const extraRequestSK = `https://chatgpt.com/backend-api/conversation-extra`;
          const extraSObj = await chrome.storage.local.get([extraRequestSK]);
          const extraRequestInfo = extraSObj[extraRequestSK]
            ? JSON.parse(extraSObj[extraRequestSK])
            : {};
          if (
            extraRequestInfo?.request?.url &&
            extraRequestInfo?.request?.method &&
            extraRequestInfo?.request?.headers?.host &&
            Array.isArray(extraRequestInfo?.response?.messageIds)
          ) {
            const {
              request: {
                url,
                method,
                headers: { host },
              },
              response: { messageIds },
            } = extraRequestInfo;

            formatRequests[1].url = url;
            formatRequests[1].method = method;
            formatRequests[1].headers.host = host;
            let originSubConditionItem =
              formatResponse[1].conditions.subconditions[0];
            formatResponse[1].conditions.subconditions = [];
            messageIds.forEach((mK) => {
              const fieldArr = originSubConditionItem.field.split('.');
              fieldArr[2] = mK;
              formatResponse[1].conditions.subconditions.push({
                ...originSubConditionItem,
                reveal_id: mK,
                field: fieldArr.join('.'),
              });
            });
          }
        }
        for (const fr of formatRequests) {
          if (fr.headers) {
            fr.headers['Accept-Encoding'] = 'identity';
          }
          if (fr.url) {
            fr.url = fr.url.split('#')[0];
          }
        }
      } else {
        if (activeTemplate.attTemplateID === templateIdForMonad) {
          const { formatRequests: req, formatResponse: res } =
            formatRequestResponseFnForMonad(formatRequests, formatResponse);
          formatRequests = req;
          formatResponse = res;
        } else if (activeTemplate.attTemplateID === templateIdForTwitch) {
          const { formatRequests: req, formatResponse: res } =
            formatRequestResponseFnForTwitch(formatRequests, formatResponse);
          formatRequests = req;
          formatResponse = res;
        } else if (
          activeTemplate.attTemplateID === templateIdForBinanceEarnHistory
        ) {
          const { formatRequests: req, formatResponse: res } =
            formatRequestResponseFnForBinanceEarnHistory(
              formatRequests,
              formatResponse
            );
          formatRequests = req;
          formatResponse = res;
        } else if (
          activeTemplate.attTemplateID ===
          templateIdForBinanceEarnHistoryABalance
        ) {
          const { formatRequests: req, formatResponse: res } =
            formatRequestResponseFnForBinanceEarnHistoryABalance(
              formatRequests,
              formatResponse
            );
          formatRequests = req;
          formatResponse = res;
        } else if (activeTemplate.attTemplateID === templateIdForPhalaAccount) {
          const { formatRequests: req, formatResponse: res } =
            formatRequestResponseFnForPhalaAccount(
              formatRequests,
              formatResponse
            );
          formatRequests = req;
          formatResponse = res;
        } else if (
          activeTemplate.attTemplateID === templateIdForReputaionPhalaCvmList
        ) {
          const { formatRequests: req, formatResponse: res } =
            formatRequestResponseFnForReputationPhalaCvmList(
              formatRequests,
              formatResponse
            );
          formatRequests = req;
          formatResponse = res;
        } else if (activeTemplate.attTemplateID === templateIdForPhalaCvmList) {
          const { formatRequests: req, formatResponse: res } =
            formatRequestResponseFnForPhalaCvmList(
              formatRequests,
              formatResponse
            );
          formatRequests = req;
          formatResponse = res;
        } else if (
          activeTemplate.attTemplateID ===
          templateIdForReputationPhalaBinanceEarnBalance
        ) {
          const { formatRequests: req, formatResponse: res } =
            formatRequestResponseFnForReputationPhalaBinanceEarnBalance(
              formatRequests,
              formatResponse
            );
          formatRequests = req;
          formatResponse = res;
        } else if (
          activeTemplate.attTemplateID === templateIdForBinanceSomeTokenBalance
        ) {
          const { formatRequests: req, formatResponse: res } =
            formatRequestResponseFnForBinanceSomeTokenBalance(
              formatRequests,
              formatResponse
            );
          formatRequests = req;
          formatResponse = res;
        } else if (
          activeTemplate.attTemplateID === templateIdForOkxSomeTokenBalance
        ) {
          const { formatRequests: req, formatResponse: res } =
            formatRequestResponseFnForOkxSomeTokenBalance(
              formatRequests,
              formatResponse
            );
          formatRequests = req;
          formatResponse = res;
        } else if (
          activeTemplate.attTemplateID ===
          templateIdForCoinstatsSomeTokenBalance
        ) {
          const { formatRequests: req, formatResponse: res } =
            formatRequestResponseFnForCoinstatsSpotSomeTokenBalance(
              formatRequests,
              formatResponse
            );
          formatRequests = req;
          formatResponse = res;
        }

        for (const fr of formatRequests) {
          if (fr.headers) {
            fr.headers['Accept-Encoding'] = 'identity';
          }
          fr.url = fr.url.split('#')[0];
        }
      }
      Object.assign(aligorithmParams, {
        reqType: 'web',
        host: host,
        schemaType,
        requests: formatRequests,
        responses: formatResponse,
        uiTemplate,
        templateId: id,
        calculations,
        PADOSERVERURL,
        padoExtensionVersion,
      });
      if (schemaType?.startsWith('OKX_TOKEN_HOLDING')) {
        aligorithmParams.requests[2].url =
          aligorithmParams.requests[2].url.replace('limit=5', 'limit=100');
      }

      formatAlgorithmParams = aligorithmParams;
      console.log(
        'formatAlgorithmParams',
        formatAlgorithmParams,
        form,
        activeTemplate
      );
    };

    const startPageDecodeAttestationFn = async () => {
      if (hasStartedPageDecodeAttestation) {
        return;
      }
      if (!formatAlgorithmParams) {
        await formatAlgorithmParamsFn();
      }
      hasStartedPageDecodeAttestation = true;
      await chrome.storage.local.set({
        beginAttest: '1',
      });
      let aligorithmParams = Object.assign(
        { isUserClick: 'true' },
        formatAlgorithmParams
      );
      await chrome.storage.local.set({
        activeRequestAttestation: JSON.stringify(aligorithmParams),
        kaitoLastAlgorithmParamsDebug:
          sanitizeAlgorithmParamsForKaitoDebug(aligorithmParams),
        kaitoPrimusDebug: {
          source: aligorithmParams.source,
          requestCount: aligorithmParams.requests?.length,
          requests: aligorithmParams.requests?.map((request) => ({
            name: request.name,
            url: request.url,
            method: request.method,
            hasHeaders: !!request.headers,
            hasAuthorization:
              !!request.headers?.Authorization || !!request.headers?.authorization,
            targetRequestId: request.targetRequestId,
          })),
          requestsMap: redactRequestsMapForKaitoDebug(),
        },
      });
      console.log('pageDecode-algorithmParams', aligorithmParams);

      var eventInfo = {
        eventType: 'ATTESTATION_START_PAGEDECODE',
        rawData: {
          source: aligorithmParams.source,
          schemaType: aligorithmParams.schemaType,
          sigFormat: aligorithmParams.sigFormat,
          attestationId: aligorithmParams.requestid,
          event: aligorithmParams.event,
          address: aligorithmParams?.user?.address,
          requestid: aligorithmParams.requestid,
          order: '3',
        },
      };
      eventInfo.rawData = await addSDKParamsToReportParamsFn(eventInfo.rawData);
      eventReport(eventInfo);
      chrome.runtime.sendMessage({
        type: 'algorithm',
        method: 'getAttestation',
        params: JSON.parse(JSON.stringify(aligorithmParams)),
      });
    };

    const preAlgorithmFn = async () => {
      console.log('preAlgorithmFn');
      if (preAlgorithmFlag) {
        return;
      }

      let aligorithmParams = Object.assign(
        { isUserClick: 'false' },
        formatAlgorithmParams
      );
      chrome.runtime.sendMessage({
        type: 'algorithm',
        method: 'getAttestation',
        params: JSON.parse(JSON.stringify(aligorithmParams)),
      });
      preAlgorithmFlag = true;
    };
    listenerFn = async (message, sender, sendResponse) => {
      const { padoZKAttestationJSSDKBeginAttest } =
        await chrome.storage.local.get(['padoZKAttestationJSSDKBeginAttest']);
      if (padoZKAttestationJSSDKBeginAttest) {
        const { resType, resMethodName } = message;

        if (
          resType === 'algorithm' &&
          ['getAttestation', 'getAttestationResult'].includes(resMethodName)
        ) {
          if (message.res) {
            const { retcode, isUserClick } = JSON.parse(message.res);
            if (isUserClick === 'false') {
              console.log('preAlgorithm message', message);
              if (resMethodName === 'getAttestation') {
                if (retcode === '0') {
                  if (!preAlgorithmTimer) {
                    preAlgorithmTimer = setInterval(() => {
                      chrome.runtime.sendMessage({
                        type: 'algorithm',
                        method: 'getAttestationResult',
                        params: {},
                      });
                    }, 1000);
                    console.log('preAlgorithmTimer-set', preAlgorithmTimer);
                  }
                } else {
                  errorFn({
                    title: 'Launch failed: unstable connection.',
                    desc: 'Launch failed: unstable connection.',
                    code: '00011',
                  });
                }
              }
              if (resMethodName === 'getAttestationResult') {
                const { retcode, content, retdesc, details, isUserClick } =
                  JSON.parse(message.res);

                if (retcode === '1') {
                  if (details.online.statusDescription === 'RUNNING_PAUSE') {
                    console.log(
                      'preAlgorithmTimer-clear',
                      preAlgorithmTimer,
                      'preAlgorithmStatus',
                      retcode
                    );
                    clearInterval(preAlgorithmTimer);
                    preAlgorithmStatus = retcode;
                    checkWebRequestIsReadyFn();
                  }
                } else if (retcode === '2') {
                  console.log(
                    'preAlgorithmTimer-clear',
                    preAlgorithmTimer,
                    'preAlgorithmStatus',
                    retcode
                  );
                  clearInterval(preAlgorithmTimer);
                  preAlgorithmStatus = retcode;
                  errorFn({
                    title: 'Launch failed: unstable connection.',
                    desc: 'Launch failed: unstable connection.',
                    code: '00011',
                  });
                }
              }
            }
          }
        }
      }
    };
    chrome.runtime.onMessage.addListener(listenerFn);

    if (name === 'init') {
      const { configMap } = await chrome.storage.local.get(['configMap']);
      if (configMap) {
        const PRE_ATTEST_PROMOTStr =
          JSON.parse(configMap)?.PRE_ATTEST_PROMOT_V2;
        if (PRE_ATTEST_PROMOTStr) {
          PRE_ATTEST_PROMOT_V2 = JSON.parse(PRE_ATTEST_PROMOTStr);
        }
      }

      operationType = request.operation;
      const currentWindowTabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      currExtentionId = currentWindowTabs[0]?.id;
      const interceptorUrlArr = requests
        .filter((r) => r.name !== 'first')
        .map((i) => i.url);
      // const aaa = await chrome.storage.local.get(interceptorUrlArr);
      await chrome.storage.local.remove(interceptorUrlArr);
      console.log('lastStorage-remove', interceptorUrlArr);
      // const bbb = await chrome.storage.local.get(interceptorUrlArr);
      // console.log('555-newattestations', capturedUrlKeyArr, aaa, bbb);

      chrome.webRequest.onBeforeSendHeaders.removeListener(
        onBeforeSendHeadersFn
      );
      chrome.webRequest.onBeforeRequest.removeListener(onBeforeRequestFn);
      chrome.webRequest.onCompleted.removeListener(onCompletedFn);
      onBeforeSendHeadersFn = async (details) => {
        const allowKaitoSdkInitiatedChatGptRequest =
          activeTemplate?.sdkVersion && getActiveTemplateDataSource() === 'chatgpt';
        const isChatGptTemplate = getActiveTemplateDataSource() === 'chatgpt';
        if (
          details?.initiator?.startsWith(
            `chrome-extension://${chrome.runtime.id}`
          ) &&
          !allowKaitoSdkInitiatedChatGptRequest
        ) {
          return;
        }
        if (!isChatGptTemplate && ![-1, dataSourcePageTabId].includes(details.tabId)) {
          return;
        }

        if (details.method === 'OPTIONS') {
          return;
        }
        let {
          dataSource,
          jumpTo,
          datasourceTemplate: { requests },
          sdkVersion,
          attTemplateID,
        } = activeTemplate;

        const {
          url: currRequestUrl,
          requestHeaders,
          method,
          requestId,
        } = details;

        let formatUrlKey = currRequestUrl;
        let addQueryStr = '';
        let needQueryDetail = false;
        let formatHeader = requestHeaders.reduce((prev, curr) => {
          const { name, value } = curr;
          prev[name] = value;
          return prev;
        }, {});
        if (
          currRequestUrl === 'https://chatgpt.com/public-api/conversation_limit'
        ) {
          chatgptHasLogin =
            !!formatHeader.Authorization || !!formatHeader.authorization;
          if (getActiveTemplateDataSource() === 'chatgpt') {
            const tipStr = chatgptHasLogin ? 'toMessage' : 'toLogin';
            console.log('setUIStep-', tipStr);
            sendMsgToDataSourcePage({
              type: 'pageDecode',
              name: 'setUIStep',
              params: {
                step: tipStr,
              },
            });
          }
        }
        if (getActiveTemplateDataSource() === 'chatgpt') {
          const authorization = formatHeader.Authorization || formatHeader.authorization;
          if (authorization) {
            chatgptAuthorizationHeader = authorization;
          } else {
            const sessionAuthorization = await readChatGptAuthorizationHeaderFromSession();
            if (sessionAuthorization) {
              formatHeader = {
                ...formatHeader,
                Authorization: sessionAuthorization,
              };
            }
          }
        }
        let templateRequestUrl = '';

        if (attTemplateID === lumaAccountTemplateId) {
          const checkRes = checkIsRequiredUrl({
            requestUrl: currRequestUrl,
            requiredUrl: lumaAccountTemplateReg,
            urlType: 'REGX',
          });
          if (checkRes) {
            // console.log('formatHeader', formatHeader);
            const userId = getUserIdFromCookie(formatHeader?.Cookie);
            if (userId) {
              const lumaAccountTargetJumpUrl =
                getLumaAccountTargetJumpUrl(userId);
              await chrome.tabs.update(dataSourcePageTabId, {
                url: lumaAccountTargetJumpUrl,
              });
              return;
            } else {
              return;
            }
          }
        }
        let isTarget = requests.some((r) => {
          if (r.name === 'first') {
            return false;
          }
          if (r.queryParams && r.queryParams[0]) {
            const urlStrArr = currRequestUrl.split('?');
            const hostUrl = urlStrArr[0];
            let curUrlWithQuery = r.url === hostUrl;
            if (r.queryDetail) {
              needQueryDetail = r.queryDetail;
            }
            if (r.url === hostUrl) {
              curUrlWithQuery = isUrlWithQueryFn(currRequestUrl, r.queryParams);
            }
            if (curUrlWithQuery) {
              addQueryStr = curUrlWithQuery;
            }
            formatUrlKey = hostUrl;
          }
          const checkRes = checkIsRequiredUrl({
            requestUrl: currRequestUrl,
            requiredUrl: r.url,
            urlType: r.urlType,
            queryParams: r.queryParams,
          });
          if (checkRes) {
            templateRequestUrl = r.url;
          }

          return checkRes;
        });
        if (!isTarget && getActiveTemplateDataSource() === 'chatgpt') {
          const forcedRequest = requests.find((r) => {
            if (!r?.url || r.name === 'first') {
              return false;
            }
            return (
              (currRequestUrl.includes('/backend-api/accounts/check/') &&
                r.url.includes('/backend-api/accounts/check/')) ||
              (currRequestUrl.includes('/backend-api/subscriptions?') &&
                r.url.includes('/backend-api/subscriptions')) ||
              (currRequestUrl.includes('/backend-api/wham/usage') &&
                r.url.includes('/backend-api/wham/usage'))
            );
          });
          if (forcedRequest) {
            isTarget = true;
            templateRequestUrl = forcedRequest.url;
          }
        }
        // console.log(
        //   'captured:',
        //   currRequestUrl,
        //   'isTarget:',
        //   isTarget,
        //   details
        // );
        if (isTarget) {
          console.log('monad-details', details);
          if (getActiveTemplateDataSource() === 'chatgpt' && chatgptAuthorizationHeader) {
            formatHeader = {
              ...formatHeader,
              Authorization:
                formatHeader.Authorization ||
                formatHeader.authorization ||
                chatgptAuthorizationHeader,
            };
          }
          let newCapturedInfo = {
            headers: formatHeader,
            method,
            url: currRequestUrl,
            requestId,
            templateRequestUrl,
            type: details.type, // type: "main_frame"
          };
          if (addQueryStr) {
            newCapturedInfo.queryString = addQueryStr;
          }
          const newCurrRequestObj = storeRequestsMap(
            requestId,
            newCapturedInfo
          );
          if (
            needQueryDetail &&
            formatUrlKey.startsWith(
              'https://api.x.com/1.1/account/settings.json'
            ) &&
            !hasGetTwitterScreenName
          ) {
            const options = {
              headers: newCurrRequestObj.headers,
            };
            hasGetTwitterScreenName = true;
            const res = await fetch(
              formatUrlKey + '?' + newCurrRequestObj.queryString,
              options
            );
            const result = await res.json();
            //need to go profile page
            await chrome.tabs.update(dataSourcePageTabId, {
              url: jumpTo + result.screen_name,
            });
          }
          if (sdkVersion) {
            await checkSDKTargetRequestFn(requestId, templateRequestUrl);
          }
          checkWebRequestIsReadyFn();
        }
      };
      onBeforeRequestFn = async (subDetails) => {
        const allowKaitoSdkInitiatedChatGptRequest =
          activeTemplate?.sdkVersion && getActiveTemplateDataSource() === 'chatgpt';
        const isChatGptTemplate = getActiveTemplateDataSource() === 'chatgpt';
        if (
          subDetails?.initiator?.startsWith(
            `chrome-extension://${chrome.runtime.id}`
          ) &&
          !allowKaitoSdkInitiatedChatGptRequest
        ) {
          return;
        }
        if (!isChatGptTemplate && ![-1, dataSourcePageTabId].includes(subDetails.tabId)) {
          return;
        }
        if (subDetails.method === 'OPTIONS') {
          return;
        }
        let {
          datasourceTemplate: { requests },
        } = activeTemplate;
        const { url: currRequestUrl, requestBody, requestId } = subDetails;

        if (getActiveTemplateDataSource() !== 'chatgpt') {
          removeRequestsMap(requestId);
        }
        let formatUrlKey = currRequestUrl;
        const isTarget = requests.some((r) => {
          if (r.name === 'first') {
            return false;
          }

          const checkRes = checkIsRequiredUrl({
            requestUrl: currRequestUrl,
            requiredUrl: r.url,
            urlType: r.urlType,
            queryParams: r.queryParams,
          });
          return checkRes;
        });
        if (isTarget) {
          if (requestBody && requestBody.raw) {
            const rawBody = requestBody.raw[0];
            if (rawBody && rawBody.bytes) {
              const byteArray = new Uint8Array(rawBody.bytes);
              const bodyText = new TextDecoder().decode(byteArray);
              // console.log(
              //   `targeturl:${subDetails.url}, method:${subDetails.method} Request Body: ${bodyText}`
              // );

              storeRequestsMap(requestId, {
                body: JSON.parse(bodyText),
              });
            }
          }
          if (requestBody && requestBody.formData) {
            await storeRequestsMap(requestId, {
              body: requestBody.formData,
              isFormData: true,
            });
          }
        }
      };
      onCompletedFn = async (details) => {
        const allowKaitoSdkInitiatedChatGptRequest =
          activeTemplate?.sdkVersion && getActiveTemplateDataSource() === 'chatgpt';
        const isChatGptTemplate = getActiveTemplateDataSource() === 'chatgpt';
        if (
          details?.initiator?.startsWith(
            `chrome-extension://${chrome.runtime.id}`
          ) &&
          !allowKaitoSdkInitiatedChatGptRequest
        ) {
          return;
        }
        if (!isChatGptTemplate && ![-1, dataSourcePageTabId].includes(details.tabId)) {
          return;
        }
        let { dataSource } = activeTemplate;

        if (getActiveTemplateDataSource() === 'chatgpt') {
          console.log('onCompletedFn', dataSource, details);
          console.log('setUIStep-toVerify');
          sendMsgToDataSourcePage({
            type: 'pageDecode',
            name: 'setUIStep',
            params: {
              step: 'toVerify',
            },
          });

          console.log('RequestsHasCompleted=', RequestsHasCompleted);
          checkWebRequestIsReadyFn();
        }
      };

      const requestListenerFilter =
        getActiveTemplateDataSource() === 'chatgpt'
          ? { urls: ['https://chatgpt.com/backend-api/*'] }
          : { urls: ['<all_urls>'], types: ['xmlhttprequest', 'main_frame'] };
      chrome.webRequest.onBeforeSendHeaders.addListener(
        onBeforeSendHeadersFn,
        requestListenerFilter,
        ['requestHeaders', 'extraHeaders']
      );
      chrome.webRequest.onBeforeRequest.addListener(
        onBeforeRequestFn,
        requestListenerFilter,
        ['requestBody']
      );

      chrome.webRequest.onCompleted.addListener(
        onCompletedFn,
        getActiveTemplateDataSource() === 'chatgpt'
          ? { urls: ['https://chatgpt.com/backend-api/*'] }
          : { urls: interceptorUrlArr, types: ['xmlhttprequest', 'main_frame'] },
        ['responseHeaders', 'extraHeaders']
      );
      if (getActiveTemplateDataSource() === 'chatgpt') {
        let readyPollAttempts = 0;
        if (chatgptReadyPollTimer) {
          clearInterval(chatgptReadyPollTimer);
        }
        chatgptReadyPollTimer = setInterval(() => {
          readyPollAttempts += 1;
          checkWebRequestIsReadyFn().catch((error) => {
            console.log('chatgpt ready poll failed', error);
          });
          if (readyPollAttempts >= 30 || formatAlgorithmParams) {
            clearInterval(chatgptReadyPollTimer);
            chatgptReadyPollTimer = null;
          }
        }, 1000);
      }

      const {
        padoZKAttestationJSSDKDappTabId: dappTabId,
        kaitoPrimusDisallowTabCreate,
      } = await chrome.storage.local.get([
        'padoZKAttestationJSSDKDappTabId',
        'kaitoPrimusDisallowTabCreate',
      ]);
      let tabCreatedByPado;
      let reloadExistingDataSourcePage = false;
      if (kaitoPrimusDisallowTabCreate && dappTabId) {
        tabCreatedByPado = await chrome.tabs.get(dappTabId).catch(() => null);
        if (!tabCreatedByPado) {
          throw new Error('kaito_auto_tab_create_blocked');
        }
        reloadExistingDataSourcePage = true;
      } else {
        tabCreatedByPado = await chrome.tabs.create({
          url: jumpTo,
        });
      }
      dataSourcePageTabId = tabCreatedByPado.id;
      console.log('pageDecode dataSourcePageTabId:', dataSourcePageTabId);
      const injectFn = async () => {
        await chrome.scripting.executeScript({
          target: {
            tabId: dataSourcePageTabId,
          },
          files: ['pageDecode.bundle.js'],
        });
        await chrome.scripting.insertCSS({
          target: { tabId: dataSourcePageTabId },
          files: ['static/css/pageDecode.css'],
        });
      };
      const triggerExistingDataSourceRequestsFn = async () => {
        const targetUrlExpressions = requests
          .filter((r) => r.name !== 'first')
          .map((r) => r.url)
          .filter(Boolean);
        if (!targetUrlExpressions.length) {
          return;
        }
        await chrome.scripting.executeScript({
          target: {
            tabId: dataSourcePageTabId,
          },
          args: [targetUrlExpressions],
          func: async (expressions) => {
            const normalizeLiteralUrl = (expression) => {
              let value = String(expression || '').trim();
              value = value.replace(/\(\?:\\\?\.\*\)\?\$$/, '');
              value = value.replace(/\$$/, '');
              value = value.replace(/\\\./g, '.');
              value = value.replace(/\\\//g, '/');
              if (
                /^https?:\/\//.test(value) &&
                !/[()[\]{}|+*?^$]/.test(value)
              ) {
                return value;
              }
              return '';
            };
            const matchesExpression = (url, expression) => {
              const literalUrl = normalizeLiteralUrl(expression);
              if (literalUrl) {
                return url === literalUrl || url.startsWith(`${literalUrl}?`);
              }
              try {
                return new RegExp(`^${expression}`).test(url);
              } catch {
                return url === expression || url.startsWith(`${expression}?`);
              }
            };
            await new Promise((resolve) => setTimeout(resolve, 1500));
            const resources = performance
              .getEntriesByType('resource')
              .map((entry) => entry.name)
              .filter((url) => /^https?:\/\//.test(url));
            const urls = expressions
              .map((expression) => {
                const literalUrl = normalizeLiteralUrl(expression);
                if (literalUrl) {
                  return literalUrl;
                }
                return [...resources]
                  .reverse()
                  .find((url) => matchesExpression(url, expression));
              })
              .filter((url, index, arr) => url && arr.indexOf(url) === index);
            for (const url of urls) {
              try {
                await fetch(url, {
                  credentials: 'include',
                  cache: 'no-store',
                });
              } catch {}
            }
          },
        });
      };

      checkWebRequestIsReadyFn();
      chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
        if (
          tabId === dataSourcePageTabId &&
          (changeInfo.url || changeInfo.title)
        ) {
          await injectFn();
          checkWebRequestIsReadyFn();
        }
      });

      chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
        if (tabId === dataSourcePageTabId) {
          chrome.runtime.sendMessage({
            type: 'pageDecode',
            // name: 'abortAttest',
            name: 'stop',
          });
          dataSourcePageTabId = null;
          handlerForSdk(processAlgorithmReq, 'cancel');
          chrome.webRequest.onBeforeSendHeaders.removeListener(
            onBeforeSendHeadersFn
          );
          chrome.webRequest.onBeforeRequest.removeListener(onBeforeRequestFn);
          chrome.webRequest.onCompleted.removeListener(onCompletedFn);
        }
      });
      if (reloadExistingDataSourcePage) {
        await injectFn();
        await triggerExistingDataSourceRequestsFn();
      } else {
        await injectFn();
      }
    }
    if (name === 'initCompleted') {
      console.log('content_scripts-bg-decode receive:initCompleted');
      sendResponse({
        name: 'append',
        params: {
          ...activeTemplate,
          PADOSERVERURL,
          padoExtensionVersion,
          PRE_ATTEST_PROMOT_V2,
          tabId: dataSourcePageTabId,
        },
        dataSourcePageTabId: dataSourcePageTabId,
        isReady: isReadyRequest,
        operation: operationType,
      });
      checkWebRequestIsReadyFn();
    }
    if (name === 'start') {
      await startPageDecodeAttestationFn();
      // if (!activeTemplate.sdkVersion) {
      //   const { constructorF } = DATASOURCEMAP[dataSource];
      //   if (constructorF) {
      //     const ex = new constructorF();
      //     // const storageRes = await chrome.storage.local.get([dataSource]);
      //     // const hadConnectedCurrDataSource = !!storageRes[dataSource];
      //     await storeDataSource(dataSource, ex, port, {
      //       withoutMsg: true,
      //       attestationRequestid: aligorithmParams.requestid,
      //     });
      //   }
      // }
    }

    if (name === 'close' || name === 'cancel') {
      chandleClose(params, processAlgorithmReq);
    }
    if (name === 'end') {
      handleEnd(request);
    }
    if (name === 'interceptionFail') {
      handle00013();
    }
    if (name === 'dataSourcePageDialogTimeout') {
      handleDataSourcePageDialogTimeout(processAlgorithmReq);
    }
  } else {
    if (name === 'close' || name === 'cancel') {
      chandleClose(params, processAlgorithmReq);
    }
    if (name === 'interceptionFail') {
      handle00013();
    }
    if (name === 'dataSourcePageDialogTimeout') {
      handleDataSourcePageDialogTimeout(processAlgorithmReq);
    }
    if (name === 'end') {
      handleEnd(request);
    }
  }
};

const handleEnd = (request) => {
  if (dataSourcePageTabId) {
    sendMsgToDataSourcePage(request);
    chrome.webRequest.onBeforeSendHeaders.removeListener(onBeforeSendHeadersFn);
    chrome.webRequest.onBeforeRequest.removeListener(onBeforeRequestFn);
    chrome.webRequest.onCompleted.removeListener(onCompletedFn);
    resetVarsFn();
  }
};
const chandleClose = async (params, processAlgorithmReq) => {
  console.log('pageDecode-close');
  const deleteTabId = params?.tabId || dataSourcePageTabId;
  console.log('pageDecode-close-tabId', params?.tabId, dataSourcePageTabId);
  if (deleteTabId) {
    try {
      await chrome.tabs.remove(deleteTabId);
    } catch (e) {
      console.log('chrome.tabs.remove error:', error);
    }
  }
  console.log('pageDecode-close-currExtentionId', currExtentionId);
  try {
    if (currExtentionId) {
      await chrome.tabs.update(currExtentionId, {
        active: true,
      });
    }
  } catch (error) {
    console.log('chrome.tabs.update error:', error);
  }

  resetVarsFn();
  handlerForSdk(processAlgorithmReq, 'cancel');
};
