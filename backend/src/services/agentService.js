const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

async function runCommand(command, args, options = {}) {
  try {
    const result = await execFileAsync(command, args, { ...options, timeout: 120000, maxBuffer: 5 * 1024 * 1024 });
    return { exitCode: 0, output: `${result.stdout || ''}${result.stderr || ''}` };
  } catch (error) {
    return { exitCode: error.code || 1, output: `${error.stdout || ''}${error.stderr || ''}${error.message || ''}` };
  }
}

async function getGeminiAnalysis(issue, files, repository) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const prompt = `You are a senior software engineer fixing a GitHub issue. Respond with valid JSON only.
Repository: ${repository.fullName}
Issue #${issue.number}: ${issue.title}
Description: ${issue.body || 'No description'}
Relevant repository files and contents:
${files.map(file => `FILE ${file.path}\n${file.content.slice(0, 16000)}`).join('\n\n')}
Return JSON with keys: classification, summary, rootCause, relevantFiles, proposedFix, patch, testCommand.
classification must be bug, feature, documentation, enhancement, question, or other.
patch must be a unified git diff that can be applied. Every changed file must be listed in relevantFiles. testCommand should be a safe package script such as npm test -- --runInBand, npm test, or true.`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, responseMimeType: 'application/json' } })
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || 'Gemini API request failed');
  const text = body.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '{}';
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
  return JSON.parse(cleaned);
}

async function loadRepositoryContext(repository, issue, githubToken) {
  const headers = { 'User-Agent': 'RepoPilot/1.0', Accept: 'application/vnd.github+json' };
  if (githubToken) headers.Authorization = "Bearer " + githubToken;
  const treeResponse = await fetch(`https://api.github.com/repos/${repository.fullName}/git/trees/${encodeURIComponent(repository.defaultBranch)}?recursive=1`, { headers });
  if (!treeResponse.ok) throw new Error('Could not retrieve repository tree');
  const tree = await treeResponse.json();
  const keywords = `${issue.title} ${issue.body || ''}`.toLowerCase().match(/[a-z][a-z0-9_-]{3,}/g) || [];
  const candidates = tree.tree.filter(item => item.type === 'blob' && /\.(js|jsx|ts|tsx|py|go|java|json)$/.test(item.path))
    .map(item => ({ ...item, score: keywords.filter(word => item.path.toLowerCase().includes(word)).length }))
    .filter(item => item.score > 0 || /(readme|package\.json|test|spec)/i.test(item.path))
    .sort((a, b) => b.score - a.score).slice(0, 10);
  const files = [];
  for (const item of candidates.slice(0, 6)) {
    const fileResponse = await fetch(`https://api.github.com/repos/${repository.fullName}/contents/${encodeURIComponent(item.path)}?ref=${encodeURIComponent(repository.defaultBranch)}`, { headers });
    if (!fileResponse.ok) continue;
    const file = await fileResponse.json();
    if (file.content && !file.content.includes('[base64')) {
      files.push({ path: item.path, content: Buffer.from(file.content, 'base64').toString('utf8').slice(0, 20000) });
    }
  }
  return files;
}

async function cloneAndTest(repository, patch, testCommand, githubToken) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'repopilot-'));
  const cloneArgs = ['-c', 'http.extraHeader=Accept-Encoding: gzip'];
  if (githubToken) cloneArgs.push("-c", "http.extraHeader=Authorization: Bearer " + githubToken);
  cloneArgs.push('clone', '--depth', '1', `https://github.com/${repository.fullName}.git`, workspace);
  const clone = await runCommand('git', cloneArgs);
  if (clone.exitCode !== 0) return { workspace, status: 'failed', exitCode: clone.exitCode, command: 'git clone', output: clone.output };
  const patchFile = path.join(workspace, '.repopilot.patch');
  await fs.writeFile(patchFile, patch.endsWith('\n') ? patch : `${patch}\n`);
  const apply = await runCommand('git', ['apply', '--check', patchFile], { cwd: workspace });
  if (apply.exitCode !== 0) return { workspace, status: 'failed', exitCode: apply.exitCode, command: 'git apply --check', output: apply.output };
  await runCommand('git', ['apply', patchFile], { cwd: workspace });
  await fs.rm(patchFile);
  const dockerImage = repository.primaryLanguage === 'Python' ? 'python:3.12-slim' : 'node:22-slim';
  const args = ['run', '--rm', '--network=none', '-v', `${workspace}:/workspace`, '-w', '/workspace', dockerImage, 'sh', '-c', testCommand];
  const test = await runCommand('docker', args);
  return { workspace, status: test.exitCode === 0 ? 'passed' : 'failed', exitCode: test.exitCode, command: testCommand, output: test.output.slice(-12000) };
}

async function publishToGitHub(repository, issue, workspace, relevantFiles, githubToken, baseCommitSha) {
  const headers = { Authorization: 'Bearer ' + githubToken, Accept: 'application/vnd.github+json', 'User-Agent': 'RepoPilot/1.0' };
  const files = [];
  for (const filePath of relevantFiles) {
    const safePath = path.resolve(workspace, filePath);
    if (!safePath.startsWith(path.resolve(workspace) + path.sep)) continue;
    files.push({ path: filePath, content: await fs.readFile(safePath, 'utf8') });
  }
  if (!files.length) throw new Error('The generated patch does not contain an uploadable text file change');

  const forkResponse = await fetch('https://api.github.com/user/repos', { method: 'POST', headers, body: JSON.stringify({ name: repository.name, private: false }) });
  if (!forkResponse.ok && forkResponse.status !== 422) throw new Error('Could not prepare repository fork');
  const forkData = forkResponse.ok ? await forkResponse.json() : null;
  const ownerResponse = await fetch('https://api.github.com/user', { headers });
  const owner = await ownerResponse.json();
  const forkFullName = forkData?.full_name || `${owner.login}/${repository.name}`;
  const branch = `repopilot/fix-${issue.number}-${Date.now()}`;
  await fetch(`https://api.github.com/repos/${forkFullName}/git/refs`, { method: 'POST', headers, body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseCommitSha }) });
  for (const file of files) {
    await fetch(`https://api.github.com/repos/${forkFullName}/contents/${encodeURIComponent(file.path)}`, { method: 'PUT', headers, body: JSON.stringify({ message: `Fix issue #${issue.number}: ${issue.title}`.slice(0, 80), content: Buffer.from(file.content).toString('base64'), branch }) });
  }
  const pullResponse = await fetch(`https://api.github.com/repos/${repository.fullName}/pulls`, { method: 'POST', headers, body: JSON.stringify({ title: `Fix #${issue.number}: ${issue.title}`, head: `${owner.login}:${branch}`, base: repository.defaultBranch, body: `## RepoPilot evidence\n\nAI-generated and Docker-verified fix for #${issue.number}.\n\nBase commit: \`${baseCommitSha}\`\n\nHuman review required before merge.` }) });
  const pull = await pullResponse.json();
  if (!pullResponse.ok) throw new Error(pull.message || 'Could not create pull request');
  return { number: pull.number, url: pull.html_url, state: pull.state };
}

module.exports = { getGeminiAnalysis, loadRepositoryContext, cloneAndTest, publishToGitHub, hash: value => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}` };
