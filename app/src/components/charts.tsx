"use client";

import { useId, useState } from "react";

export type TimePoint = { at: number; value: number };

const W = 600;
const H = 180;

const dateLabel = (seconds: number) =>
  new Date(seconds * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const dateTimeLabel = (seconds: number) =>
  new Date(seconds * 1000).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

/** Round up to 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8 or 10 times a power of ten, for a tidy axis label. */
function niceCeil(value: number) {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((m) => m * power >= value) ?? 10;
  return step * power;
}

/**
 * A time series as an area chart. `step` holds each value until the next point (for running totals). The chart runs
 * to `until` (unix seconds). Labels are HTML so they stay readable at any width.
 */
export function TimeChart({
  points,
  until,
  step = false,
  zeroBased = true,
  format,
  label,
}: {
  points: TimePoint[];
  until: number;
  step?: boolean;
  zeroBased?: boolean;
  format: (value: number) => string;
  label: string;
}) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);

  if (!points.length) return <p className="py-10 text-center text-sm text-muted">No data yet.</p>;

  const start = points[0].at;
  const end = Math.max(until, points[points.length - 1].at);
  const span = Math.max(end - start, 3600);
  const x0 = start - span * 0.04;
  const x1 = end;

  const values = points.map((p) => p.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const pad = Math.max((max - min) * 0.25, max * 0.002, 0.5);
  const yMin = zeroBased ? 0 : min - pad;
  const yMax = zeroBased ? niceCeil(max * 1.15) : max + pad;

  const sx = (t: number) => ((t - x0) / (x1 - x0)) * W;
  const sy = (v: number) => H - ((v - yMin) / (yMax - yMin)) * H;

  // Line path: optional zero start for running totals, steps or straight segments, then out to `until`.
  const coords: [number, number][] = [];
  if (step) coords.push([sx(x0), sy(zeroBased ? 0 : points[0].value)]);
  points.forEach((p, i) => {
    if (step && coords.length) coords.push([sx(p.at), coords[coords.length - 1][1]]);
    coords.push([sx(p.at), sy(p.value)]);
    if (!step && i === 0) coords.unshift([sx(x0), sy(p.value)]);
  });
  coords.push([sx(x1), sy(points[points.length - 1].value)]);
  const line = coords.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H} L${coords[0][0].toFixed(1)},${H} Z`;

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const t = x0 + ((e.clientX - rect.left) / rect.width) * (x1 - x0);
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(p.at - t) < Math.abs(points[best].at - t)) best = i;
    });
    setHover(best);
  }

  const active = hover === null ? points.length - 1 : hover;
  const activePoint = points[active];
  const left = (sx(activePoint.at) / W) * 100;
  const top = (sy(activePoint.value) / H) * 100;

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="sr-only">{label}</figcaption>
      <div className="flex gap-2">
        <div className="flex flex-col justify-between py-0.5 text-right text-[11px] text-muted tabular-nums">
          <span>{format(yMax)}</span>
          <span>{format(yMin)}</span>
        </div>
        <div
          className="relative h-44 flex-1 touch-none"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label={label}
        >
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((f) => (
              <line
                key={f}
                x1={0}
                x2={W}
                y1={H * f}
                y2={H * f}
                stroke="var(--chart-grid)"
                strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <line x1={0} x2={W} y1={H} y2={H} stroke="var(--border)" vectorEffect="non-scaling-stroke" />
            <path d={area} fill={`url(#${gradientId})`} />
            <path
              d={line}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={2.5}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {hover !== null && (
              <line
                x1={sx(activePoint.at)}
                x2={sx(activePoint.at)}
                y1={0}
                y2={H}
                stroke="var(--muted)"
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
          {points.map((p, i) => (
            <span
              key={`${p.at}-${i}`}
              className={`absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-accent transition-transform ${i === active ? "scale-150" : ""}`}
              style={{ left: `${(sx(p.at) / W) * 100}%`, top: `${(sy(p.value) / H) * 100}%` }}
            />
          ))}
          <div
            className="pointer-events-none absolute z-10 rounded-lg border border-border bg-card px-2 py-1 text-xs whitespace-nowrap shadow-soft"
            style={{
              left: `${left}%`,
              top: `calc(${top}% - 10px)`,
              transform: `translate(${left > 70 ? "-100%" : left < 30 ? "0" : "-50%"}, -100%)`,
            }}
          >
            <span className="font-semibold tabular-nums">{format(activePoint.value)}</span>
            <span className="text-muted"> · {dateTimeLabel(activePoint.at)}</span>
          </div>
        </div>
      </div>
      <div className="ml-10 flex justify-between text-[11px] text-muted">
        <span>{dateLabel(start)}</span>
        <span>Now</span>
      </div>
    </figure>
  );
}

/** One horizontal bar split into labelled parts, with a legend. */
export function SplitBar({ parts }: { parts: { label: string; value: number; className: string }[] }) {
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-chart-grid">
        {total > 0 &&
          parts.map((p) =>
            p.value ? (
              <div key={p.label} className={p.className} style={{ width: `${(p.value / total) * 100}%` }} />
            ) : null,
          )}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${p.className}`} />
            {p.label} <span className="font-medium text-foreground tabular-nums">{p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
