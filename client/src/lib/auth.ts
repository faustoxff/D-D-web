// Client for Neon Managed Better Auth (REST). The auth service lives on its own
// origin, so every call sends the session cookie with `credentials: "include"`.

const AUTH_URL = ((import.meta.env.VITE_NEON_AUTH_URL as string | undefined) ?? "").replace(/\/$/, "");

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

interface AuthError {
  code?: string;
  message?: string;
}

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Email o contraseña incorrectos.",
  USER_ALREADY_EXISTS: "Ya existe una cuenta con ese email.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Ya existe una cuenta con ese email.",
  PASSWORD_TOO_SHORT: "La contraseña es demasiado corta.",
  PASSWORD_TOO_LONG: "La contraseña es demasiado larga.",
  INVALID_EMAIL: "El email no es válido.",
};

function describe(error: AuthError | null, fallback: string): string {
  if (!error) return fallback;
  return (error.code && MESSAGES[error.code]) || error.message || fallback;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<{ ok: boolean; data: T | null; error: AuthError | null }> {
  if (!AUTH_URL) {
    return { ok: false, data: null, error: { message: "Falta VITE_NEON_AUTH_URL en client/.env" } };
  }
  try {
    const res = await fetch(`${AUTH_URL}${path}`, {
      credentials: "include",
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    const body = (await res.json().catch(() => null)) as (T & AuthError) | null;
    return res.ok
      ? { ok: true, data: body, error: null }
      : { ok: false, data: null, error: body ?? { message: `Error ${res.status}` } };
  } catch {
    return { ok: false, data: null, error: { message: "No se pudo contactar el servicio de login." } };
  }
}

export async function signUpEmail(email: string, password: string): Promise<string | null> {
  const { ok, error } = await call("/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ email, password, name: email.split("@")[0] || "Aventurero" }),
  });
  return ok ? null : describe(error, "No se pudo crear la cuenta.");
}

export async function signInEmail(email: string, password: string): Promise<string | null> {
  const { ok, error } = await call("/sign-in/email", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return ok ? null : describe(error, "No se pudo iniciar sesión.");
}

export async function signOutRemote(): Promise<void> {
  await call("/sign-out", { method: "POST", body: "{}" });
  clearAccessToken();
}

export async function fetchSessionUser(): Promise<AuthUser | null> {
  const { ok, data } = await call<{ user?: AuthUser; session?: unknown } | null>("/get-session");
  const user = ok ? data?.user : null;
  return user && data?.session ? { id: user.id, email: user.email, name: user.name } : null;
}

// ── Access tokens for our own API / game server ─────────────────────────

interface CachedToken {
  token: string;
  /** Seconds since epoch, read from the JWT payload. */
  exp: number;
}

let cached: CachedToken | null = null;
let inflight: Promise<string | null> | null = null;

function readExp(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
    return payload.exp ?? 0;
  } catch {
    return 0;
  }
}

/** A JWT for our servers. They last 15 minutes; this refreshes one minute early. */
export async function getAccessToken(): Promise<string | null> {
  const now = Date.now() / 1000;
  if (cached && cached.exp - 60 > now) return cached.token;

  inflight ??= (async () => {
    try {
      const { ok, data } = await call<{ token?: string }>("/token");
      const token = ok ? data?.token : undefined;
      if (!token) {
        cached = null;
        return null;
      }
      cached = { token, exp: readExp(token) };
      return token;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function clearAccessToken() {
  cached = null;
}

/** fetch() with the signed-in user's JWT attached. */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  if (!token) return new Response(JSON.stringify({ message: "Not signed in" }), { status: 401 });
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
