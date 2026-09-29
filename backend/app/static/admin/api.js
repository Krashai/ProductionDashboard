// Klient REST backendu. Token administratora w sessionStorage (znika z
// końcem sesji karty — ważne na współdzielonych stanowiskach), błędy jako
// polskie komunikaty do pokazania przy formularzu.

const TOKEN_KEY = 'adminToken';

export class ApiError extends Error {
  constructor(message, status, body = null) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export function getToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* tryb prywatny bez storage — token zostaje tylko w tej karcie do odświeżenia */
  }
}

export function clearToken() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* jw. */
  }
}

function messageFrom(status, body) {
  const detail = body?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length) {
    // 422 z Pydantic: komunikaty walidatorów backendu są po polsku,
    // prefiks "Value error, " jest techniczny.
    return detail.map((d) => String(d.msg ?? '').replace(/^Value error, /, '')).join(' ');
  }
  if (status === 404) return 'Nie znaleziono — ktoś mógł to właśnie usunąć. Odśwież stronę.';
  if (status >= 500) return 'Błąd serwera. Spróbuj ponownie; jeśli się powtarza, sprawdź logi backendu.';
  return `Błąd ${status}.`;
}

export async function api(path, { method = 'GET', body, auth = method !== 'GET', token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) headers['X-Admin-Token'] = token ?? getToken() ?? '';
  let resp;
  try {
    resp = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError('Brak połączenia z backendem.', 0);
  }
  if (resp.status === 401 && token === undefined) {
    clearToken();
    window.dispatchEvent(new CustomEvent('auth-required'));
    throw new ApiError('Sesja wygasła albo token jest nieprawidłowy — zaloguj się ponownie.', 401);
  }
  if (resp.status === 204) return null;
  const data = await resp.json().catch(() => null);
  if (!resp.ok) throw new ApiError(messageFrom(resp.status, data), resp.status, data);
  return data;
}
