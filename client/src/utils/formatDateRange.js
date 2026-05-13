export const formatDateRange = (start, end) => {
  if (!start || !end) return '';

  const startDate = new Date(start);
  const endDate = new Date(end);

  const options = { month: 'short', day: 'numeric' };

  const startStr = startDate.toLocaleDateString(undefined, options);
  const endStr = endDate.toLocaleDateString(undefined, options);
  return `${startStr} - ${endStr}`;
};

export const formatDate = (start, end) => {
  if (!start || !end) return '';

  const startDate = new Date(start);
  const endDate = new Date(end);

  const options = { day: '2-digit', month: 'short', year: 'numeric' };

  const startStr = startDate.toLocaleDateString(undefined, options);
  const endStr = endDate.toLocaleDateString(undefined, options);

  return `${startStr}`;
};



export const formatDateCorrectDetection = (date) => {
  return date.toLocaleDateString('en-CA'); // 'YYYY-MM-DD' format in local time
};


export const formatDateCorrect = (date) => {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');

  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1); // Months are 0-based
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());

  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
};
