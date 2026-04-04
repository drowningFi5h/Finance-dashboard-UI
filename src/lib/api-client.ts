import type {
  AuthUser,
  DashboardSummary,
  FinancialRecord,
  LoginPayload,
  RecordStatus,
  RecordType,
  RecordsMeta
} from "@/types/finance";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "http://localhost:4000/api";

type ApiErrorPayload = {
  code: string;
  message: string;
  details?: unknown;
};

type ApiEnvelope<T> = {
  success: boolean;
  message?: string;
  data?: T;
  meta?: unknown;
  error?: ApiErrorPayload;
};

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  token?: string | null;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
};

export class ApiRequestError extends Error {
  statusCode: number;
  errorCode: string;
  details?: unknown;

  constructor(statusCode: number, errorCode: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiRequestError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
  }
}

function toQueryString(query: RequestOptions["query"]): string {
  if (!query) {
    return "";
  }

  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === "") {
      continue;
    }
    params.set(key, String(value));
  }

  const result = params.toString();
  return result ? `?${result}` : "";
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiEnvelope<T>> {
  const queryString = toQueryString(options.query);
  const response = await fetch(`${API_BASE_URL}${path}${queryString}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  let payload: ApiEnvelope<T> | null = null;

  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.success) {
    throw new ApiRequestError(
      response.status,
      payload?.error?.code ?? "REQUEST_FAILED",
      payload?.error?.message ?? "Request failed",
      payload?.error?.details
    );
  }

  return payload;
}

export function getFriendlyError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong";
}

export function isUnauthorizedError(error: unknown): boolean {
  return error instanceof ApiRequestError && error.statusCode === 401;
}

export async function login(email: string, password: string): Promise<LoginPayload> {
  const payload = await request<LoginPayload>("/auth/login", {
    method: "POST",
    body: { email, password }
  });

  return payload.data as LoginPayload;
}

export async function logout(token: string): Promise<void> {
  await request<void>("/auth/logout", {
    method: "POST",
    token
  });
}

export async function fetchMe(token: string): Promise<AuthUser> {
  const payload = await request<AuthUser>("/auth/me", {
    token
  });

  return payload.data as AuthUser;
}

export async function fetchDashboardSummary(token: string): Promise<DashboardSummary> {
  const payload = await request<DashboardSummary>("/dashboard/summary", {
    token
  });

  return payload.data as DashboardSummary;
}

export type RecordsQuery = {
  page: number;
  limit: number;
  type: "all" | RecordType;
  category: string;
  dateFrom: string;
  dateTo: string;
  status: "all" | RecordStatus;
};

export async function fetchRecords(token: string, query: RecordsQuery): Promise<{
  data: FinancialRecord[];
  meta: RecordsMeta;
}> {
  const payload = await request<FinancialRecord[]>("/records", {
    token,
    query: {
      page: query.page,
      limit: query.limit,
      type: query.type === "all" ? undefined : query.type,
      category: query.category || undefined,
      dateFrom: query.dateFrom || undefined,
      dateTo: query.dateTo || undefined,
      status: query.status === "all" ? undefined : query.status
    }
  });

  return {
    data: (payload.data ?? []) as FinancialRecord[],
    meta: payload.meta as RecordsMeta
  };
}

export type CreateRecordInput = {
  amount: number;
  type: RecordType;
  category: string;
  entryDate: string;
  notes?: string;
};

export async function createRecord(token: string, input: CreateRecordInput): Promise<FinancialRecord> {
  const payload = await request<FinancialRecord>("/records", {
    method: "POST",
    token,
    body: input
  });

  return payload.data as FinancialRecord;
}

export async function revertRecord(token: string, recordId: string, reason?: string): Promise<void> {
  await request<void>(`/records/${recordId}/revert`, {
    method: "POST",
    token,
    body: { reason: reason || undefined }
  });
}

export async function deleteRecord(token: string, recordId: string): Promise<void> {
  await request<void>(`/records/${recordId}`, {
    method: "DELETE",
    token
  });
}
