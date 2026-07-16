/**
 * Discriminant values for the Agent SDK's `system` messages (main-process only —
 * these mirror `SDKMessage`'s `subtype` field on `type: 'system'` members). Named
 * so the `handleSdkMessage` dispatch reads off enum members instead of scattered
 * wire strings; the string values must stay byte-identical to the SDK's, and
 * comparing `message.subtype === SdkSystemSubtype.X` narrows the SDK union.
 */

/** `subtype` values FlowState handles on the SDK's `type: 'system'` messages. */
export enum SdkSystemSubtype {
  Init = 'init',
  CommandsChanged = 'commands_changed',
  SessionStateChanged = 'session_state_changed',
  ApiRetry = 'api_retry',
}
