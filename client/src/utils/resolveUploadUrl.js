// Build a usable image src from a stored profilePic / media path.
//
// Some records store a full absolute URL (e.g. face-detection images returned
// by the API already include the host + /api/v1/uploads/...), while older
// records store just the relative path. Prepending the base to a value that is
// already absolute produces a doubled URL, so:
//   - absolute (starts with http:// or https://) → use as-is
//   - relative                                    → prepend `${base}/api/v1/uploads/`
export const resolveUploadUrl = (path, base = import.meta.env.VITE_BACKEND) => {
  if (!path || typeof path !== 'string') return '';
  if (/^https?:\/\//i.test(path)) return path;
  // Normalise so we never emit a double or missing slash between segments.
  const cleanBase = String(base || '').replace(/\/+$/, '');
  const cleanPath = path.replace(/^\/+/, '');
  return `${cleanBase}/api/v1/uploads/${cleanPath}`;
};

export default resolveUploadUrl;
