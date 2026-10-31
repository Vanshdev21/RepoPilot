const crypto = require('crypto');
const mongoose = require('mongoose');
const { Repository, AgentRun } = require('../models');
const { state, ok, fail } = require('../runtime');
const { githubApi } = require('../services/githubService');
const { getGeminiAnalysis, loadRepositoryContext, cloneAndTest, publishToGitHub, hash } = require('../services/agentService');

async function getRepository(id, userId, token) {
  if (state.dbReady) return Repository.findOne({ _id: id, connectedBy: userId });
  const repository = state.memory.repositories.get(id);
  return repository && String(repository.connectedBy) === String(userId) ? repository : null;
}

async function saveRun(run) {
  if (!state.dbReady) return run;
  const existing = await AgentRun.findOne({ runId: run._id });
  const values = { ...run, runId: run._id }; delete values._id;
  return existing ? AgentRun.findByIdAndUpdate(existing._id, values, { new: true }) : AgentRun.create(values);
}

async function findRun(runId, userId) {
  const memoryRun = state.memory.runs.get(runId);
  if (memoryRun) return memoryRun;
  if (!state.dbReady) return null;
  const databaseRun = mongoose.isValidObjectId(runId) ? await AgentRun.findById(runId).catch(() => null) : await AgentRun.findOne({ runId });
  if (!databaseRun || String(databaseRun.userId) !== String(userId)) return null;
  const run = databaseRun.toObject(); run._id = run.runId || String(databaseRun._id); state.memory.runs.set(run._id, run);
  return run;
}

function registerAgentRoutes(app, withAuth) {
  app.post('/api/agent/analyze', withAuth, async (req, res, next) => {
    try {
      const { repositoryId, issueNumber } = req.body;
      const repository = await getRepository(repositoryId, req.user._id, req.session.githubToken);
      if (!repository) return fail(res, 404, 'NOT_FOUND', 'Repository not found.');
      const issue = await githubApi(`/repos/${repository.fullName}/issues/${issueNumber}`, req.session.githubToken);
      const files = await loadRepositoryContext(repository, issue, req.session.githubToken);
      const analysis = await getGeminiAnalysis(issue, files, repository);
      const patch = String(analysis.patch || '');
      if (analysis.shouldFix !== true) return ok(res, await createRun(repository, req.user._id, issue, analysis, null));
      const confidence = Number(analysis.confidence || 0);
      const branch = await githubApi(`/repos/${repository.fullName}/branches/${encodeURIComponent(repository.defaultBranch)}`, req.session.githubToken);
      if (confidence < 70 || !patch.startsWith('diff --git') || !analysis.relevantFiles?.length) throw new Error('The issue did not produce a sufficiently verified patch.');
      ok(res, await createRun(repository, req.user._id, issue, analysis, { patch, branch }));
    } catch (error) { next(error); }
  });
  async function createRun(repository, userId, issue, analysis, verified) {
    const run = { _id: `run_${crypto.randomBytes(6).toString('hex')}`, runId: undefined, userId, repositoryId: String(repository._id), issueNumber: issue.number,
      issueSnapshot: { title: issue.title, body: issue.body || '', htmlUrl: issue.html_url }, status: verified ? 'ready_for_review' : 'not_actionable',
      classification: analysis.classification || 'other', summary: analysis.summary || issue.title, rootCause: analysis.rootCause || 'The issue was reviewed against repository source.',
      relevantFiles: verified ? analysis.relevantFiles : [], generatedPatch: verified?.patch || '', patchSha256: verified ? hash(verified.patch) : null, baseCommitSha: verified?.branch?.commit?.sha || null,
      testResults: { status: 'not_run' }, approvalState: verified ? 'pending' : 'not_required', confidence: Number(analysis.confidence || 0), validationNotes: analysis.validationNotes || analysis.proposedFix || '', suggestedTestCommand: analysis.testCommand || 'npm test', createdAt: new Date(), updatedAt: new Date() };
    state.memory.runs.set(run._id, run); await saveRun(run); return run;
  }
  app.get('/api/agent/runs', withAuth, async (req, res) => {
    let runs = [...state.memory.runs.values()].filter(run => String(run.userId) === String(req.user._id));
    if (state.dbReady) runs = await AgentRun.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean();
    ok(res, runs.map(run => ({ ...run, _id: run.runId || String(run._id) })));
  });
  app.post('/api/agent/:runId/test', withAuth, async (req, res, next) => {
    try {
      const run = await findRun(req.params.runId, req.user._id); if (!run) return fail(res, 404, 'NOT_FOUND', 'Run not found.');
      const repository = await getRepository(run.repositoryId, req.user._id);
      run.status = 'testing';
      const test = await cloneAndTest(repository, run.generatedPatch, req.body.testCommand || run.suggestedTestCommand || 'npm test', req.session.githubToken);
      run.workspace = test.workspace; run.testResults = test; run.status = test.status === 'passed' ? 'ready_for_review' : 'failed';
      await saveRun(run); ok(res, run);
    } catch (error) { next(error); }
  });
  app.post('/api/agent/:runId/approve', withAuth, async (req, res, next) => { try { const run = await findRun(req.params.runId, req.user._id); if (!run) return fail(res, 404, 'NOT_FOUND', 'Run not found.'); run.approvalState = 'approved'; run.status = 'approved'; await saveRun(run); ok(res, { approved: true, runId: run._id }); } catch (error) { next(error); } });
  app.get('/api/reports', withAuth, async (req, res) => {
    let runs = [...state.memory.runs.values()].filter(run => String(run.userId) === String(req.user._id));
    if (state.dbReady) runs = await AgentRun.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean();
    ok(res, runs.filter(run => run.testResults?.status === 'passed'));
  });
  app.post('/api/agent/:runId/pull-request', withAuth, async (req, res, next) => {
    try {
      const run = await findRun(req.params.runId, req.user._id); if (!run) return fail(res, 404, 'NOT_FOUND', 'Run not found.');
      if (run.approvalState !== 'approved') return fail(res, 409, 'APPROVAL_REQUIRED', 'The patch must be approved first.');
      if (run.testResults?.status !== 'passed') return fail(res, 409, 'TESTS_REQUIRED', 'Docker tests must pass first.');
      const repository = await getRepository(run.repositoryId, req.user._id);
      const pullRequest = await publishToGitHub(repository, { number: run.issueNumber, title: run.issueSnapshot.title }, run.workspace, run.relevantFiles, req.session.githubToken, run.baseCommitSha);
      run.status = 'published'; run.pullRequest = pullRequest; await saveRun(run); ok(res, pullRequest);
    } catch (error) { next(error); }
  });
}
module.exports = { registerAgentRoutes };
