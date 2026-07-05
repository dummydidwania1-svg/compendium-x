// Curated, on-brand preset avatars for Case CompendiumX.
// Editorial, warm, friendly — sharp-cornered tiles in the platform palette
// (espresso / sienna / ivory / scholar-green / antique-gold).
// Only the `id` is persisted on the profile as `avatarPreset`; the SVG is
// rendered inline so it stays crisp at any size and needs no network round-trip.

export type PresetAvatar = {
  id: string
  label: string
  /** Complete inline SVG markup. 100x100 viewBox, no width/height (sized by container). */
  svg: string
}

export const PRESET_AVATARS: PresetAvatar[] = [
  {
    id: 'compass',
    label: 'Compass',
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="ccxA1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3B2F2F"/><stop offset="1" stop-color="#5C4033"/></linearGradient></defs><rect width="100" height="100" fill="url(#ccxA1)"/><circle cx="50" cy="50" r="23" fill="none" stroke="#D8B978" stroke-width="3.5"/><path d="M50 33 L56.5 50 L50 67 L43.5 50 Z" fill="#D8B978"/><circle cx="50" cy="50" r="3" fill="#fff8f0"/></svg>`,
  },
  {
    id: 'compendium',
    label: 'Compendium',
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="ccxA2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3D5A35"/><stop offset="1" stop-color="#2c3a29"/></linearGradient></defs><rect width="100" height="100" fill="url(#ccxA2)"/><path d="M50 37 C43 32 33 32 27 35 L27 64 C33 61 43 61 50 65 C57 61 67 61 73 64 L73 35 C67 32 57 32 50 37 Z" fill="none" stroke="#fff8f0" stroke-width="3.4" stroke-linejoin="round"/><line x1="50" y1="37" x2="50" y2="65" stroke="#fff8f0" stroke-width="3.4"/></svg>`,
  },
  {
    id: 'brew',
    label: 'Brew',
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="ccxA3" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5C4033"/><stop offset="1" stop-color="#3B2F2F"/></linearGradient></defs><rect width="100" height="100" fill="url(#ccxA3)"/><path d="M33 43 H63 V52 C63 60.5 56.5 66 48 66 C39.5 66 33 60.5 33 52 Z" fill="none" stroke="#fff8f0" stroke-width="3.3" stroke-linejoin="round"/><path d="M63 47 C71 47 71 57 63 57" fill="none" stroke="#fff8f0" stroke-width="3.3"/><path d="M43 30 C41 33 45 35 43 38" fill="none" stroke="#fff8f0" stroke-width="2.6" stroke-linecap="round"/><path d="M53 30 C51 33 55 35 53 38" fill="none" stroke="#fff8f0" stroke-width="2.6" stroke-linecap="round"/></svg>`,
  },
  {
    id: 'spark',
    label: 'Spark',
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="ccxA4" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#D8B978"/><stop offset="1" stop-color="#b8934f"/></linearGradient></defs><rect width="100" height="100" fill="url(#ccxA4)"/><path d="M50 30 C40 30 33 37 33 46 C33 52 36 55 39 59 C41 61 41 63 41 65 H59 C59 63 59 61 61 59 C64 55 67 52 67 46 C67 37 60 30 50 30 Z" fill="none" stroke="#2c2218" stroke-width="3.2" stroke-linejoin="round"/><line x1="43" y1="70" x2="57" y2="70" stroke="#2c2218" stroke-width="3.2" stroke-linecap="round"/></svg>`,
  },
  {
    id: 'ledger',
    label: 'Ledger',
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="ccxA5" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2c2218"/><stop offset="1" stop-color="#3B2F2F"/></linearGradient></defs><rect width="100" height="100" fill="url(#ccxA5)"/><rect x="34" y="50" width="8" height="18" fill="#D8B978"/><rect x="46" y="40" width="8" height="28" fill="#D8B978"/><rect x="58" y="32" width="8" height="36" fill="#D8B978"/></svg>`,
  },
  {
    id: 'quill',
    label: 'Quill',
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="ccxA6" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3D5A35"/><stop offset="1" stop-color="#2f4728"/></linearGradient></defs><rect width="100" height="100" fill="url(#ccxA6)"/><path d="M35 66 C45 56 58 40 68 32 C66 46 58 60 44 66 Z" fill="none" stroke="#D8B978" stroke-width="3.2" stroke-linejoin="round"/><line x1="40" y1="61" x2="52" y2="49" stroke="#D8B978" stroke-width="2.6" stroke-linecap="round"/></svg>`,
  },
  {
    id: 'bullseye',
    label: 'Bullseye',
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="ccxA7" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4ede3"/><stop offset="1" stop-color="#e3d4bf"/></linearGradient></defs><rect width="100" height="100" fill="url(#ccxA7)"/><circle cx="50" cy="50" r="22" fill="none" stroke="#2c2218" stroke-width="3.2"/><circle cx="50" cy="50" r="13" fill="none" stroke="#2c2218" stroke-width="3.2"/><circle cx="50" cy="50" r="4" fill="#2c2218"/></svg>`,
  },
  {
    id: 'northstar',
    label: 'North Star',
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="ccxA8" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3B2F2F"/><stop offset="1" stop-color="#3D5A35"/></linearGradient></defs><rect width="100" height="100" fill="url(#ccxA8)"/><path d="M50 30 C52 43 57 48 70 50 C57 52 52 57 50 70 C48 57 43 52 30 50 C43 48 48 43 50 30 Z" fill="#fff8f0"/></svg>`,
  },
]
