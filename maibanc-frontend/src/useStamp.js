import { useState, useCallback, useRef } from 'react';

export function useStamp(duration = 2200) {
  const [stamp, setStamp] = useState(null);
  const timeoutRef = useRef(null);

  const showStamp = useCallback(
    (text) => {
      setStamp(text);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setStamp(null), duration);
    },
    [duration]
  );

  return [stamp, showStamp];
}
