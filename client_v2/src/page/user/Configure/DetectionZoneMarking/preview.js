export function shouldShowSnapshot({ snapshotUrl, snapshotFailed, url, videoState, streamTimedOut }) {
  return !!snapshotUrl && !snapshotFailed && (!url || videoState === 'error' || streamTimedOut);
}

export function canResumeLivePreview(showSnapshot, size, video) {
  return !showSnapshot || !size.w || !video?.videoWidth ||
    (video.videoWidth === size.w && video.videoHeight === size.h);
}

export function snapshotForPreview(nextCamera, previousCamera) {
  if (nextCamera?.latestSnapshot?.path) return nextCamera.latestSnapshot;
  // Detection-setting responses may contain only a partial linked camera.
  if (String(nextCamera?._id) === String(previousCamera?._id)) return previousCamera?.latestSnapshot;
  return undefined;
}
