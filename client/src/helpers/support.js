/**
 * Support contact details shown when a client is blocked by something only
 * support can unblock — today, having no camera licence at all.
 *
 * Every consumer renders only the fields that are non-empty and falls back to
 * plain "contact support" wording when both are, so filling these in is the
 * whole change — no component edits needed.
 *
 * Kept in step with client_v2/src/helpers/support.js.
 */
export const SUPPORT_CONTACT = {
  email: 'support@videoraiq.com',
  // Left blank deliberately: only the address has been decided. Every consumer
  // renders whichever fields are non-empty, so adding a number later is a
  // one-line change here and nothing else.
  phone: '',
};

/** True when at least one contact detail is available to show. */
export const hasSupportContact = () =>
  Boolean(SUPPORT_CONTACT.email?.trim() || SUPPORT_CONTACT.phone?.trim());
