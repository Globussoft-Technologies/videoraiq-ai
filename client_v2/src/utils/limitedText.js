export const TEXT_LIMIT = 50;

export const limitedTextError = (value) => {
  if (value.length > TEXT_LIMIT) return `Maximum ${TEXT_LIMIT} characters allowed.`;
  if (!/^[A-Za-z0-9 ]*$/.test(value)) return 'Only letters, numbers, and spaces are allowed.';
  return '';
};
