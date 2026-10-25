const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export const hasApiConnection = Boolean(API_BASE);

export function resolveApiUrl(path) {
  if (!path) return path;
  if (/^(https?:|blob:|data:)/i.test(path)) return path;
  return `${API_BASE}${path}`;
}

async function request(path, options = {}) {
  const response = await fetch(resolveApiUrl(path), {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      'X-User-Id': 'local-user',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      detail = body.detail || detail;
    } catch {
      // Keep the status message when the server returned non-JSON content.
    }
    throw new Error(detail);
  }

  if (response.status === 204) return null;
  return response.json();
}

export function saveProjectToApi(project) {
  return request('/api/projects', {
    method: 'POST',
    body: JSON.stringify(project),
  });
}

export function uploadImageToApi(file) {
  const body = new FormData();
  body.append('file', file);
  return request('/api/uploads', { method: 'POST', body });
}
