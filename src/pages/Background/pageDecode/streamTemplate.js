export const STREAM_RESPONSE_VALUE_TYPE = 'STREAM';
export const STREAM_REVEAL_OP = 'REVEAL_HEX_STRING';

export function isStreamResponseValueType(valueType) {
  return String(valueType || '').toUpperCase() === STREAM_RESPONSE_VALUE_TYPE;
}

export function responseTemplateIndicatesStream(responseTemplate) {
  if (!Array.isArray(responseTemplate)) {
    return false;
  }
  return responseTemplate.some((rt) => isStreamResponseValueType(rt?.valueType));
}
