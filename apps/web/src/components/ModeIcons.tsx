export function FlashIcon({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className="inline-block">
      <path d="M9 1L3 9h4l-1 6 6-8H8l1-6z" fill="#facc15" stroke="#facc15" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}

export function DeepIcon({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className="inline-block">
      <circle cx="8" cy="8" r="5" stroke="#a78bfa" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="2" fill="#a78bfa" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2" stroke="#a78bfa" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

export function AutoIcon({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className="inline-block">
      <path d="M8 2l1.5 4H14l-3.5 2.5L12 13 8 10l-4 3 1.5-4.5L2 6h4.5z" fill="#22c55e" stroke="#22c55e" strokeWidth="0.5" strokeLinejoin="round" />
    </svg>
  );
}
