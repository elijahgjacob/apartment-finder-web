// The app mark inlined as a data URI so the OG/apple icon routes can draw it
// without filesystem or network access. Keep in sync with public/app-icon.svg.
const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="8" fill="#1D1B16"/>
  <g fill="#FCFCFA">
    <rect x="12" y="12" width="10" height="10" rx="2"/>
    <rect x="27" y="12" width="10" height="10" rx="2"/>
    <rect x="42" y="12" width="10" height="10" rx="2"/>
    <rect x="12" y="27" width="10" height="10" rx="2"/>
    <rect x="27" y="27" width="10" height="10" rx="2" fill="#FB631B"/>
    <rect x="42" y="27" width="10" height="10" rx="2"/>
    <rect x="12" y="42" width="10" height="10" rx="2"/>
    <rect x="27" y="42" width="10" height="10" rx="2"/>
    <rect x="42" y="42" width="10" height="10" rx="2"/>
  </g>
</svg>`

export const MARK_DATA_URI = `data:image/svg+xml,${encodeURIComponent(MARK_SVG)}`
