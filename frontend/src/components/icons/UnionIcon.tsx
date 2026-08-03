export function UnionIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Top database (small) */}
      <ellipse cx="5" cy="4.5" rx="3.2" ry="1.3" />
      <path d="M1.8 4.5v3c0 .72 1.43 1.3 3.2 1.3s3.2-.58 3.2-1.3v-3" />

      {/* Bottom database (small) */}
      <ellipse cx="5" cy="15" rx="3.2" ry="1.3" />
      <path d="M1.8 15v3c0 .72 1.43 1.3 3.2 1.3s3.2-.58 3.2-1.3v-3" />

      {/* Flow lines converging to arrow */}
      <path d="M8.2 6.5L13 11" />
      <path d="M8.2 17L13 12.5" />

      {/* Arrow tip pointing right */}
      <path d="M13 11.75L19.5 11.75" />
      <path d="M17 9.25l2.5 2.5-2.5 2.5" />
    </svg>
  );
}
