/**
 * Genesis Flows SDK
 *
 * Trigger Taskade automations from a Genesis app - fire a form/webhook/manual flow for a
 * side effect the app cannot do itself. No iframe, no widget.
 *
 * An intake form does NOT save its row here: use `createNode` from `@/lib/genesis-data`,
 * and never call both for one submit (that writes the row twice).
 *
 * @example
 * ```typescript
 * import { submitForm, runFlow } from '@/lib/genesis-flows';
 *
 * // Fire an automation now -> WEBHOOK/MANUAL-trigger flow
 * await runFlow(refundFlowId, { orderId, amount });
 *
 * // Upload a document/photo for the flow to read: pass the raw File (NOT a base64
 * // data: URL). It becomes a https://files.taskade.com URL a `Convert File to Text`
 * // step can OCR.
 * await submitForm(processDocFlowId, { file, title: file.name });
 * ```
 */
export { submitForm, runFlow } from './client';
export type { ClientOptions } from '../genesis-gateway';
