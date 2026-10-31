const { Repository } = require('../models');
const { state, ok, fail } = require('../runtime');
const { githubApi, parseRepositoryUrl } = require('../services/githubService');

function registerRepositoryRoutes(app, withAuth) {
  app.get('/api/github/repos', withAuth, async (req, res, next) => {
    try {
      const repositories = await githubApi('/user/repos?affiliation=owner,collaborator,organization_member&sort=updated&per_page=100', req.session.githubToken);
      ok(res, repositories.map(repository => ({
        id: repository.id,
        fullName: repository.full_name,
        name: repository.name,
        owner: repository.owner?.login,
        description: repository.description || '',
        private: repository.private,
        language: repository.language,
        htmlUrl: repository.html_url,
        defaultBranch: repository.default_branch,
      })));
    } catch (error) { next(error); }
  });
  app.post('/api/repositories/connect', withAuth, async (req, res, next) => {
    try {
      const repositoryValue = req.body.repositoryUrl || req.body.url || req.body.fullName;
      const parsed = parseRepositoryUrl(repositoryValue);
      if (!parsed) return fail(res, 400, 'VALIDATION_ERROR', 'Enter a valid GitHub repository URL.');
      const githubRepository = await githubApi(`/repos/${parsed.owner}/${parsed.name}`, req.session.githubToken);
      const repository = {
        githubRepositoryId: githubRepository.id, owner: githubRepository.owner.login,
        name: githubRepository.name, fullName: githubRepository.full_name, htmlUrl: githubRepository.html_url,
        defaultBranch: githubRepository.default_branch || 'main', primaryLanguage: githubRepository.language,
        description: githubRepository.description || '', visibility: githubRepository.private ? 'private' : 'public', connectedBy: req.user._id,
      };
      if (state.dbReady) {
        const saved = await Repository.findOneAndUpdate({ connectedBy: req.user._id, githubRepositoryId: repository.githubRepositoryId }, repository, { new: true, upsert: true, setDefaultsOnInsert: true });
        return ok(res, saved);
      }
      const memoryRepository = { ...repository, _id: String(githubRepository.id) };
      state.memory.repositories.set(memoryRepository._id, memoryRepository);
      ok(res, memoryRepository);
    } catch (error) { next(error); }
  });
  app.get('/api/repositories', withAuth, async (req, res, next) => {
    try {
      const repositories = state.dbReady ? await Repository.find({ connectedBy: req.user._id }).sort({ updatedAt: -1 }) : [...state.memory.repositories.values()].filter(repository => String(repository.connectedBy) === String(req.user._id));
      ok(res, repositories);
    } catch (error) { next(error); }
  });
  app.post('/api/repositories/:id/monitor', withAuth, async (req, res, next) => {
    try {
      const repository = await Repository.findOne({ _id: req.params.id, connectedBy: req.user._id });
      if (!repository) return fail(res, 404, 'NOT_FOUND', 'Repository not found.');
      repository.monitoringEnabled = true;
      repository.autoApprove = req.body.autoApprove === true;
      const callbackUrl = process.env.GITHUB_WEBHOOK_URL;
      const isPublicCallback = callbackUrl && !callbackUrl.includes('localhost') && !callbackUrl.includes('127.0.0.1');
      if (isPublicCallback && process.env.GITHUB_WEBHOOK_SECRET && !repository.webhookId) {
        try {
          const hooks = await githubApi(`/repos/${repository.fullName}/hooks`, req.session.githubToken);
          const existing = hooks.find(hook => hook.config?.url === callbackUrl);
          if (existing) repository.webhookId = existing.id;
          else {
            const created = await githubApi(`/repos/${repository.fullName}/hooks`, req.session.githubToken, { method: 'POST', body: { name: 'web', active: true, events: ['issues'], config: { url: callbackUrl, content_type: 'json', secret: process.env.GITHUB_WEBHOOK_SECRET } } });
            repository.webhookId = created.id;
          }
        } catch (error) { console.warn(`GitHub webhook unavailable for ${repository.fullName}; local polling mode remains active.`); }
      }
      if (!repository.lastSeenIssueNumber) {
        const issues = await githubApi(`/repos/${repository.fullName}/issues?state=all&sort=created&direction=desc&per_page=1`, req.session.githubToken);
        repository.lastSeenIssueNumber = issues[0]?.number || 0;
      }
      await repository.save();
      ok(res, { monitoringEnabled: true, mode: isPublicCallback && repository.webhookId ? 'webhook' : 'polling', autoApprove: repository.autoApprove });
    } catch (error) { next(error); }
  });
  app.get('/api/repositories/:id/issues', withAuth, async (req, res, next) => {
    try {
      const repository = state.dbReady ? await Repository.findOne({ _id: req.params.id, connectedBy: req.user._id }) : state.memory.repositories.get(req.params.id);
      if (!repository) return fail(res, 404, 'NOT_FOUND', 'Repository not found.');
      const perPage = Math.min(Number(req.query.perPage || 20), 100);
      const issues = await githubApi(`/repos/${repository.fullName}/issues?state=open&sort=updated&per_page=${perPage}`, req.session.githubToken);
      ok(res, issues.filter(issue => !issue.pull_request).map(issue => ({ _id: issue.id, number: issue.number, title: issue.title, body: issue.body || '', labels: issue.labels.map(label => typeof label === 'string' ? label : label.name), htmlUrl: issue.html_url })));
    } catch (error) { next(error); }
  });
}

module.exports = { registerRepositoryRoutes };
