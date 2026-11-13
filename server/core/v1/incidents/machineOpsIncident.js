// A durable unique key protects both retries and concurrent deliveries. Mongo's
// discriminator scopes this index to machineOpsDetection incidents.
export const findMachineOpsRetry = (Model, { userId, channelId, body }) =>
  Model.findOne({ userId: String(userId), channelId, machineId: body.machineId, eventId: body.eventId });
