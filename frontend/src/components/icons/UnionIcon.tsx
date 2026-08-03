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
      {/* Top database */}
      <ellipse cx="5" cy="4.5" rx="3.2" ry="1.3" />
      <path d="M1.8 4.5v3c0 .72 1.43 1.3 3.2 1.3s3.2-.58 3.2-1.3v-3" />

      {/* Bottom database */}
      <ellipse cx="5" cy="15" rx="3.2" ry="1.3" />
      <path d="M1.8 15v3c0 .72 1.43 1.3 3.2 1.3s3.2-.58 3.2-1.3v-3" />

      {/* Flow lines converging */}
      <path d="M8.2 6.5L13 11" />
      <path d="M8.2 17L13 12.5" />

      {/* Arrow line */}
      <path d="M13 11.75L17 11.75" />

      {/* Right database (output) */}
      <ellipse cx="20" cy="10.5" rx="2.5" ry="1" />
      <path d="M17.5 10.5v2.5c0 .55 1.12 1 2.5 1s2.5-.45 2.5-1v-2.5" />
    </svg>
  );
}
