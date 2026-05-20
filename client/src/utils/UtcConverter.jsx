import moment from 'moment';

/**
 * Replaces timestamp ranges with formatted range + duration.
 * If no timestamps exist, returns the original text.
 * @param {string} text
 * @returns {string}
 */
export const formatFromToTimestamps = (text) => {
  const regex =
    /from\s+([^\s]+)\s+to\s+([^\s.]+(?:\.\d{6})?\+\d{2}:\d{2})/i;
  const match = text.match(regex);

  if (match) {
    let [fullMatch, rawStart, rawEnd] = match;

    const clean = (str) => str.replace(/\.(\d{3})\d{3}/, '.$1');
    const start = moment(clean(rawStart));
    const end = moment(clean(rawEnd));

    if (start.isValid() && end.isValid()) {
      const formattedStart = start.format('YYYY-MM-DD HH:mm:ss');
      const formattedEnd = end.format('YYYY-MM-DD HH:mm:ss');
      const duration = end.diff(start, 'seconds');

      const formattedRange = `from ${formattedStart} to ${formattedEnd} (${duration} seconds)`;
      return text.replace(fullMatch, formattedRange);
    }
  }

  // No match or invalid timestamps — return original text
  return text;
};
