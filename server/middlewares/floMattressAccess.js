export function hasFloMattressAccess(req, module, action = "view") {
  const { userData, permissionConfig } = req.verified || {};
  if (!userData?.adminId || userData.tokenType === "raspberry-pi") return false;
  if (!userData.memberId) return true;

  const config = permissionConfig?.[0]?.permissionConfig;
  const grant = module === "measurementLogs" ? config?.logs?.measurementLogs : config?.[module];
  return grant?.view === true && grant[action] === true;
}

export function requireMeasurementLogsAccess(action = "view") {
  return (req, res, next) => {
    if (hasFloMattressAccess(req, "measurementLogs", action)) return next();
    return res.status(403).json({
      statusCode: 403,
      body: { status: "failed", message: "Measurement Logs permission is required" },
    });
  };
}
