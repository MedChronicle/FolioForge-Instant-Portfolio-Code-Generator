const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const USER_ID = import.meta.env.VITE_USER_ID || 'local-user';
const DEFAULT_TIMEOUT_MS = 15_000;
const UPLOAD_TIMEOUT_MS = 60_000;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'PUT', 'DELETE']);
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export const hasApiConnection = Boolean(API_BASE);

export function resolveApiUrl(path) {
  if (!path) return path;
  if (/^(https?:|blob:|data:)/i.test(path)) return path;
  return `${API_BASE}${path}`;
}

/** Structured error so the UI can branch on status/code instead of parsing strings. */
export class ApiError extends Error {
  constructor(message, { status = 0, code = 'unknown', data = null, cause } = {}) {
    super(message, { cause });
    this.name = 'ApiError';
    this.status = status;
    this.code = code; // 'http' | 'network' | 'timeout' | 'aborted' | 'validation' | 'parse'
    this.data = data;
  }

  get isRetryable() {
    return this.code === 'network' || this.code === 'timeout' || RETRYABLE_STATUS.has(this.status);
  }
}

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(id);
        reject(new ApiError('Request aborted', { code: 'aborted' }));
      },
      { once: true },
    );
  });

/** Exponential backoff with jitter; honours Retry-After when the server sends it. */
function backoffDelay(attempt, retryAfterHeader) {
  const retryAfter = Number(retryAfterHeader);
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1000, 10_000);
  return Math.min(300 * 2 ** attempt, 4000) * (0.5 + Math.random() / 2);
}

async function parseBody(response) {
  if (response.status === 204) return null;
  const type = response.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    try {
      return await response.json();
    } catch (cause) {
      throw new ApiError('Server returned invalid JSON', { status: response.status, code: 'parse', cause });
    }
  }
  return response.text();
}

function errorDetail(data, status) {
  if (data && typeof data === 'object') {
    // FastAPI-style: detail may be a string or a list of validation errors.
    if (typeof data.detail === 'string') return data.detail;
    if (Array.isArray(data.detail)) return data.detail.map((d) => d.msg).filter(Boolean).join('; ');
    if (data.message) return data.message;
  }
  return `Request failed (${status})`;
}

async function attempt(path, { timeout, signal, ...options }) {
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener('abort', onExternalAbort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeout);

  try {
    const response = await fetch(resolveApiUrl(path), {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options.body instanceof FormData || options.body == null
          ? {}
          : { 'Content-Type': 'application/json' }),
        'X-User-Id': USER_ID,
        ...(options.headers || {}),
      },
    });

    const data = await parseBody(response);
    if (!response.ok) {
      const error = new ApiError(errorDetail(data, response.status), {
        status: response.status,
        code: 'http',
        data,
      });
      error.retryAfter = response.headers.get('retry-after');
      throw error;
    }
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error.name === 'AbortError') {
      throw new ApiError(timedOut ? 'Request timed out' : 'Request aborted', {
        code: timedOut ? 'timeout' : 'aborted',
        cause: error,
      });
    }
    throw new ApiError('Network error. Check your connection.', { code: 'network', cause: error });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onExternalAbort);
  }
}

/**
 * Core request helper.
 * options: standard fetch options plus
 *   timeout (ms), signal (AbortSignal), retries (number),
 *   retryNonIdempotent (bool) to allow retrying POST/PATCH.
 */
export async function request(path, options = {}) {
  if (!hasApiConnection) {
    throw new ApiError('API is not configured (set VITE_API_URL)', { code: 'network' });
  }

  const { retries = 2, retryNonIdempotent = false, timeout = DEFAULT_TIMEOUT_MS, ...rest } = options;
  const method = (rest.method || 'GET').toUpperCase();
  const canRetry = IDEMPOTENT_METHODS.has(method) || retryNonIdempotent;

  for (let i = 0; ; i += 1) {
    try {
      return await attempt(path, { ...rest, method, timeout });
    } catch (error) {
      const exhausted = i >= retries;
      if (!canRetry || exhausted || !error.isRetryable) throw error;
      await sleep(backoffDelay(i, error.retryAfter), rest.signal);
    }
  }
}

export function saveProjectToApi(project, { signal } = {}) {
  return request('/api/projects', {
    method: 'POST',
    body: JSON.stringify(project),
    signal,
    // Lets a backend that supports it dedupe a retried save.
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    retryNonIdempotent: true,
  });
}

export function validateImageFile(file) {
  if (!(file instanceof File)) {
    throw new ApiError('No file provided', { code: 'validation' });
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new ApiError(`Unsupported file type: ${file.type || 'unknown'}`, { code: 'validation' });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = (MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(0);
    throw new ApiError(`Image is too large (max ${mb} MB)`, { code: 'validation' });
  }
}

/**
 * Upload an image. Pass onProgress(0..1) to get real upload progress
 * (fetch can't report upload progress, so this path uses XMLHttpRequest).
 */
export function uploadImageToApi(file, { onProgress, signal } = {}) {
  validateImageFile(file);
  const body = new FormData();
  body.append('file', file);

  if (!onProgress) {
    return request('/api/uploads', { method: 'POST', body, signal, timeout: UPLOAD_TIMEOUT_MS, retries: 0 });
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', resolveApiUrl('/api/uploads'));
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('X-User-Id', USER_ID);
    xhr.timeout = UPLOAD_TIMEOUT_MS;

    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON body */
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data);
      reject(new ApiError(errorDetail(data, xhr.status), { status: xhr.status, code: 'http', data }));
    };
    xhr.onerror = () => reject(new ApiError('Network error. Check your connection.', { code: 'network' }));
    xhr.ontimeout = () => reject(new ApiError('Upload timed out', { code: 'timeout' }));
    xhr.onabort = () => reject(new ApiError('Upload aborted', { code: 'aborted' }));
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });

    xhr.send(body);
  });
}
