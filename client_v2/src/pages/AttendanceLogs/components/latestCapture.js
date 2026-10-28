// Select by timestamp rather than relying on the API event order.
export const latestAttendanceCapture = (captures) => {
  let latest = null;
  let latestTime = -Infinity;
  for (const capture of Array.isArray(captures) ? captures : []) {
    const images = capture?.images;
    const image = images?.person || images?.personImage || images?.face || images?.faceImage || images?.frame || images?.frameImage;
    if (!image) continue;
    const parsed = Date.parse(capture.timestamp);
    const time = Number.isFinite(parsed) ? parsed : -Infinity;
    if (latest === null || time > latestTime) {
      latest = image;
      latestTime = time;
    }
  }
  return latest;
};
