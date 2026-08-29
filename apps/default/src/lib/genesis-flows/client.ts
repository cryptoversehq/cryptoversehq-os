/**
 * Genesis Flows SDK - trigger Taskade automations from a Genesis app, natively.
 *
 * Two entry points, both thin wrappers over gateway routes:
 * - `submitForm` -> a flow whose trigger is a FORM (a side effect the app cannot do itself,
 *                   e.g. handing an uploaded document to an OCR step)
 * - `runFlow`    -> a flow whose trigger is a WEBHOOK or MANUAL (fire an automation now)
 *
 * NEITHER is how an intake form saves its row. A contact / lead / survey submit persists with
 * `createNode` from `@/lib/genesis-data`, and NEVER also calls `submitForm` for the same submit -
 * if the flow behind that form has an Add Task step, every submission lands twice.
 *
 * Both return the created flow run id when available. A WEBHOOK flow that ends in an
 * "HTTP response" action returns its body synchronously; `runFlow` surfaces it only when
 * that response is a 2xx JSON body (flowRunId is then undefined). A non-2xx status or a
 * non-JSON synchronous body causes the underlying request to throw.
 */
import { gatewayRequest, isEmptyString } from '../genesis-gateway';
import type { ClientOptions, GatewayResponse } from '../genesis-gateway';

function isFileLike(value: unknown): value is Blob {
  return typeof Blob !== 'undefined' && value instanceof Blob;
}

/**
 * Builds the request body for a flow trigger.
 *
 * If any value is a `File`/`Blob` (a user-uploaded document or photo), sends
 * `multipart/form-data` so the gateway uploads each file to Taskade media and
 * hands the flow a real `https://files.taskade.com/...` URL. That URL is what the
 * Media pieces need - `pdf.convertToText` / `convertMediaToProject` derive a media
 * key from it. NEVER inline a base64 `data:` URL into a JSON field: those actions
 * reject it as "Invalid URL", so the file is never read. With no files, sends JSON
 * exactly as before.
 */
function buildFlowBody(values: Record<string, unknown>): BodyInit {
  if (!Object.values(values).some(isFileLike)) {
    return JSON.stringify(values);
  }
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (value == null) {
      continue;
    }
    if (isFileLike(value)) {
      // Field name = the flow input key the Media step reads (e.g. the trigger's
      // file field). File parts are replaced server-side with a media URL.
      const filename = typeof File !== 'undefined' && value instanceof File ? value.name : key;
      formData.append(key, value, filename);
    } else if (typeof value === 'object') {
      formData.append(key, JSON.stringify(value));
    } else {
      formData.append(key, String(value));
    }
  }
  return formData;
}

/**
 * Submits values to a FORM-trigger flow, for a side effect the app cannot perform
 * itself. Values are keyed by the form's input names.
 *
 * NOT for saving an intake row: a contact / lead / survey submit calls `createNode`
 * instead, and calling both for one submit writes the row twice.
 *
 * To send an uploaded document or photo, pass the `File` object directly (do NOT
 * read it into a base64 `data:` URL) - it is uploaded to media and the flow input
 * receives a real `https://files.taskade.com/...` URL for a `pdf.convertToText` step.
 *
 * @example
 * ```typescript
 * // With a file (e.g. from an <input type="file">):
 * await submitForm('flow-123', { document: fileInput.files[0], title: 'Contract' });
 * ```
 */
export async function submitForm(
  flowId: string,
  values: Record<string, unknown>,
  options?: ClientOptions,
): Promise<{ flowRunId?: string }> {
  if (isEmptyString(flowId)) {
    throw new Error('Flow ID cannot be empty');
  }
  const data = await gatewayRequest<GatewayResponse<{ flowRunId: string }>>(
    `/forms/${encodeURIComponent(flowId)}/run`,
    { method: 'POST', body: buildFlowBody(values) },
    options,
  );
  return { flowRunId: data.payload?.flowRunId };
}

/**
 * Triggers a WEBHOOK- or MANUAL-trigger flow with an optional input payload.
 *
 * Like `submitForm`, pass a `File` value to upload a document/photo - it becomes a
 * real media URL for the flow (never inline a base64 `data:` URL).
 *
 * @example
 * ```typescript
 * await runFlow('flow-456', { orderId: '789', action: 'refund' });
 * ```
 */
export async function runFlow(
  flowId: string,
  input?: Record<string, unknown>,
  options?: ClientOptions,
): Promise<{ flowRunId?: string }> {
  if (isEmptyString(flowId)) {
    throw new Error('Flow ID cannot be empty');
  }
  const data = await gatewayRequest<GatewayResponse<{ flowRunId: string }>>(
    `/webhooks/${encodeURIComponent(flowId)}/run`,
    { method: 'POST', body: buildFlowBody(input ?? {}) },
    options,
  );
  return { flowRunId: data.payload?.flowRunId };
}
