const NOT_PROVIDED = 'Not provided'

export const profileText = (value) =>
  typeof value === 'string' && value.trim() ? value.trim() : NOT_PROVIDED

export const getProfileRole = (user, token) => {
  // Read an existing JWT claim for display only. Server-side authorization
  // remains unchanged; never treat client-decoded claims as proof of access.
  try {
    if (!user?.id || typeof token !== 'string') return NOT_PROVIDED
    const parts = token.split('.')
    if (parts.length !== 3) return NOT_PROVIDED
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')))
    if (String(payload.id) !== String(user.id)) return NOT_PROVIDED
    const role = profileText(payload.role)
    return role === 'superAdmin' ? 'Super Admin' : role
  } catch {
    return NOT_PROVIDED
  }
}
