// Explicit local-only mode for exercising X-Ray against the shared dev DB.
export const isLocalXrayTest = () => process.env.XRAY_LOCAL_TEST_MODE === 'true';

export const localSessionCollection = () => {
  if (!isLocalXrayTest()) return undefined;
  const name = process.env.XRAY_LOCAL_SESSION_COLLECTION || '';
  if (!/^xray_controlled_[a-z0-9_]+$/.test(name)) {
    throw new Error('Local test requires an isolated xray_controlled_* session collection');
  }
  return name;
};

export function localTestGuard(req, res, next) {
  if (!isLocalXrayTest()) return next();
  const path = req.path;
  const xray = /^\/api\/v2\/xray(?:\/|$)/.test(path);
  const auth = /^\/api\/v2\/auth\/(?:by-login-pass|by-login-token|by-impersonation-token|by-amember-sso-token|refresh|logout)$/.test(path);
  // A few legacy endpoints delete on GET. Merely filtering HTTP verbs is unsafe.
  const destructive = /(?:^|[\/-])(?:delete|remove|revoke|terminate|reset|import)(?:[\/-]|$)/i.test(path);
  const read = ['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !destructive;
  if (!xray && !auth && !read) {
    return res.status(403).json({error:'local_test_read_only', message:'Only viewing, login and X-Ray actions are enabled in this local test'});
  }
  if (auth) {
    const sendJson = res.json.bind(res);
    res.json = payload => {
      const body = payload?.body || payload || {};
      console.info('[XRAY TEST AUTH] result ' + JSON.stringify({
        status:res.statusCode, ok:body.ok, authenticated:body.authenticated,
        code:typeof body.code==='number' ? body.code : undefined,
        reason:['subscription_expired','subscription_inactive'].includes(body.reason) ? body.reason : undefined,
      }));
      return sendJson(payload);
    };
  }
  if (xray || auth) {
    const t0 = Date.now();
    const point = /\/prompt$/.test(path) ? JSON.stringify({seq:req.body?.seq, offset:req.body?.offset, xNorm:req.body?.xNorm, yNorm:req.body?.yNorm}) : '';
    res.once('finish', () => console.info(`[XRAY TEST] ${req.method} ${path} status=${res.statusCode} ms=${Date.now()-t0} ${point}`));
  }
  return next();
}
