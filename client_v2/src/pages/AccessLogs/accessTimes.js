// Prefer the event type; older logs use the current camera configuration.
// Never infer entry or exit from the number or order of captures.
export const getAccessTimes = (sessions = []) => {
  let enteredIn = null;
  let exitTiming = null;
  for (const session of sessions) {
    const type = session.cameraType ?? session.checkType ?? session.channel?.checkType;
    const time = session.timestamp;
    if (!time || !Number.isFinite(new Date(time).getTime())) continue;
    if (type === 'checkin' && (!enteredIn || new Date(time) < new Date(enteredIn))) enteredIn = time;
    if (type === 'checkout' && (!exitTiming || new Date(time) > new Date(exitTiming))) exitTiming = time;
  }
  return { enteredIn, exitTiming };
};
