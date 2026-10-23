// Door open/close incidents (DS door contract §5). DS posts an alert every
// threshold while a door stays open (or closed) and one resolved post when it
// changes back. Each post is its own incident; eventId names the post (episode
// + alertCount + alert/resolved) so a retried post is stored only once.
// Used by the v1 and v2 createIncidents.

const isTrue = (value) => value === true || value === "true";

/**
 * Normalizes a door post in place. The episode is DS's eventId, else camera +
 * door + stateSince, the grouping the contract itself defines.
 */
export const normalizeDoorPost = (body) => {
  body.isResolved = isTrue(body.isResolved);
  if (body.doorStatus) body.doorStatus = String(body.doorStatus).toLowerCase();
  body.zoneName = body.zoneName || body.zone || null;
  const episode = String(
    body.eventId || [body.channelId || body.cameraId, body.zoneName, body.stateSince].join(":"),
  ).trim();
  body.eventId = [episode, Number(body.alertCount) || 1, body.isResolved ? "resolved" : "alert"].join(":");
  return body;
};

/** The incident a retry of this post already created, else null. */
export const findDoorRetry = (Model, { userId, channelId, body }) =>
  Model.findOne({ userId: String(userId), channelId, eventId: body.eventId });
