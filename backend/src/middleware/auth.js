const mongoose = require('mongoose');
const { User } = require('../models');
const { state, fail } = require('../runtime');

async function requireAuth(req, res, next) {
  if (!req.session.user) return fail(res, 401, 'UNAUTHORIZED', 'GitHub sign-in is required.');
  try {
    if (state.dbReady && !mongoose.isValidObjectId(req.session.user._id)) {
      const user = await User.findOne({ githubId: req.session.user.githubId });
      if (!user) return fail(res, 401, 'UNAUTHORIZED', 'Session user no longer exists.');
      req.session.user._id = user.id;
    }
    req.user = state.dbReady ? await User.findOne({ githubId: req.session.user.githubId }) : req.session.user;
    if (!req.user) return fail(res, 401, 'UNAUTHORIZED', 'User session expired.');
    return next();
  } catch (error) { return next(error); }
}

module.exports = { requireAuth };
