export default function LeafIcon({ size = 28, color = "hsl(145,38%,34%)" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill={color}/>
      <path d="M16 26C16 26 9 20.5 9 14.5C9 11 11.8 8 16 8C20.2 8 23 11 23 14.5C23 20.5 16 26 16 26Z" fill="white" opacity="0.92"/>
      <line x1="16" y1="26" x2="16" y2="14" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="16" y1="20" x2="19.5" y2="16.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity="0.6"/>
      <line x1="16" y1="17" x2="12.5" y2="13.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity="0.6"/>
    </svg>
  );
}
