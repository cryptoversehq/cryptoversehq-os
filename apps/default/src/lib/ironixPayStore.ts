/**
 * @deprecated IronixPay replaced by NOWPayments. This is a no-op shim.
 * See nowPaymentsClient.ts for the active payment integration.
 */
import { create } from 'zustand';

interface IPState {
  markCompleted: (_: any) => void;
  markFailed: (_: any) => void;
  pollPaymentStatus: (_: any) => Promise<void>;
  handleWebhookEvent: (_: any) => Promise<void>;
  getPaymentsByUser: (_: any) => any[];
}
export const useIronixPayStore = create<IPState>(() => ({
  markCompleted: () => {},
  markFailed: () => {},
  pollPaymentStatus: async () => {},
  handleWebhookEvent: async () => {},
  getPaymentsByUser: () => [],
}));
