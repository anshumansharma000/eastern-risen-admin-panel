import { api, getResource, safeId } from "@/lib/api/client";
import type {
  PaymentReviewCase,
  PaymentResolutionEnvelope,
  ResolutionInput,
} from "./contracts";

export const paymentReviewApi = {
  inspect: (orderId: string, signal?: AbortSignal) =>
    getResource<PaymentReviewCase>(
      `/payment-orders/${safeId(orderId)}/review`,
      signal,
    ),
  resolve: (attemptId: string, body: ResolutionInput, key: string) =>
    api<PaymentResolutionEnvelope>(
      `/payment-attempts/${safeId(attemptId)}/resolve`,
      { method: "POST", body, idempotencyKey: key },
    ),
  reconcile: (orderId: string) =>
    api(`/payment-orders/${safeId(orderId)}/reconcile-by-id`, {
      method: "POST",
    }),
};
