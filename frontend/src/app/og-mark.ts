// The app mark inlined as a data URI so the OG/apple icon routes can draw it
// without filesystem or network access. Keep in sync with public/app-icon.svg.
const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff7a33"/>
      <stop offset="1" stop-color="#e5540f"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="16" fill="url(#tile)"/>
  <path d="M30 18 L46 32 V46 Q46 50 42 50 H18 Q14 50 14 46 V32 Z" fill="#ffffff"/>
  <rect x="26" y="38" width="8" height="12" rx="2" fill="#ee5811"/>
  <path d="M12 2 14 9 21 11 14 13 12 20 10 13 3 11 10 9z" transform="translate(38.5,4.5) scale(0.62)" fill="#ffffff"/>
</svg>`

export const MARK_DATA_URI = `data:image/svg+xml,${encodeURIComponent(MARK_SVG)}`
