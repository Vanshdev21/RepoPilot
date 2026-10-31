async function githubApi(path, token, options = {}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'RepoPilot/1.0',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const request = {
    method: options.method || 'GET',
    headers: { ...headers, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
  };
  if (options.body) request.body = JSON.stringify(options.body);
  const response = await fetch(`https://api.github.com${path}`, request);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || `GitHub ${response.status}: ${response.statusText}`);
    error.status = response.status;
    error.code = response.status === 401 ? 'GITHUB_UNAUTHORIZED' : response.status === 403 ? 'GITHUB_FORBIDDEN' : 'GITHUB_UPSTREAM_ERROR';
    throw error;
  }
  return body;
}

function parseRepositoryUrl(value) {
  const input = String(value || '').trim().replace(/\/$/, '').replace(/\.git$/, '');
  if (!input) return null;
  try {
    if (input.includes('github.com')) {
      const parsed = new URL(input.includes('://') ? input : `https://${input}`);
      if (parsed.hostname !== 'github.com') return null;
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts.length < 2) return null;
      return { owner: parts[0], name: parts[1] };
    }
    const [owner, name] = input.split('/');
    if (owner && name && !input.includes('/')) return { owner, name };
    if (owner && name && input.split('/').length === 2) return { owner, name };
  } catch (_) {}
  return null;
}

module.exports = { githubApi, parseRepositoryUrl };
