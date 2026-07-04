// Users quick-created from the Flagged Users flow get a backend-generated
// placeholder email (e.g. `quickcreate+<id>@placeholder.local`) because the
// AuthorizedUser schema requires an email. Those are not real addresses, so we
// blank them out for display instead of showing the placeholder.
const PLACEHOLDER_EMAIL = /@placeholder\.local$/i;

export const displayEmail = (email) => {
  if (!email || PLACEHOLDER_EMAIL.test(email)) return '';
  return email;
};

export default displayEmail;
