const PLACEHOLDER_EMAIL_RE = /^quickcreate\+[a-f0-9]+@placeholder\.local$/i;
export const displayEmail = (email) => (
  PLACEHOLDER_EMAIL_RE.test(email || "") ? "" : (email || "")
);
export const stripPlaceholderEmail = (user) => (
  PLACEHOLDER_EMAIL_RE.test(user?.email || "") ? { ...user, email: "" } : user
);
