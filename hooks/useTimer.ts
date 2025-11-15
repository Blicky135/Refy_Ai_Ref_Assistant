
import { useState, useEffect, useRef, useCallback } from 'react';

export const useTimer = (initialSeconds: number) => {
  const [seconds, setSeconds] = useState(initialSeconds);
  const [isActive, setIsActive] = useState(false);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (isActive && seconds > 0) {
      intervalRef.current = window.setInterval(() => {
        setSeconds((prevSeconds) => prevSeconds - 1);
      }, 1000);
    } else if (seconds <= 0 && isActive) {
      setIsActive(false);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive, seconds]);
  
  const start = useCallback(() => {
    if (seconds > 0) {
      setIsActive(true);
    }
  }, [seconds]);

  const pause = useCallback(() => {
    setIsActive(false);
  }, []);

  const reset = useCallback((newSeconds: number) => {
    setIsActive(false);
    setSeconds(newSeconds);
  }, []);
  
  const addTime = useCallback((additionalSeconds: number) => {
    setSeconds(prev => prev + additionalSeconds);
    setIsActive(true);
  }, []);

  const formatTime = (timeInSeconds: number) => {
    const minutes = Math.floor(timeInSeconds / 60);
    const remainingSeconds = timeInSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  };

  return { time: seconds, start, pause, reset, addTime, isActive, formattedTime: formatTime(seconds) };
};