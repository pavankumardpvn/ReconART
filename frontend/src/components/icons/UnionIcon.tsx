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
      {/* Left database */}
      <ellipse cx="6.5" cy="6" rx="4" ry="1.8" />
      <path d="M2.5 6v5c0 1 1.8 1.8 4 1.8S10.5 12 10.5 11V6" />
      <path d="M2.5 8.5c0 1 1.8 1.8 4 1.8s4-.8 4-1.8" />

      {/* Right database */}
      <ellipse cx="17.5" cy="12" rx="4" ry="1.8" />
      <path d="M13.5 12v5c0 1 1.8 1.8 4 1.8s4-.8 4-1.8v-5" />
      <path d="M13.5 14.5c0 1 1.8 1.8 4 1.8s4-.8 4-1.8" />

      {/* Flow arrow connecting them */}
      <path d="M10.5 9l3 3" strokeDasharray="2 1.5" />
    </svg>
  );
}
