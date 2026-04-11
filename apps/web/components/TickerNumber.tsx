"use client";

/**
 * TickerNumber — renders a number that animates with a subtle roll
 * whenever its value changes. Used for balances and metric counters
 * so the UI feels alive when funds move.
 */

import { useEffect, useRef, useState } from "react";

export function TickerNumber({
  value,
  className,
}: {
  value: string | number;
  className?: string;
}) {
  const [display, setDisplay] = useState(String(value));
  const [pulse, setPulse] = useState(false);
  const prev = useRef(display);

  useEffect(() => {
    const next = String(value);
    if (next !== prev.current) {
      setDisplay(next);
      prev.current = next;
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 700);
      return () => clearTimeout(t);
    }
  }, [value]);

  return (
    <span
      className={`inline-block tabular-nums ${pulse ? "ticker-pop" : ""} ${className ?? ""}`}
    >
      {display}
    </span>
  );
}
