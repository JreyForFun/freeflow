/**
 * hooks/useTimeFormatContext.tsx
 *
 * Global reactive time-format context. Wraps the app so any component can
 * read the current time format and react when Settings changes it.
 *
 * Usage:
 *   const { timeFmt } = useTimeFormatCtx();
 */

import React, { createContext, useCallback, useContext, useState } from 'react';
import { getTimeFormatPref, setTimeFormatPref, type TimeFormat } from './useTimeFormat';

interface TimeFormatContextValue {
  timeFmt: TimeFormat;
  setTimeFmt: (fmt: TimeFormat) => void;
}

const TimeFormatContext = createContext<TimeFormatContextValue>({
  timeFmt: '24h',
  setTimeFmt: () => {},
});

export function TimeFormatProvider({ children }: { children: React.ReactNode }) {
  const [timeFmt, setTimeFmtState] = useState<TimeFormat>(() => getTimeFormatPref());

  const setTimeFmt = useCallback((fmt: TimeFormat) => {
    setTimeFormatPref(fmt);
    setTimeFmtState(fmt);
  }, []);

  return (
    <TimeFormatContext.Provider value={{ timeFmt, setTimeFmt }}>
      {children}
    </TimeFormatContext.Provider>
  );
}

export function useTimeFormatCtx() {
  return useContext(TimeFormatContext);
}
