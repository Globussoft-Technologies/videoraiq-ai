export const DEFAULT_REQUIRED_JOINTS = 6;

export function panelCounts(panel) {
  const required = Number(panel.requiredJoints);
  const requiredJoints = Number.isInteger(required) && required > 0 ? required : DEFAULT_REQUIRED_JOINTS;
  const completedJoints = (panel.zones || []).reduce((sum, zone) => {
    const done = Number(zone.done);
    return sum + (Number.isFinite(done) && done > 0 ? done : 0);
  }, 0);
  return { requiredJoints, completedJoints, missedJoints: Math.max(0, requiredJoints - completedJoints) };
}
