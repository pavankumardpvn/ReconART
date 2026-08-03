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
      <ellipse cx="12" cy="3.5" rx="3.5" ry="1.3" />
      <path d="M8.5 3.5v3c0 .72 1.57 1.3 3.5 1.3s3.5-.58 3.5-1.3v-3" />

      {/* Flow line down from top DB */}
      <path d="M12 7.8v3" />

      {/* Middle connection node */}
      <circle cx="12" cy="12" r="1" fill="currentColor" />

      {/* Flow line down to bottom DB */}
      <path d="M12 13v3.2" />

      {/* Bottom database */}
      <ellipse cx="12" cy="17.5" rx="3.5" ry="1.3" />
      <path d="M8.5 17.5v3c0 .72 1.57 1.3 3.5 1.3s3.5-.58 3.5-1.3v-3" />
    </svg>
  );
}
