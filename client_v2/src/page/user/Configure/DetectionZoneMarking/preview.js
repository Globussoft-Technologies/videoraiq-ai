export function shouldShowSnapshot({ snapshotUrl, snapshotFailed, url, videoState, streamTimedOut }) {
  return !!snapshotUrl && !snapshotFailed && (!url || videoState === 'error' || streamTimedOut);
}

export function canResumeLivePreview(showSnapshot, size, video) {
  return !showSnapshot || !size.w || !video?.videoWidth ||
    (video.videoWidth === size.w && video.videoHeight === size.h);
}
