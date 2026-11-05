// Request-local only: never retain an admin across requests or put its document
// into req.verified, which is also used to build cache identities/payloads.
const admins = new WeakMap();

export function rememberRequestAdmin(req, admin) {
  admins.set(req, admin);
}

export async function requestAdmin(req, load) {
  const adminId = req?.verified?.userData?.adminId;
  const admin = admins.get(req);
  if (admin && adminId && String(admin._id) === String(adminId)) return admin;
  return load();
}
