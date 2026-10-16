// Door open/close incidents (DS door contract §5). DS posts an alert every
// threshold while a door stays open (or closed) and one resolved post when it
// changes back. All posts of one episode share an eventId and become ONE
// incident: the first alert creates it, later posts update it.
// Used by the v1 and v2 createIncidents.

const isTrue = (value) => value === true || value === "true";

/**
 * Normalizes a door post in place. Without DS's eventId the episode is
 * camera + door + stateSince, the grouping the contract itself defines.
 */
export const normalizeDoorPost = (body) => {
  body.isResolved = isTrue(body.isResolved);
  if (body.doorStatus) body.doorStatus = String(body.doorStatus).toLowerCase();
  body.zoneName = body.zoneName || body.zone || null;
  body.eventId = String(
    body.eventId || [body.channelId || body.cameraId, body.zoneName, body.stateSince].join(":"),
  ).trim();
  return body;
};

/**
 * Applies a repeat alert or the resolved post to the episode's incident.
 * Returns null for a new episode (the caller creates the incident), else
 * { incident, applied }; applied is false for a retry of a post already in.
 */
export const applyDoorEpisodePost = async (Model, { userId, channelId, body }) => {
  const incident = await Model.findOne({ userId: String(userId), channelId, eventId: body.eventId });
  if (!incident) return null;

  const alertCount = Number(body.alertCount) || incident.alertCount || 1;
  const resolving = body.isResolved && !incident.isResolved;
  const newAlert = !body.isResolved && !incident.isResolved && alertCount > (incident.alertCount || 0);
  if (!resolving && !newAlert) return { incident, applied: false };

  const at = body.timeOfIncident ? new Date(body.timeOfIncident) : new Date();
  incident.alertCount = alertCount;
  if (body.durationSec != null) incident.durationSec = Number(body.durationSec);
  for (const field of ["incidentName", "description", "Image", "doorStatus", "severity"]) {
    if (body[field]) incident[field] = body[field];
  }
  if (resolving) {
    incident.isResolved = true;
    incident.stateEndedAt = at;
  } else {
    incident.lastAlertAt = at;
  }
  await incident.save();
  return { incident, applied: true };
};
