import { SCROLLEVENTNAME, BASEVENTNAME } from '@/config/events';
import { schemaTypeMap } from '@/config/constants';
import { CredVersion } from '@/config/attestation';
import { getPadoUrl, getProxyUrl, getZkPadoUrl } from '@/config/envConstants';
import { strToHex } from '@/utils/utils';

// Assemble parameters shared by the legacy template flow. Platform-specific
// account signing and credential storage intentionally live outside this fork.
export async function assembleAlgorithmParams(form) {
  const {
    source,
    type,
    baseValue,
    token: holdingToken,
    label,
    exUserId,
    requestid: previousRequestId,
    event,
    algorithmType = 'proxytls',
    cipher,
  } = form;
  const user = await assembleUserInfoParams(form);
  const { userInfo } = await chrome.storage.local.get(['userInfo']);
  const { id: authUserId } = JSON.parse(userInfo);
  const timestamp = Date.now().toString();
  const padoUrl = await getPadoUrl();
  const proxyUrl = await getProxyUrl();
  const zkPadoUrl = await getZkPadoUrl();
  const params = {
    type,
    label,
    exUserId,
    source,
    requestid: previousRequestId || timestamp,
    padoUrl: algorithmType === 'proxytls' ? zkPadoUrl : padoUrl,
    modelType: algorithmType,
    proxyUrl,
    errLogUrl: 'wss://api.padolabs.org/logs',
    cipher: cipher || '',
    getdatatime: timestamp,
    credVersion: CredVersion,
    sigFormat: 'EAS-Ethereum',
    schemaType: schemaTypeMap[type],
    user,
    authUseridHash: strToHex(authUserId),
    event,
    setHostName: 'true',
    hasFirstReq: 'true',
    ext: { event },
  };

  if (type === 'ASSETS_PROOF') {
    params.baseValue = baseValue;
  } else if (type === 'TOKEN_HOLDINGS') {
    params.baseValue = '0';
    params.holdingToken = holdingToken;
  }
  if (baseValue) {
    params.baseValue = baseValue;
  }
  return params;
}

export async function assembleAlgorithmParamsForSDK(form, ext) {
  const {
    dataSource,
    algorithmType = 'proxytls',
    requestid: previousRequestId,
    sslCipherSuite,
    allJsonResponseFlag,
  } = form;
  const user = await assembleUserInfoParams({}, true);
  const { userInfo } = await chrome.storage.local.get(['userInfo']);
  const { id: authUserId } = JSON.parse(userInfo);
  const timestamp = Date.now().toString();
  const padoUrl = await getPadoUrl();
  const proxyUrl = await getProxyUrl();
  const zkPadoUrl = await getZkPadoUrl();
  const appSignParameters = JSON.parse(ext.appSignParameters);
  let specialTask = '';
  if (appSignParameters?.computeMode === 'nonecomplete') {
    specialTask = 'CompleteHttpResponseCiphertext';
  } else if (appSignParameters?.computeMode === 'nonepartial') {
    specialTask = 'PartialHttpResponseCiphertext';
  }
  const params = {
    source: dataSource,
    requestid: previousRequestId || timestamp,
    padoUrl: algorithmType === 'proxytls' ? zkPadoUrl : padoUrl,
    modelType: algorithmType,
    proxyUrl,
    errLogUrl: 'wss://api.padolabs.org/logs',
    cipher: sslCipherSuite || '',
    getdatatime: timestamp,
    credVersion: CredVersion,
    user,
    authUseridHash: strToHex(authUserId),
    setHostName: 'true',
    appParameters: {
      appId: appSignParameters.appId,
      appSignParameters: ext.appSignParameters,
      appSignature: ext.appSignature,
      additionParams: appSignParameters.additionParams || '',
    },
    specialTask,
    getAllJsonResponse: allJsonResponseFlag === 'true' ? 'true' : 'false',
  };
  if (ext.padoUrl && ext.proxyUrl) {
    params.padoUrl = ext.padoUrl;
    params.proxyUrl = ext.proxyUrl;
  }
  return params;
}

async function assembleUserInfoParams(form, isFromSDK) {
  const { event } = form;
  const {
    connectedWalletAddress,
    userInfo,
    padoZKAttestationJSSDKWalletAddress,
  } = await chrome.storage.local.get([
    'connectedWalletAddress',
    'userInfo',
    'padoZKAttestationJSSDKWalletAddress',
  ]);
  let address;
  if (connectedWalletAddress) {
    address = JSON.parse(connectedWalletAddress).address;
  }
  if (event === SCROLLEVENTNAME) {
    const result = await chrome.storage.local.get([SCROLLEVENTNAME]);
    const eventState = result[SCROLLEVENTNAME]
      ? JSON.parse(result[SCROLLEVENTNAME])
      : {};
    address = eventState.address || address;
  } else if (event === BASEVENTNAME) {
    const result = await chrome.storage.local.get([BASEVENTNAME]);
    const eventState = result[BASEVENTNAME]
      ? JSON.parse(result[BASEVENTNAME])
      : {};
    address = eventState.address || address;
  }
  if (isFromSDK && padoZKAttestationJSSDKWalletAddress) {
    address = padoZKAttestationJSSDKWalletAddress;
  }
  const { id, token } = JSON.parse(userInfo);
  return { userid: id, address, token };
}
