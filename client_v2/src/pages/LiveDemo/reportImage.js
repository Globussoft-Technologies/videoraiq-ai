// Convert media to PNG for browser-generated PDF and Excel files. If a media
// server rejects cross-origin downloads, callers retain the original link.
export async function loadReportImage(url) {
  if (!url) return null;
  try {
    // The public media route responds with Access-Control-Allow-Origin: *.
    // Credentialed cross-origin requests cannot read that response in browsers.
    const response = await fetch(url, { credentials: 'same-origin', signal: AbortSignal.timeout(10000) });
    if (!response.ok) return null;
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = objectUrl;
      });
      const scale = Math.min(1, 480 / img.width, 300 / img.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/png');
      return { dataUrl, bytes: Uint8Array.from(atob(dataUrl.split(',')[1]), (char) => char.charCodeAt(0)) };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return null;
  }
}

export async function loadReportImages(urls) {
  const unique = [...new Set(urls.filter(Boolean))];
  const images = new Map();
  for (let index = 0; index < unique.length; index += 6) {
    const batch = unique.slice(index, index + 6);
    const loaded = await Promise.all(batch.map(loadReportImage));
    batch.forEach((url, offset) => images.set(url, loaded[offset]));
  }
  return images;
}
