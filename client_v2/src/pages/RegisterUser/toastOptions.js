// Shrink a sonner toast to fit its content instead of the library's fixed
// default width, which leaves a large empty gap after short one-line messages.
export const COMPACT_TOAST = {
  classNames: {
    toast: '!w-fit !max-w-[90vw]',
    title: '!whitespace-nowrap',
  },
};
