import { useState, useEffect } from 'react';

/**
 * A hook that delays updating a value for the specified time this is needed we don't wanna hit the API on every keystroke
 * @param {*} value - The value to debounce
 * @param {number} delay - The delay time in milliseconds
 * @returns {*} - The debounced value
 */
const useDebounce = (value, delay = 500) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
};

export default useDebounce;
