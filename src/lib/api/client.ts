import type { ApiErrorBody, Collection, Resource } from "./contracts";

const configuredOrigin = process.env.NEXT_PUBLIC_API_ORIGIN?.trim();
const origin = (
  configuredOrigin ||
  (process.env.NODE_ENV === "development" ? "http://localhost:8080" : "")
).replace(/\/$/, "");
export const API_ORIGIN = origin;

export class ApiError extends Error {
  readonly receivedAt = Date.now();
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string,
    public fields?: ApiErrorBody["error"]["details"],
    public developerMessage?: string,
    public retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
  get kind() {
    if (this.status === 401) return "authentication";
    if (this.status === 403) return "authorization";
    if (this.status === 409) return "conflict";
    if (this.status === 400 || this.status === 422) return "validation";
    return this.status >= 500 ? "server" : "network";
  }
}

export function apiFieldError(
  error: unknown,
  field: string,
): string | undefined {
  if (!(error instanceof ApiError)) return undefined;
  return apiErrorFields(error).find((detail) => detail.field === field)
    ?.message;
}

export function apiErrorFields(error: ApiError) {
  const fields = error.fields?.fields;
  return Array.isArray(fields)
    ? fields.filter(
        (item) =>
          item &&
          typeof item.field === "string" &&
          typeof item.message === "string",
      )
    : [];
}

type Options = Omit<RequestInit, "body"> & {
  body?: unknown;
  core?: boolean;
  idempotencyKey?: string;
};

async function errorFromResponse(response: Response) {
  const json: unknown = await response.json().catch(() => null);
  const candidate = (json as Partial<ApiErrorBody> | null)?.error;
  const error =
    candidate && typeof candidate === "object" ? candidate : undefined;
  const retryAfter = response.headers.get("retry-after");
  const retrySeconds = retryAfter
    ? /^\d+$/.test(retryAfter)
      ? Number(retryAfter)
      : Math.max(0, Math.ceil((Date.parse(retryAfter) - Date.now()) / 1000))
    : undefined;
  return new ApiError(
    response.status,
    typeof error?.code === "string" ? error.code : "UNEXPECTED_RESPONSE",
    typeof error?.message === "string"
      ? error.message
      : "The request could not be completed.",
    typeof error?.requestId === "string"
      ? error.requestId
      : (response.headers.get("x-request-id") ?? undefined),
    error?.details,
    error?.developerMessage,
    retrySeconds !== undefined && Number.isFinite(retrySeconds)
      ? retrySeconds
      : undefined,
  );
}

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  if (!origin) {
    throw new ApiError(
      0,
      "API_ORIGIN_NOT_CONFIGURED",
      "The production Core API URL has not been configured.",
    );
  }
  const { body, core = true, idempotencyKey, headers, ...request } = options;
  const base = core ? `${origin}/api/v1/core` : origin;
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      ...request,
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      "Could not reach the Core API. Check the API origin and your connection.",
    );
  }
  if (response.status === 204) return undefined as T;
  if (!response.ok) throw await errorFromResponse(response);
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError(
      response.status,
      "UNEXPECTED_RESPONSE",
      "The API returned an unreadable response. Refresh to check the current server state.",
      response.headers.get("x-request-id") ?? undefined,
    );
  }
}

export async function apiBlob(path: string, signal?: AbortSignal) {
  if (!origin)
    throw new ApiError(
      0,
      "API_ORIGIN_NOT_CONFIGURED",
      "The production Core API URL has not been configured.",
    );
  let response: Response;
  try {
    response = await fetch(`${origin}/api/v1/core${path}`, {
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "text/csv" },
      signal,
    });
  } catch {
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      "Could not reach the Core API. Check the API origin and your connection.",
    );
  }
  if (!response.ok) throw await errorFromResponse(response);
  return {
    blob: await response.blob(),
    disposition: response.headers.get("Content-Disposition"),
  };
}

export function queryString(
  values: Record<string, string | number | undefined | null>,
) {
  const search = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "")
      search.set(key, String(value));
  });
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

export const getCollection = <T>(path: string, signal?: AbortSignal) =>
  api<Collection<T>>(path, { signal });
export const getResource = <T>(path: string, signal?: AbortSignal) =>
  api<Resource<T>>(path, { signal });
export const safeId = (id: string) => encodeURIComponent(id);
