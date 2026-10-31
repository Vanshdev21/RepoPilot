const crypto = require('crypto');

const state = {
  dbReady: false,
  memory: { repositories: new Map(), runs: new Map(), events: new Map() },
};

const requestMeta = () => ({
  requestId: `req_${crypto.randomBytes(8).toString('hex')}`,
  timestamp: new Date().toISOString(),
});

function ok(res, data, meta = {}) {
  res.json({ success: true, data, meta: { ...requestMeta(), ...meta } });
}

function fail(res, status, code, message) {
  res.status(status).json({ success: false, error: { code, message, retryable: false }, meta: requestMeta() });
}

module.exports = { state, ok, fail, requestMeta };
