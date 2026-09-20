export type ApiResult<T = { redirect?: string }> =
  | { ok: true; data: T }
  | { ok: false; error: string; fields: Record<string, string> };

async function parse<T>(res: Response): Promise<ApiResult<T>> {
  const body = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, data: body as T };
  return { ok: false, error: body.error ?? "Something went wrong. Please try again.", fields: body.fields ?? {} };
}

export async function postJson<T = { redirect?: string }>(url: string, payload: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await parse<T>(res);
  } catch {
    return { ok: false, error: "Network error. Please try again.", fields: {} };
  }
}

export async function postForm<T = { redirect?: string }>(url: string, form: FormData): Promise<ApiResult<T>> {
  try {
    return await parse<T>(await fetch(url, { method: "POST", body: form }));
  } catch {
    return { ok: false, error: "Network error. Please try again.", fields: {} };
  }
}
