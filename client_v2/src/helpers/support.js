/**
 * Support contact details shown when a client is blocked by something only
 * support can unblock — today, having no camera licence at all.
 *
 * Both fields are intentionally blank until the real details are decided. Every
 * consumer renders only the fields that are non-empty and falls back to plain
 * "contact support" wording when both are, so filling these in is the whole
 * change — no component edits needed.
 */
export const SUPPORT_CONTACT = {
  email: '',
  phone: '',
};

/** True when at least one contact detail is available to show. */
export const hasSupportContact = () =>
  Boolean(SUPPORT_CONTACT.email?.trim() || SUPPORT_CONTACT.phone?.trim());
