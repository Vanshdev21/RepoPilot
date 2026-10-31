const { Repository } = require('../models');
const { state, ok, fail } = require('../runtime');
const { answerRepositoryQuestion, loadRepositoryContext } = require('../services/agentService');

function registerChatRoutes(app, withAuth) {
  app.post('/api/chat/repository', withAuth, async (req, res, next) => {
    try {
      const { repositoryId, question, history = [] } = req.body;
      if (!repositoryId || !String(question || '').trim()) return fail(res, 400, 'VALIDATION_ERROR', 'Repository and question are required.');
      const repository = state.dbReady ? await Repository.findOne({ _id: repositoryId, connectedBy: req.user._id }) : state.memory.repositories.get(repositoryId);
      if (!repository) return fail(res, 404, 'NOT_FOUND', 'Repository not found.');
      const contextFiles = await loadRepositoryContext(repository, { title: 'Repository code explanation', body: String(question).slice(0, 500) }, req.session.githubToken);
      const contextQuestion = history.length ? `Conversation:\n${history.slice(-6).map(message => `${message.role}: ${message.content}`).join('\n')}\n\nQuestion: ${question}` : question;
      const answer = await answerRepositoryQuestion(repository, contextQuestion, contextFiles, req.session.githubToken);
      ok(res, { answer, repository: repository.fullName, sources: contextFiles.map(file => file.path) });
    } catch (error) { next(error); }
  });
}
module.exports = { registerChatRoutes };
