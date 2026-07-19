import type { ReactNode } from 'react';

/**
 * Processor marks for the trust row.
 *
 * These are monochrome wordmark placeholders, drawn as text inside an SVG so
 * every mark shares one optical weight and colour (currentColor) and none
 * visually outranks another. They are deliberately not the processors' real
 * trademarks: drop the official asset in and swap the <svg> body per entry
 * when licensing is cleared. The fixed viewBox height keeps the row from
 * shifting when a real logo replaces a placeholder.
 */
const MARKS: Array<{ name: string; w: number; label: string }> = [
  { name: 'MTN', w: 84, label: 'MTN' },
  { name: 'Airtel', w: 96, label: 'Airtel' },
  { name: 'Zamtel', w: 108, label: 'Zamtel' },
  { name: 'Zed Mobile', w: 132, label: 'Zed Mobile' },
  { name: 'Visa', w: 78, label: 'VISA' },
];

export function RailLogos(): ReactNode {
  return (
    <div className="set">
      {MARKS.map((m) => (
        <span className="rail" key={m.name}>
          <svg
            viewBox={`0 0 ${m.w} 30`}
            width={m.w}
            height={30}
            role="img"
            aria-label={m.name}
          >
            <text
              x="0"
              y="22"
              fill="currentColor"
              fontFamily="'IBM Plex Sans Variable','IBM Plex Sans',system-ui,sans-serif"
              fontSize="22"
              fontWeight="600"
              letterSpacing="-0.02em"
            >
              {m.label}
            </text>
          </svg>
        </span>
      ))}
    </div>
  );
}
