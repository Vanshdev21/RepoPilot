require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const mongoose = require("mongoose");
const crypto = require("crypto");
const session = require("express-session");
const MongoStore = require("connect-mongo").default;
const { getGeminiAnalysis, answerRepositoryQuestion, loadRepositoryContext, cloneAndTest, publishToGitHub, hash } = require("./services/agentService");
const { registerRepositoryRoutes } = require('./routes/repositories');
const { registerAgentRoutes } = require('./routes/agent');
const { registerChatRoutes } = require('./routes/chat');
const { registerAuthRoutes } = require('./routes/auth');
const { requireAuth } = require('./middleware/auth');
const { state: runtimeState } = require('./runtime');

const {
  User,
  Repository,
  AgentRun,
  AgentEvent,
  Approval,
} = require("./models");
const app = express();
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb", verify: (req, _res, buffer) => { req.rawBody = Buffer.from(buffer); } }));
app.use(
  session({
    name: "repopilot.sid",
    secret:
      process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
    resave: false,
    saveUninitialized: false,
    store: process.env.DB_URL ? MongoStore.create({ mongoUrl: process.env.DB_URL, collectionName: "sessions", ttl: 7 * 24 * 60 * 60 }) : undefined,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);
app.use(morgan("tiny"));

let dbReady = false;
const memory = { repositories: new Map(), runs: new Map(), events: new Map() };
const persistRun = async run => {
  if (!dbReady) return run;
  const existing = run.runId ? await AgentRun.findOne({ runId: run.runId }) : null;
  const data = { ...run, runId: run._id, workspace: run.workspace };
  delete data._id;
  if (existing) return AgentRun.findOneAndUpdate({ _id: existing._id }, data, { new: true });
  return AgentRun.create(data);
};
const getStoredRun = async runId => {
  if (memory.runs.has(runId)) return memory.runs.get(runId);
  if (!dbReady) return null;
  const run = mongoose.isValidObjectId(runId)
    ? await AgentRun.findById(runId).catch(() => null)
    : null;
  const byRunId = run || await AgentRun.findOne({ runId });
  if (!byRunId) return null;
  const plain = byRunId.toObject();
  plain._id = plain.runId || String(plain._id);
  memory.runs.set(plain._id, plain);
  return plain;
};
const listStoredRuns = async userId => {
  const memoryRuns = [...memory.runs.values()].filter(run => String(run.userId) === String(userId));
  if (!dbReady) return memoryRuns;
  const dbRuns = await AgentRun.find({ userId }).sort({ createdAt: -1 }).lean();
  return dbRuns.map(run => ({ ...run, _id: run.runId || String(run._id) }));
};
const ok = (res, data, meta = {}) =>
  res.json({
    success: true,
    data,
    meta: {
      requestId: `req_${crypto.randomBytes(8).toString("hex")}`,
      timestamp: new Date().toISOString(),
      ...meta,
    },
  });
const fail = (res, status, code, message) =>
  res
    .status(status)
    .json({
      success: false,
      error: { code, message, retryable: false },
      meta: {
        requestId: `req_${crypto.randomBytes(8).toString("hex")}`,
        timestamp: new Date().toISOString(),
      },
    });
const withAuth = async (req, res, next) => {
  if (!req.session.user)
    return fail(res, 401, "UNAUTHORIZED", "GitHub sign-in is required.");

  try {
    if (dbReady && !mongoose.isValidObjectId(req.session.user._id)) {
      const savedUser = await User.findOneAndUpdate(
        { githubId: req.session.user.githubId },
        {
          githubId: req.session.user.githubId,
          username: req.session.user.username,
          name: req.session.user.name,
          avatarUrl: req.session.user.avatarUrl,
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );
      req.session.user._id = savedUser.id;
      await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
    }
    req.user = req.session.user;
    next();
  } catch (error) {
    next(error);
  }
};

async function github(path, token, options = {}) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "RepoPilot/1.0",
  };
  if (token) headers.Authorization = "Bearer " + token;
  const r = await fetch(`https://api.github.com${path}`, { method: options.method || "GET", headers: { ...headers, ...(options.body ? { "Content-Type": "application/json" } : {}) }, ...(options.body ? { body: JSON.stringify(options.body) } : {}) });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const error = new Error(body.message || `GitHub ${r.status}: ${r.statusText}`);
    error.status = r.status;
    error.code = r.status === 401 ? "GITHUB_UNAUTHORIZED" : r.status === 403 ? "GITHUB_FORBIDDEN" : "GITHUB_UPSTREAM_ERROR";
    throw error;
  }
  return body;
}
async function processIssueWebhook(fullName, issue) {
  if (!dbReady) return;
  const repo = await Repository.findOne({ fullName, monitoringEnabled: true });
  if (!repo) return;
  const owner = await User.findById(repo.connectedBy);
  const token = owner?.githubAccessToken;
  if (!token) throw new Error("The repository owner must relink GitHub to enable automatic issue processing.");
  const githubIssue = await github(`/repos/${fullName}/issues/${issue.number}`, token);
  const files = await loadRepositoryContext(repo, githubIssue, token);
  const analysis = await getGeminiAnalysis(githubIssue, files, repo);
  const patch = String(analysis.patch || "");
  if (analysis.shouldFix !== true || Number(analysis.confidence || 0) < 70 || !patch.startsWith("diff --git") || !analysis.relevantFiles?.length) return;
  const branch = await github(`/repos/${fullName}/branches/${encodeURIComponent(repo.defaultBranch)}`, token);
  const run = { _id: `run_${crypto.randomBytes(6).toString("hex")}`, userId: repo.connectedBy, repositoryId: String(repo._id), issueNumber: issue.number, issueSnapshot: { title: githubIssue.title, body: githubIssue.body || "", htmlUrl: githubIssue.html_url }, status: "testing", classification: analysis.classification || "bug", summary: analysis.summary || githubIssue.title, rootCause: analysis.rootCause || "The agent verified the reported defect.", relevantFiles: analysis.relevantFiles, generatedPatch: patch, patchSha256: hash(patch), baseCommitSha: branch.commit.sha, testResults: { status: "not_run" }, approvalState: "pending", confidence: Number(analysis.confidence || 0), suggestedTestCommand: analysis.testCommand || "npm test", createdAt: new Date(), updatedAt: new Date() };
  memory.runs.set(run._id, run);
  await persistRun(run);
  const test = await cloneAndTest(repo, patch, run.suggestedTestCommand, token);
  run.workspace = test.workspace;
  run.testResults = test;
  run.status = test.status === "passed" ? "ready_for_review" : "failed";
  await persistRun(run);
  if (repo.autoApprove && test.status === "passed") {
    run.approvalState = "approved";
    run.status = "approved";
    const pullRequest = await publishToGitHub(repo, { number: issue.number, title: githubIssue.title }, run.workspace, run.relevantFiles, token, run.baseCommitSha);
    run.status = "published";
    run.pullRequest = pullRequest;
    await persistRun(run);
  }
}

const parseRepo = (url) => {
  try {
    const u = new URL(url);
    if (u.hostname !== "github.com") throw 0;
    const [, owner, name] = u.pathname.split("/");
    if (!owner || !name) throw 0;
    return { owner, name: name.replace(/\.git$/, "") };
  } catch {
    return null;
  }
};

registerAuthRoutes(app);
registerRepositoryRoutes(app, requireAuth);
registerAgentRoutes(app, requireAuth);
registerChatRoutes(app, requireAuth);
app.get("/api/health", (_req, res) =>
  ok(res, { status: "healthy", database: dbReady ? "connected" : "memory" }),
);
app.get("/api/auth/me", (req, res) =>
  req.session.user
    ? ok(res, { user: req.session.user })
    : fail(res, 401, "UNAUTHORIZED", "GitHub sign-in is required."),
);
app.get("/api/auth/github", (req, res) => {
  const state = crypto.randomBytes(24).toString("hex");
  req.session.oauthState = state;
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: "http://localhost:8001/api/auth/github/callback",
    scope: "read:user user:email repo",
    state,
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});
app.get("/api/auth/github/callback", async (req, res, next) => {
  try {
    if (!req.query.code || req.query.state !== req.session.oauthState) {
      return res.redirect(
        `${process.env.CLIENT_URL || "http://localhost:5173"}/login?error=oauth_state`,
      );
    }
    delete req.session.oauthState;
    const tokenResponse = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code: req.query.code,
          redirect_uri: "http://localhost:8001/api/auth/github/callback",
        }),
      },
    );
    const token = await tokenResponse.json();
    if (!token.access_token) {
      const oauthMessage = token.error_description || token.error || "GitHub did not issue an access token";
      throw new Error(`GitHub OAuth token exchange failed: ${oauthMessage}`);
    }

    const profileResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: "Bearer " + token.access_token,
        Accept: "application/vnd.github+json",
        "User-Agent": "RepoPilot/1.0",
      },
    });
    const profile = await profileResponse.json();
    if (!profileResponse.ok || !profile.id) {
      throw new Error(`GitHub profile could not be retrieved (${profileResponse.status}: ${profile.message || profileResponse.statusText})`);
    }

    let userId = String(profile.id);
    if (dbReady) {
      const savedUser = await User.findOneAndUpdate(
        { githubId: profile.id },
        {
          githubId: profile.id,
          username: profile.login,
          name: profile.name || profile.login,
          avatarUrl: profile.avatar_url,
          githubAccessToken: token.access_token,
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );
      userId = savedUser.id;
    }
    req.session.user = {
      _id: userId,
      githubId: profile.id,
      username: profile.login,
      name: profile.name || profile.login,
      avatarUrl: profile.avatar_url,
    };
    req.session.githubToken = token.access_token;
    req.session.save(() =>
      res.redirect(
        `${process.env.CLIENT_URL || "http://localhost:5173"}/dashboard?auth=success`,
      ),
    );
  } catch (error) {
    console.error("GitHub OAuth callback failed:", error.message);
    const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
    return res.redirect(`${clientUrl}/login?error=github_oauth&message=${encodeURIComponent(error.message)}`);
  }
});
app.post("/api/auth/logout", (req, res) =>
  req.session.destroy(() => {
    res.clearCookie("repopilot.sid");
    res.json({ success: true });
  }),
);

app.get("/api/github/repos", withAuth, async (req, res, next) => {
  try {
    const repositories = await github('/user/repos?affiliation=owner,collaborator,organization_member&sort=updated&per_page=100', req.session.githubToken);
    ok(res, repositories.map(repository => ({
      id: repository.id, fullName: repository.full_name, name: repository.name, owner: repository.owner.login,
      description: repository.description, private: repository.private, language: repository.language, htmlUrl: repository.html_url,
      defaultBranch: repository.default_branch
    })));
  } catch (error) {
    next(error);
  }
});
app.post("/api/repositories/connect", withAuth, async (req, res, next) => {
  try {
    const parsed = parseRepo(req.body.repositoryUrl || req.body.url || "");
    if (!parsed)
      return fail(
        res,
        400,
        "VALIDATION_ERROR",
        "Must be a valid public GitHub repository URL.",
      );
    const repo = await github(`/repos/${parsed.owner}/${parsed.name}`, req.session.githubToken);
    const record = {
      _id: dbReady
        ? undefined
        : `repo_${crypto.randomBytes(5).toString("hex")}`,
      githubRepositoryId: repo.id,
      owner: repo.owner.login,
      name: repo.name,
      fullName: repo.full_name,
      htmlUrl: repo.html_url,
      defaultBranch: repo.default_branch,
      primaryLanguage: repo.language,
      description: repo.description,
      visibility: repo.private ? "private" : "public",
      indexingStatus: "completed",
      connectedBy: req.user._id,
      updatedAt: new Date(),
    };
    let saved = record;
    if (dbReady) {
      saved = await Repository.findOneAndUpdate(
        { connectedBy: req.user._id, githubRepositoryId: repo.id },
        record,
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );
    } else memory.repositories.set(saved._id, saved);
    ok(res, saved);
  } catch (e) {
    next(e);
  }
});
app.get('/api/repositories', withAuth, async (req, res, next) => {
  try {
    const repositories = dbReady
      ? await Repository.find({ connectedBy: req.user._id }).sort({ updatedAt: -1 })
      : [...memory.repositories.values()].filter(repository => String(repository.connectedBy) === String(req.user._id));
    ok(res, repositories);
  } catch (error) {
    next(error);
  }
});
app.get("/api/repositories/:id/issues", withAuth, async (req, res, next) => {
  try {
    let repo;
    if (dbReady) {
      repo = await Repository.findById(req.params.id);
    } else repo = memory.repositories.get(req.params.id);
    if (!repo) return fail(res, 404, "NOT_FOUND", "Repository not found.");
    const page = Number(req.query.page || 1),
      perPage = Math.min(Number(req.query.perPage || 20), 100);
    const issues = await github(
      `/repos/${repo.fullName}/issues?state=open&sort=updated&per_page=${perPage}&page=${page}`,
      req.session.githubToken,
    );
    ok(
      res,
      issues
        .filter((i) => !i.pull_request)
        .map((i) => ({
          _id: i.id,
          number: i.number,
          title: i.title,
          body: i.body || "",
          labels: i.labels.map((l) => (typeof l === "string" ? l : l.name)),
          createdAt: i.created_at,
          updatedAt: i.updated_at,
          user: i.user?.login,
          htmlUrl: i.html_url,
        })),
      { page, perPage },
    );
  } catch (e) {
    next(e);
  }
});
app.get("/api/repositories/:id/issues/:number", withAuth, async (req, res, next) => {
  try {
    let repo = dbReady
      ? await Repository.findById(req.params.id)
      : memory.repositories.get(req.params.id);
    if (!repo) return fail(res, 404, "NOT_FOUND", "Repository not found");
    const issue = await github(
      `/repos/${repo.fullName}/issues/${req.params.number}`,
      req.session.githubToken,
    );
    ok(res, {
      number: issue.number,
      title: issue.title,
      body: issue.body || "",
      labels: issue.labels.map((l) => (typeof l === "string" ? l : l.name)),
      createdAt: issue.created_at,
      user: issue.user?.login,
      htmlUrl: issue.html_url,
    });
  } catch (e) {
    next(e);
  }
});
app.post("/api/repositories/:id/monitor", withAuth, async (req, res, next) => {
  try {
    const repo = await Repository.findOne({ _id: req.params.id, connectedBy: req.user._id });
    if (!repo) return fail(res, 404, "NOT_FOUND", "Repository not found.");
    const callbackUrl = process.env.GITHUB_WEBHOOK_URL || `${process.env.API_PUBLIC_URL || "http://localhost:8001"}/api/webhooks/github`;
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) return fail(res, 503, "WEBHOOK_NOT_CONFIGURED", "GITHUB_WEBHOOK_SECRET is not configured on the backend.");
    const callbackIsPublic = callbackUrl && !callbackUrl.includes('localhost') && !callbackUrl.includes('127.0.0.1');
    if (callbackIsPublic && !repo.webhookId) {
      const hooks = await github(`/repos/${repo.fullName}/hooks`, req.session.githubToken);
      const existing = hooks.find(hook => hook.config?.url === callbackUrl);
      if (existing) repo.webhookId = existing.id;
      else {
        const created = await github(`/repos/${repo.fullName}/hooks`, req.session.githubToken, { method: "POST", body: { name: "web", active: true, events: ["issues"], config: { url: callbackUrl, content_type: "json", secret, insecure_ssl: "0" } } });
        repo.webhookId = created.id;
      }
    }
    repo.monitoringEnabled = true;
    repo.autoApprove = req.body.autoApprove === true;
    if (!repo.lastSeenIssueNumber) {
      const issues = await github(`/repos/${repo.fullName}/issues?state=all&sort=created&direction=desc&per_page=1`, req.session.githubToken);
      repo.lastSeenIssueNumber = issues[0]?.number || 0;
    }
    await repo.save();
    ok(res, { monitoringEnabled: true, webhookId: repo.webhookId || null, mode: callbackIsPublic && repo.webhookId ? 'webhook' : 'polling', autoApprove: repo.autoApprove });
  } catch (error) { next(error); }
});

app.post("/api/webhooks/github", async (req, res, next) => {
  try {
    const signature = req.get("X-Hub-Signature-256") || "";
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret || signature !== `sha256=${crypto.createHmac("sha256", secret).update(req.rawBody || Buffer.alloc(0)).digest("hex")}`)
      return fail(res, 401, "INVALID_WEBHOOK_SIGNATURE", "Webhook signature is invalid.");
    if (req.get("X-GitHub-Event") !== "issues" || !["opened", "reopened"].includes(req.body.action)) return res.sendStatus(204);
    const issue = req.body.issue;
    const fullName = req.body.repository?.full_name;
    if (!issue || issue.pull_request || !fullName) return res.sendStatus(204);
    res.sendStatus(202);
    processIssueWebhook(fullName, issue).catch(error => console.error("RepoPilot webhook agent failed:", error.message));
  } catch (error) { next(error); }
});

app.get("/api/repositories/:id", async (req, res) => {
  const repo = dbReady
    ? await Repository.findById(req.params.id)
    : memory.repositories.get(req.params.id);
  repo ? ok(res, repo) : fail(res, 404, "NOT_FOUND", "Repository not found.");
});

app.post("/api/chat/repository", withAuth, async (req, res, next) => {
  try {
    const { repositoryId, question, history = [] } = req.body;
    if (!repositoryId || !String(question || "").trim()) return fail(res, 400, "VALIDATION_ERROR", "repositoryId and question are required.");
    const repository = dbReady ? await Repository.findOne({ _id: repositoryId, connectedBy: req.user._id }) : memory.repositories.get(repositoryId);
    if (!repository) return fail(res, 404, "NOT_FOUND", "Repository not found.");
    const contextFiles = await loadRepositoryContext(repository, { title: "Repository architecture and code explanation", body: String(question).slice(0, 500) }, req.session.githubToken);
    const contextualQuestion = history.length ? `Conversation history:\n${history.slice(-6).map(message => `${message.role}: ${message.content}`).join('\n')}\n\nQuestion: ${question}` : question;
    const answer = await answerRepositoryQuestion(repository, contextualQuestion, contextFiles, req.session.githubToken);
    ok(res, { answer, repository: repository.fullName, sources: contextFiles.map(file => file.path) });
  } catch (error) { next(error); }
});

app.post("/api/agent/analyze", withAuth, async (req, res, next) => {
  try {
    const { repositoryId, issueNumber } = req.body;
    if (!repositoryId || !issueNumber) return fail(res, 400, "VALIDATION_ERROR", "repositoryId and issueNumber are required");
    const repo = dbReady ? await Repository.findById(repositoryId) : memory.repositories.get(repositoryId);
    if (!repo) return fail(res, 404, "NOT_FOUND", "Repository not found");
    if (String(repo.connectedBy) !== String(req.user._id) && dbReady) return fail(res, 403, "FORBIDDEN", "Repository access denied");
    const issue = await github(`/repos/${repo.fullName}/issues/${issueNumber}`, req.session.githubToken);
    const files = await loadRepositoryContext(repo, issue, req.session.githubToken);
    const analysis = await getGeminiAnalysis(issue, files, repo);
    const patch = String(analysis.patch || "");
    const confidence = Number(analysis.confidence || 0);
    if (analysis.shouldFix !== true) {
      const run = {
        _id: `run_${crypto.randomBytes(6).toString("hex")}`, userId: req.user._id, repositoryId: String(repo._id), issueNumber,
        issueSnapshot: { title: issue.title, body: issue.body || "", htmlUrl: issue.html_url }, status: "not_actionable",
        classification: analysis.classification || "other", summary: analysis.summary || "Issue was not confirmed as actionable", rootCause: analysis.rootCause || "The report could not be verified against repository code.",
        relevantFiles: [], generatedPatch: "", patchSha256: null, baseCommitSha: null, testResults: { status: "not_run" },
        approvalState: "not_required", confidence, validationNotes: analysis.validationNotes || "The issue needs more evidence before a code change is safe.", createdAt: new Date(), updatedAt: new Date()
      };
      memory.runs.set(run._id, run);
      await persistRun(run);
      return ok(res, run);
    }
    if (!files.length) throw new Error("Not enough repository source context was available to safely fix this issue");
    if (confidence < 70 || !patch.startsWith("diff --git") || !Array.isArray(analysis.relevantFiles) || !analysis.relevantFiles.length) throw new Error("The AI did not produce a sufficiently verified and applicable patch. Add more reproduction details to the issue or improve repository test coverage.");
    const diffPaths = [...patch.matchAll(/^diff --git a\/([^ ]+) b\/([^\s]+)$/gm)].map(match => match[2]);
    if (!diffPaths.length || diffPaths.some(file => analysis.relevantFiles.includes(file) === false || file.startsWith('../') || file.startsWith('/'))) throw new Error("Gemini returned an unsafe patch with unverified file paths");
    const branch = await github(`/repos/${repo.fullName}/branches/${encodeURIComponent(repo.defaultBranch)}`, req.session.githubToken);
    const run = {
      _id: `run_${crypto.randomBytes(6).toString("hex")}`, userId: req.user._id, repositoryId: String(repo._id), issueNumber,
      issueSnapshot: { title: issue.title, body: issue.body || "", htmlUrl: issue.html_url }, status: "ready_for_review",
      classification: analysis.classification || "bug", summary: analysis.summary || issue.title, rootCause: analysis.rootCause || "Root cause was identified by the agent.",
      relevantFiles: analysis.relevantFiles, generatedPatch: patch, patchSha256: hash(patch), baseCommitSha: branch.commit.sha,
      testResults: { status: "not_run" }, approvalState: "pending", confidence, validationNotes: analysis.validationNotes || analysis.proposedFix || "Issue and repository context were reviewed before patch generation.",
      suggestedTestCommand: analysis.testCommand || 'npm test', createdAt: new Date(), updatedAt: new Date()
    };
    memory.runs.set(run._id, run);
    await persistRun(run);
    ok(res, run);
  } catch (error) { next(error); }
});
app.get("/api/agent/runs", withAuth, async (req, res, next) => {
  try {
    const runs = await listStoredRuns(req.user._id);
    ok(res, runs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  } catch (error) { next(error); }
});
app.get("/api/agent/:runId", withAuth, async (req, res) => {
  const run = await getStoredRun(req.params.runId);
  if (!run || String(run.userId) !== String(req.user._id)) return fail(res, 404, "NOT_FOUND", "Run not found.");
  ok(res, run);
});
app.post("/api/agent/:runId/test", withAuth, async (req, res, next) => {
  try {
    const run = await getStoredRun(req.params.runId);
    if (!run || String(run.userId) !== String(req.user._id)) return fail(res, 404, "NOT_FOUND", "Run not found");
    const repo = dbReady ? await Repository.findById(run.repositoryId) : memory.repositories.get(run.repositoryId);
    if (!repo) return fail(res, 404, "NOT_FOUND", "Repository not found");
    run.status = "testing";
    const test = await cloneAndTest(repo, run.generatedPatch, req.body.testCommand || run.suggestedTestCommand || 'npm test', req.session.githubToken);
    run.workspace = test.workspace;
    run.testResults = test;
    run.status = test.status === "passed" ? "ready_for_review" : "failed";
    await persistRun(run);
    ok(res, run);
  } catch (error) { next(error); }
});
app.post("/api/agent/:runId/approve", withAuth, async (req, res) => {
  const run = await getStoredRun(req.params.runId);
  if (!run || String(run.userId) !== String(req.user._id)) return fail(res, 404, "NOT_FOUND", "Run not found");
  run.approvalState = "approved";
  run.status = "approved";
  await persistRun(run);
  ok(res, {
    approved: true,
    runId: run._id,
    patchSha256: run.patchSha256,
    baseCommitSha: run.baseCommitSha,
  });
});
app.post("/api/agent/:runId/pull-request", withAuth, async (req, res, next) => {
  try {
    const run = await getStoredRun(req.params.runId);
    if (!run || String(run.userId) !== String(req.user._id)) return fail(res, 404, "NOT_FOUND", "Run not found");
    if (run.approvalState !== "approved") return fail(res, 409, "APPROVAL_REQUIRED", "The patch must be explicitly approved before publishing.");
    if (run.testResults.status !== "passed") return fail(res, 409, "TESTS_REQUIRED", "Docker tests must pass before pull request creation.");
    const repo = dbReady ? await Repository.findById(run.repositoryId) : memory.repositories.get(run.repositoryId);
    const issue = { number: run.issueNumber, title: run.issueSnapshot.title };
    const pullRequest = await publishToGitHub(repo, issue, run.workspace, run.relevantFiles, req.session.githubToken, run.baseCommitSha);
    run.status = "published";
    run.pullRequest = pullRequest;
    await persistRun(run);
    ok(res, pullRequest);
  } catch (error) { next(error); }
});
app.get("/api/reports", withAuth, async (req, res, next) => {
  try {
  const runs = await listStoredRuns(req.user._id);
  const reports = runs
    .filter(run => String(run.userId) === String(req.user._id) && run.testResults?.status === "passed")
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  ok(res, reports);
  } catch (error) { next(error); }
});
app.get("/api/reports/:runId", withAuth, async (req, res) => {
  const run = await getStoredRun(req.params.runId);
  if (!run || String(run.userId) !== String(req.user._id)) return fail(res, 404, "NOT_FOUND", "Run not found.");
  ok(res, {
    runId: run._id,
    issue: run.issueSnapshot,
    classification: run.classification,
    rootCause: run.rootCause,
    relevantFiles: run.relevantFiles,
    patchSha256: run.patchSha256,
    testResults: run.testResults,
    approvalState: run.approvalState,
    pullRequest: run.pullRequest || null,
  });
});
app.get("/api/agent/:runId/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.flushHeaders();
  for (const [i, message] of [
    "queued",
    "analysing issue",
    "investigating repository",
    "generating patch",
    "ready for review",
  ].entries())
    setTimeout(
      () =>
        res.write(
          `id: ${i}\nevent: stage\ndata: ${JSON.stringify({ message })}\n\n`,
        ),
      i * 150,
    );
  setTimeout(() => res.end(), 800);
});

app.use((req, res) => fail(res, 404, "NOT_FOUND", "Endpoint not found."));
app.use((err, _req, res, _next) => {
  console.error(err);
  if (err.status === 401 || err.code === "GITHUB_UNAUTHORIZED") {
    return fail(res, 401, "GITHUB_UNAUTHORIZED", "GitHub authorization expired. Please sign in again.");
  }
  if (err.status === 403 || err.code === "GITHUB_FORBIDDEN") {
    return fail(res, 403, "GITHUB_FORBIDDEN", "GitHub denied access or the API rate limit was reached. Verify repository permissions and try again.");
  }
  if (err.status === 404) {
    return fail(res, 404, "GITHUB_NOT_FOUND", "The GitHub repository could not be found or is not accessible to this account.");
  }
  if (err.code === "GITHUB_UPSTREAM_ERROR") {
    return fail(res, 502, err.code, err.message || "GitHub could not complete the request. Please try again.");
  }
  return fail(res, 502, "UPSTREAM_ERROR", err.message || "The upstream service could not complete the request.");
});

async function pollMonitoredRepositories() {
  if (!dbReady) return;
  try {
    const repositories = await Repository.find({ monitoringEnabled: true });
    for (const repository of repositories) {
      const owner = await User.findById(repository.connectedBy);
      if (!owner?.githubAccessToken) continue;
      const issues = await github(`/repos/${repository.fullName}/issues?state=open&sort=created&direction=asc&per_page=100`, owner.githubAccessToken);
      const newIssues = issues.filter(issue => !issue.pull_request && issue.number > (repository.lastSeenIssueNumber || 0));
      for (const issue of newIssues) await processIssueWebhook(repository.fullName, issue).catch(error => console.error(`Issue agent failed for #${issue.number}:`, error.message));
      const highestIssue = Math.max(repository.lastSeenIssueNumber || 0, ...newIssues.map(issue => issue.number));
      if (highestIssue !== (repository.lastSeenIssueNumber || 0)) {
        repository.lastSeenIssueNumber = highestIssue;
        await repository.save();
      }
    }
  } catch (error) { console.warn('Repository issue polling paused:', error.message); }
}
setInterval(pollMonitoredRepositories, 60 * 1000);

(async () => {
  if (process.env.DB_URL) {
    try {
      await mongoose.connect(process.env.DB_URL, {
        serverSelectionTimeoutMS: 6000,
      });
      dbReady = true;
      runtimeState.dbReady = true;
      console.log("MongoDB connected");
    } catch (e) {
      console.warn("MongoDB unavailable; using memory mode:", e.message);
    }
  } else console.log("DB_URL not configured; using memory mode");
  app.listen(process.env.PORT || 8001, () =>
    console.log(`RepoPilot API listening on ${process.env.PORT || 8001}`),
  );
})();
