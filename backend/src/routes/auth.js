const { requireAuth } = require('../middleware/auth');
const auth = require('../controllers/authController');

function registerAuthRoutes(app) {
  app.get('/api/auth/me', auth.currentUser);
  app.get('/api/auth/github', auth.redirectToGitHub);
  app.get('/api/auth/github/callback', auth.githubCallback);
  app.post('/api/auth/logout', requireAuth, auth.logout);
}
module.exports = { registerAuthRoutes };
