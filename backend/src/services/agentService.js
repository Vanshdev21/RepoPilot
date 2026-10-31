const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

function buildRepositoryFallback(repository, question, files) {
  const paths = files.map(file => file.path);
  const packageFile = files.find(file => file.path.endsWith('package.json'));
  let stack = 'Technology details could not be identified from the selected files.';
  if (packageFile) {
    try {
      const packageJson = JSON.parse(packageFile.content);
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
      const technologies = Object.keys(dependencies || {}).slice(0, 12);
      stack = technologies.length ? `Detected dependencies: ${technologies.join(', ')}.` : 'A package.json file was found, but it declares no dependencies.';
    } catch (_) {}
  }
  const sourceHint = paths.length ? `Available repository files include: ${paths.slice(0, 8).join(', ')}.` : 'No source files were available for this repository.';
  return `I am currently using repository-context fallback mode because the configured Gemini key is unavailable.\n\nRepository: ${repository.fullName}\nQuestion: ${question}\n\n${stack}\n${sourceHint}\n\nAdd a valid Gemini API key to enable full code explanation and natural-language analysis.`;
}

async function answerRepositoryQuestion(repository, question, files, githubToken) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');
  const configuredModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const models = [...new Set([configuredModel, 'gemini-2.5-flash'])].filter(model => !model.includes('3.8'));
  const context = files.map(file => `FILE ${file.path}\n${file.content.slice(0, 12000)}`).join('\n\n');
  const prompt = `You are RepoPilot's repository engineering assistant. Answer from the supplied repository context only. Repository: ${repository.fullName}. Explain architecture, code behavior, tech stack, dependencies, and tradeoffs clearly. Admit when the repository context is insufficient.\n\nRepository context:\n${context}\n\nUser question:\n${question}`;
  let lastError = '';
  for (const model of models) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2 } })
    });
    const body = await response.json();
    if (!response.ok) {
      lastError = body.error?.message || `Gemini model ${model} failed`;
      continue;
    }
    const answer = body.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();
    if (answer) return answer;
  }
  throw new Error(lastError || 'Gemini API request failed');
}

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
  const models = [...new Set([process.env.GEMINI_MODEL || 'gemini-2.5-flash', 'gemini-2.5-flash'])];
  const prompt = `You are RepoPilot's senior repository-fixing agent. Do two jobs in one response, and return valid JSON only.
Repository: ${repository.fullName}
Issue #${issue.number}: ${issue.title}
Description: ${issue.body || 'No description'}
Available source context:
${files.map(file => `FILE ${file.path}\n${file.content.slice(0, 16000)}`).join('\n\n')}
First decide whether this issue is a real, actionable, repository-specific defect that can be fixed with the supplied context. Set shouldFix true only when evidence supports the report and a safe source change is possible. Never fabricate paths, APIs, or source files. Set shouldFix false for duplicates, feature requests, questions, vague reports, or reports unsupported by the repository context.
If shouldFix is false, still provide summary, rootCause, relevantFiles ([]), patch (""), and testCommand ("true").
If shouldFix is true, provide a complete unified git diff that applies to repository root. Every changed file must be in relevantFiles. Make a minimal correct fix and include regression tests when the project structure supports them. testCommand must be safe. Prefer test scripts already present in package.json; otherwise use the project language's standard focused test command or "true".
Return keys: shouldFix, confidence (0-100), classification, summary, rootCause, relevantFiles, proposedFix, patch, testCommand, validationNotes.`;
  let lastError = '';
  for (const model of models) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, responseMimeType: 'application/json' } })
    });
    const body = await response.json();
    if (!response.ok) { lastError = body.error?.message || `Gemini model ${model} failed`; continue; }
    const text = body.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '{}';
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    try { return JSON.parse(cleaned); } catch (_) { lastError = 'Gemini returned invalid JSON'; }
  }
  throw new Error(lastError || 'Gemini API request failed');
}

async function loadRepositoryContext(repository, issue, githubToken) {
  const headers = { 'User-Agent': 'RepoPilot/1.0', Accept: 'application/vnd.github+json' };
  if (githubToken) headers.Authorization = "Bearer " + githubToken;
  const treeResponse = await fetch(`https://api.github.com/repos/${repository.fullName}/git/trees/${encodeURIComponent(repository.defaultBranch)}?recursive=1`, { headers });
  if (!treeResponse.ok) throw new Error('Could not retrieve repository tree');
  const tree = await treeResponse.json();
  const keywords = `${issue.title} ${issue.body || ''}`.toLowerCase().match(/[a-z][a-z0-9_-]{3,}/g) || [];
  const candidates = tree.tree.filter(item => item.type === 'blob' && /\.(js|jsx|ts|tsx|py|go|java|json|css|html|md)$/.test(item.path))
    .map(item => ({ ...item, score: keywords.filter(word => item.path.toLowerCase().includes(word)).length }))
    .filter(item => item.score > 0 || /(readme|package\.json|requirements\.txt|pyproject\.toml|test|spec)/i.test(item.path))
    .sort((a, b) => b.score - a.score).slice(0, 24);
  const files = [];
  for (const item of candidates.slice(0, 12)) {
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

  const ownerResponse = await fetch('https://api.github.com/user', { headers });
  if (!ownerResponse.ok) throw new Error('Could not retrieve GitHub user for pull request publishing');
  const owner = await ownerResponse.json();
  const repositoryOwner = repository.fullName.split('/')[0];
  const userOwnsRepository = repositoryOwner.toLowerCase() === owner.login.toLowerCase();
  let publishRepository = repository.fullName;
  let headOwner = owner.login;
  if (!userOwnsRepository) {
    const forkResponse = await fetch(`https://api.github.com/repos/${repository.fullName}/forks`, { method: 'POST', headers });
    if (!forkResponse.ok && forkResponse.status !== 202) throw new Error('Could not create a repository fork');
    publishRepository = `${owner.login}/${repository.name}`;
    headOwner = owner.login;
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  const branch = `repopilot/fix-${issue.number}-${Date.now()}`;
  const refResponse = await fetch(`https://api.github.com/repos/${publishRepository}/git/refs/heads/${encodeURIComponent(repository.defaultBranch)}`, { headers });
  const refData = await refResponse.json();
  if (!refResponse.ok) throw new Error(`Could not find publishing branch: ${refData.message || ''}`);
  const branchResponse = await fetch(`https://api.github.com/repos/${publishRepository}/git/refs`, { method: 'POST', headers, body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: refData.object.sha }) });
  if (!branchResponse.ok) { const body = await branchResponse.json(); throw new Error(body.message || 'Could not create fix branch'); }
  for (const file of files) {
    const currentResponse = await fetch(`https://api.github.com/repos/${publishRepository}/contents/${encodeURIComponent(file.path)}?ref=${encodeURIComponent(branch)}`, { headers });
    const current = await currentResponse.json();
    const updateResponse = await fetch(`https://api.github.com/repos/${publishRepository}/contents/${encodeURIComponent(file.path)}`, { method: 'PUT', headers, body: JSON.stringify({ message: `Fix issue #${issue.number}: ${issue.title}`.slice(0, 80), content: Buffer.from(file.content).toString('base64'), branch, sha: currentResponse.ok ? current.sha : undefined }) });
    if (!updateResponse.ok) { const body = await updateResponse.json(); throw new Error(`Could not update ${file.path}: ${body.message || 'GitHub API error'}`); }
  }
  const pullResponse = await fetch(`https://api.github.com/repos/${repository.fullName}/pulls`, { method: 'POST', headers, body: JSON.stringify({ title: `Fix #${issue.number}: ${issue.title}`, head: `${headOwner}:${branch}`, base: repository.defaultBranch, body: `## RepoPilot evidence\n\nAI-reviewed and Docker-verified fix for #${issue.number}.\n\nBase commit: \`${baseCommitSha}\`\n\nHuman review required before merge.` }) });
  const pull = await pullResponse.json();
  if (!pullResponse.ok) throw new Error(pull.message || 'Could not create pull request');
  return { number: pull.number, url: pull.html_url, state: pull.state };
}

module.exports = { getGeminiAnalysis, answerRepositoryQuestion, loadRepositoryContext, cloneAndTest, publishToGitHub, hash: value => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}` };
