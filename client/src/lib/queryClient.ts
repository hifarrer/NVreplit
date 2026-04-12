import { QueryClient, QueryFunction } from "@tanstack/react-query";

/** Set after QueryClient construction so getQueryFn can resolve 304 without a JSON body. */
let queryClientSingleton: QueryClient | undefined;

interface ApiError extends Error {
  isLimitError?: boolean;
  status?: number;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let errorMessage = res.statusText;
    let isLimitError = false;
    
    try {
      const errorData = await res.json();
      errorMessage = errorData.details || errorData.message || errorData.error || res.statusText;
      isLimitError = errorData.isLimitError === true;
    } catch {
      const text = await res.text().catch(() => res.statusText);
      errorMessage = text || res.statusText;
    }
    
    const error: ApiError = new Error(errorMessage);
    error.isLimitError = isLimitError;
    error.status = res.status;
    throw error;
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  options?: { timeout?: number },
): Promise<Response> {
  const headers: Record<string, string> = {};
  
  // Only set Content-Type for JSON data, not for FormData
  const isFormData = data instanceof FormData;
  if (data && !isFormData) {
    headers["Content-Type"] = "application/json";
  }
  
  // Include auth token if available
  const token = localStorage.getItem('auth_token');
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Create an AbortController for timeout support
  const controller = new AbortController();
  const timeout = options?.timeout || 900000; // Default to 15 minutes (900000ms)
  
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeout);

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: data ? (isFormData ? data : JSON.stringify(data)) : undefined,
      credentials: "include",
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timeoutId);
    await throwIfResNotOk(res);
    return res;
  } catch (error) {
    clearTimeout(timeoutId);
    if ((error as Error).name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
    }
    throw error;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";

export function getQueryFn<T>(options: {
  on401: UnauthorizedBehavior;
}): QueryFunction<T> {
  const { on401: unauthorizedBehavior } = options;
  return async ({ queryKey }): Promise<T> => {
    const headers: Record<string, string> = {};

    const token = localStorage.getItem("auth_token");
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(queryKey.join("/") as string, {
      headers,
      credentials: "include",
      cache: "no-store",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null as T;
    }

    // 304 has no body; prefer prior successful cache if present (belt-and-suspenders with etag disabled).
    if (res.status === 304) {
      const prev = queryClientSingleton?.getQueryData(queryKey);
      if (prev !== undefined) return prev as T;
    }

    await throwIfResNotOk(res);
    return (await res.json()) as T;
  };
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

queryClientSingleton = queryClient;
