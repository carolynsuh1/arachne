export type ApiResult<T = { redirect?: string }> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; fields: Record<string, string>; body: Record<string, unknown> };

async function parse<T>(res: Response): Promise<ApiResult<T>> {
  const body = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, data: body as T };
  return {
    ok: false,
    status: res.status,
    error: body.error ?? "Something went wrong. Please try again.",
    fields: body.fields ?? {},
    body,
  };
}

const networkError = { ok: false, status: 0, error: "Network error. Please try again.", fields: {}, body: {} } as const;

export async function postJson<T = { redirect?: string }>(url: string, payload: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await parse<T>(res);
  } catch {
    return networkError;
  }
}

export async function getJson<T>(url: string): Promise<ApiResult<T>> {
  try {
    return await parse<T>(await fetch(url));
  } catch {
    return networkError;
  }
}

export async function patchJson<T = { ok: boolean }>(url: string, payload: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await parse<T>(res);
  } catch {
    return networkError;
  }
}

export async function postForm<T = { redirect?: string }>(url: string, form: FormData): Promise<ApiResult<T>> {
  try {
    return await parse<T>(await fetch(url, { method: "POST", body: form }));
  } catch {
    return networkError;
  }
}
