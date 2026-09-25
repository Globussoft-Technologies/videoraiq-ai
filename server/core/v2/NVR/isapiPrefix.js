/**
 * API path prefix for Hikvision-protocol NVRs. Prama is rebranded Hikvision
 * firmware, and which prefix it serves depends on the firmware — both
 * confirmed live on the same model (PT-NRAS2B32-K4):
 *   V4.74.x → /pramaAPI/  (/ISAPI/ gets an empty reply)
 *   V4.71.x → /ISAPI/     (/pramaAPI/ returns 404)
 * So probe /pramaAPI/ and fall back only on a 404. Any other status
 * (200, or 401 for bad credentials) means /pramaAPI/ exists.
 */
export async function isapiPrefix(client, baseUrl, brand) {
  if (String(brand).toLowerCase() !== "prama") return "ISAPI";
  const res = await client.fetch(`${baseUrl}/pramaAPI/System/deviceInfo`);
  await res.arrayBuffer().catch(() => {}); // release the connection
  return res.status === 404 ? "ISAPI" : "pramaAPI";
}
