import React, { createContext, useContext } from 'react';

const InnerSettingsContext = createContext(null);

export const InnerSettingsProvider = ({ value, children }) => (
  <InnerSettingsContext.Provider value={value}>{children}</InnerSettingsContext.Provider>
);

export const useInnerSettings = () => {
  const ctx = useContext(InnerSettingsContext);
  if (!ctx) return {};
  return ctx;
};

export default InnerSettingsContext;
