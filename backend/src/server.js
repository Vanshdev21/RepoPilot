require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const mongoose = require("mongoose");
const crypto = require("crypto");
const session = require("express-session");
const MongoStore = require("connect-mongo").default;
const { getGeminiAnalysis, loadRepositoryContext, cloneAndTest, publishToGitHub, hash } = require("./services/agentService");

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
app.use(express.json({ limit: "1mb" }));
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

async function github(path, token) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "RepoPilot/1.0",
  };
  if (token) headers.Authorization = "Bearer " + token;
  const r = await fetch(`https://api.github.com${path}`, { headers });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const error = new Error(body.message || `GitHub ${r.status}: ${r.statusText}`);
    error.status = r.status;
    error.code = r.status === 401 ? "GITHUB_UNAUTHORIZED" : r.status === 403 ? "GITHUB_FORBIDDEN" : "GITHUB_UPSTREAM_ERROR";
    throw error;
  }
  return body;
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
app.get("/api/repositories/:id", async (req, res) => {
  const repo = dbReady
    ? await Repository.findById(req.params.id)
    : memory.repositories.get(req.params.id);
  repo ? ok(res, repo) : fail(res, 404, "NOT_FOUND", "Repository not found.");
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
    if (!patch.startsWith("diff --git") || !Array.isArray(analysis.relevantFiles)) throw new Error("Gemini returned an invalid or unsafe patch");
    const branch = await github(`/repos/${repo.fullName}/branches/${encodeURIComponent(repo.defaultBranch)}`, req.session.githubToken);
    const run = {
      _id: `run_${crypto.randomBytes(6).toString("hex")}`, userId: req.user._id, repositoryId: String(repo._id), issueNumber,
      issueSnapshot: { title: issue.title, body: issue.body || "", htmlUrl: issue.html_url }, status: "ready_for_review",
      classification: analysis.classification || "bug", summary: analysis.summary || issue.title, rootCause: analysis.rootCause || "Root cause was identified by the agent.",
      relevantFiles: analysis.relevantFiles, generatedPatch: patch, patchSha256: hash(patch), baseCommitSha: branch.commit.sha,
      testResults: { status: "not_run" }, approvalState: "pending", createdAt: new Date(), updatedAt: new Date()
    };
    memory.runs.set(run._id, run);
    ok(res, run);
  } catch (error) { next(error); }
});
app.get("/api/agent/runs", withAuth, (req, res) => {
  const runs = [...memory.runs.values()]
    .filter(run => String(run.userId) === String(req.user._id))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  ok(res, runs);
});
app.get("/api/agent/:runId", withAuth, (req, res) => {
  const run = memory.runs.get(req.params.runId);
  run ? ok(res, run) : fail(res, 404, "NOT_FOUND", "Run not found.");
});
app.post("/api/agent/:runId/test", withAuth, async (req, res, next) => {
  try {
    const run = memory.runs.get(req.params.runId);
    if (!run || String(run.userId) !== String(req.user._id)) return fail(res, 404, "NOT_FOUND", "Run not found");
    const repo = dbReady ? await Repository.findById(run.repositoryId) : memory.repositories.get(run.repositoryId);
    if (!repo) return fail(res, 404, "NOT_FOUND", "Repository not found");
    run.status = "testing";
    const test = await cloneAndTest(repo, run.generatedPatch, req.body.testCommand || 'npm test', req.session.githubToken);
    run.workspace = test.workspace;
    run.testResults = test;
    run.status = test.status === "passed" ? "ready_for_review" : "failed";
    ok(res, run);
  } catch (error) { next(error); }
});
app.post("/api/agent/:runId/approve", (req, res) => {
  const run = memory.runs.get(req.params.runId);
  if (!run) return fail(res, 404, "NOT_FOUND", "Run not found");
  run.approvalState = "approved";
  run.status = "approved";
  ok(res, {
    approved: true,
    runId: run._id,
    patchSha256: run.patchSha256,
    baseCommitSha: run.baseCommitSha,
  });
});
app.post("/api/agent/:runId/pull-request", withAuth, async (req, res, next) => {
  try {
    const run = memory.runs.get(req.params.runId);
    if (!run || String(run.userId) !== String(req.user._id)) return fail(res, 404, "NOT_FOUND", "Run not found");
    if (run.approvalState !== "approved") return fail(res, 409, "APPROVAL_REQUIRED", "The patch must be explicitly approved before publishing.");
    if (run.testResults.status !== "passed") return fail(res, 409, "TESTS_REQUIRED", "Docker tests must pass before pull request creation.");
    const repo = dbReady ? await Repository.findById(run.repositoryId) : memory.repositories.get(run.repositoryId);
    const issue = { number: run.issueNumber, title: run.issueSnapshot.title };
    const pullRequest = await publishToGitHub(repo, issue, run.workspace, run.relevantFiles, req.session.githubToken, run.baseCommitSha);
    run.status = "published";
    run.pullRequest = pullRequest;
    ok(res, pullRequest);
  } catch (error) { next(error); }
});
app.get("/api/reports", withAuth, (req, res) => {
  const reports = [...memory.runs.values()]
    .filter(run => String(run.userId) === String(req.user._id) && run.testResults?.status === "passed")
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  ok(res, reports);
});
app.get("/api/reports/:runId", withAuth, (req, res) => {
  const run = memory.runs.get(req.params.runId);
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

(async () => {
  if (process.env.DB_URL) {
    try {
      await mongoose.connect(process.env.DB_URL, {
        serverSelectionTimeoutMS: 6000,
      });
      dbReady = true;
      console.log("MongoDB connected");
    } catch (e) {
      console.warn("MongoDB unavailable; using memory mode:", e.message);
    }
  } else console.log("DB_URL not configured; using memory mode");
  app.listen(process.env.PORT || 8001, () =>
    console.log(`RepoPilot API listening on ${process.env.PORT || 8001}`),
  );
})();
