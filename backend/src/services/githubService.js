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

function parseRepositoryUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'github.com') return null;
    const [, owner, name] = parsed.pathname.split('/');
    if (!owner || !name) return null;
    return { owner, name: name.replace(/\.git$/, '') };
  } catch (_) {
    return null;
  }
}

module.exports = { githubApi, parseRepositoryUrl };
