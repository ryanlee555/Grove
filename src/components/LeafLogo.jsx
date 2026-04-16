export default function LeafLogo({ px = 40 }) {
  return (
    <div className="rounded-full flex items-center justify-center shrink-0"
      style={{ width: px, height: px, backgroundColor: '#3a7d54' }}>
      <svg viewBox="0 0 24 24" fill="none" style={{ width: px * 0.62, height: px * 0.62 }}>
        <path d="M10 19C4 14 6 4 14 3C20 2 22 8 20 14C17 20 13 22 10 19Z"
          stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M10 19C12 14 14 10 17 5"
          stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M10 19C10 20 11 21.5 11 23"
          stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    </div>
  )
}
