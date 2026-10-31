const crypto = require('crypto');
const { User } = require('../models');
const { state, ok, fail } = require('../runtime');

exports.currentUser = (req, res) => req.session.user
  ? ok(res, { user: req.session.user })
  : fail(res, 401, 'UNAUTHORIZED', 'GitHub sign-in is required.');

exports.redirectToGitHub = (req, res) => {
  const stateToken = crypto.randomBytes(24).toString('hex');
  req.session.oauthState = stateToken;
  const params = new URLSearchParams({ client_id: process.env.GITHUB_CLIENT_ID, redirect_uri: `${process.env.API_PUBLIC_URL || 'http://localhost:8001'}/api/auth/github/callback`, scope: 'read:user user:email repo', state: stateToken });
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
};

exports.githubCallback = async (req, res, next) => {
  try {
    if (!req.query.code || req.query.state !== req.session.oauthState) return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/login?error=oauth_state`);
    delete req.session.oauthState;
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, code: req.query.code, redirect_uri: `${process.env.API_PUBLIC_URL || 'http://localhost:8001'}/api/auth/github/callback` }) });
    const token = await tokenResponse.json();
    if (!token.access_token) return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/login?error=github_denied`);
    const profileResponse = await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'RepoPilot/1.0' } });
    const profile = await profileResponse.json();
    if (!profileResponse.ok || !profile.id) throw new Error(`GitHub profile could not be retrieved (${profile.message || profileResponse.statusText})`);
    let userId = String(profile.id);
    if (state.dbReady) {
      const savedUser = await User.findOneAndUpdate({ githubId: profile.id }, { githubId: profile.id, username: profile.login, name: profile.name || profile.login, avatarUrl: profile.avatar_url, githubAccessToken: token.access_token }, { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true });
      userId = savedUser.id;
    }
    req.session.user = { _id: userId, githubId: profile.id, username: profile.login, name: profile.name || profile.login, avatarUrl: profile.avatar_url };
    req.session.githubToken = token.access_token;
    req.session.save(error => error ? next(error) : res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/dashboard?auth=success`));
  } catch (error) { next(error); }
};

exports.logout = (req, res) => req.session.destroy(error => error ? res.status(500).json({ success: false }) : ok(res, { loggedOut: true }));
