export class ApiV1Error extends Error {
  readonly status: number;
  readonly data: unknown;

  constructor(status: number, data: unknown) {
    const message = typeof data === "object" && data && "error" in data
      ? String((data as { error: unknown }).error)
      : `API request failed with status ${status}`;
    super(message);
    this.name = "ApiV1Error";
    this.status = status;
    this.data = data;
  }
}

async function parseResponse(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (!raw) {
    return {};
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(raw);
    } catch {
      return { raw };
    }
  }

  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

export async function callApiV1(options: {
  baseUrl: string;
  token: string;
  method: "GET" | "POST";
  path: string;
  body?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const response = await fetch(`${options.baseUrl}${options.path}`, {
    method: options.method,
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "Authorization": `Bearer ${options.token}`,
    },
    body: options.method === "POST" ? JSON.stringify(options.body ?? {}) : undefined,
  });

  const data = await parseResponse(response);
  if (!response.ok) {
    throw new ApiV1Error(response.status, data);
  }

  return typeof data === "object" && data !== null
    ? data as Record<string, unknown>
    : { value: data };
}
