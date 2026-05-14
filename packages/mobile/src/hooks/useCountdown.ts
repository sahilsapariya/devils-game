/**
 * Real-time countdown to an ISO timestamp. Tick rate 1Hz.
 */
import { useEffect, useState } from 'react';

export interface CountdownParts {
  totalMs: number;
  isElapsed: boolean;
  hours: number;
  minutes: number;
  seconds: number;
  formatted: string; // HH:MM:SS
}

function compute(targetMs: number): CountdownParts {
  const diff = targetMs - Date.now();
  if (diff <= 0) {
    return {
      totalMs: 0,
      isElapsed: true,
      hours: 0,
      minutes: 0,
      seconds: 0,
      formatted: '00:00:00',
    };
  }
  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number): string => n.toString().padStart(2, '0');
  return {
    totalMs: diff,
    isElapsed: false,
    hours,
    minutes,
    seconds,
    formatted: `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`,
  };
}

export function useCountdown(targetIso: string | null): CountdownParts {
  const targetMs = targetIso ? new Date(targetIso).getTime() : Date.now();
  const [parts, setParts] = useState<CountdownParts>(() => compute(targetMs));

  useEffect(() => {
    setParts(compute(targetMs));
    const handle = setInterval(() => {
      setParts(compute(targetMs));
    }, 1000);
    return () => clearInterval(handle);
  }, [targetMs]);

  return parts;
}
