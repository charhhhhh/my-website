"use client";

import { useEffect, useState } from "react";

type Item = { label: string; value: number };

/** Win98 那種一格一格的進度條，掛載後才長出來。 */
export default function Meter({ items }: { items: Item[] }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOn(true), 120);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="rows">
      {items.map((it) => (
        <div className="meter" key={it.label}>
          <span>{it.label}</span>
          <span
            className="meter__track"
            role="meter"
            aria-valuenow={it.value}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={it.label}
          >
            <span className="meter__fill" style={{ width: on ? `${it.value}%` : 0 }} />
          </span>
          <span className="meter__num">{it.value}%</span>
        </div>
      ))}
    </div>
  );
}
