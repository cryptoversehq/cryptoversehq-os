// @deprecated IronixPay replaced by NOWPayments. No-op shim.
export const PAYMENTS_PROJECT_ID = 'WV7KtefRFLpVEQKu';
export function toDecimalString(amountUSD: number): string { return amountUSD.toFixed(2); }
export function makeClientRef(userId: string, planId: string): string { return `${userId}_${planId}_${Date.now()}`; }
export async function recordPaymentToProject(_p: any): Promise<void> {}
export type CheckoutResult = { ok: true; session: any } | { ok: false; error: string };
