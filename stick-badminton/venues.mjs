import { COURT_OUTLINE, COURT_MARKINGS, projectCourtPoint, projectCourtMarking, courtLineWidth } from './court-view.mjs?v=low-wall-save-1';

export const VENUES = Object.freeze([
  { id: 'classic', name: { zh: '经典绿场', en: 'Classic court' }, description: { zh: '明亮日光，熟悉的绿色球场', en: 'Bright daylight and a classic green court.' } },
  { id: 'sunset', name: { zh: '落日山谷', en: 'Sunset valley' }, description: { zh: '暖色晚霞，远山环绕的露天场', en: 'An open-air court with sunset mountain views.' } },
  { id: 'coast', name: { zh: '海风球场', en: 'Coastal breeze' }, description: { zh: '碧海、远帆与柔和沙岸', en: 'Blue water, a distant sail and a quiet sandy shore.' } },
  { id: 'bamboo', name: { zh: '竹影球场', en: 'Bamboo grove' }, description: { zh: '青竹掩映，薄雾漫过山坡', en: 'A green bamboo grove with mist over gentle hills.' } },
  { id: 'lake', name: { zh: '雪峰湖畔', en: 'Alpine lake' }, description: { zh: '雪峰倒映湖面，松林守在岸边', en: 'Snowy peaks reflected in a lake beside quiet pines.' } },
].map((venue) => Object.freeze({
  ...venue, name: Object.freeze(venue.name), description: Object.freeze(venue.description),
})));

// Self-contained local SVG artwork; old or unknown IDs use the classic court.
export function venuePreview(id) {
  const venue = VENUES.find((item) => item.id === id)?.id || 'classic';
  const [sky, floor, court] = {
    classic: ['#e2ece5', '#99bda5', '#588b72'],
    sunset: ['#b8797d', '#313448', '#45465f'],
    coast: ['#b2ced1', '#a1b1a0', '#396f7b'],
    bamboo: ['#c3d2b7', '#75927a', '#567b64'],
    lake: ['#bdcecd', '#728b81', '#3e7178'],
  }[venue];
  const bright = venue === 'classic' || venue === 'bamboo';
  const backgrounds = {
    classic: '<path d="M0 30H300M0 73H300M0 94H300" stroke="#a2bbb1" stroke-width="2"/><path d="M20 82h19m22 0h19m22 0h19m22 0h19m22 0h19m22 0h19m22 0h19M10 104h24m20 0h24m20 0h24m20 0h24m20 0h24m20 0h24m20 0h24" stroke="#abc6b2" stroke-width="5" stroke-linecap="round"/><path d="M18 29h25m49 0h25m49 0h25m49 0h25" stroke="#fffdf3" stroke-width="4" stroke-linecap="round"/>',
    sunset: '<circle cx="217" cy="40" r="17" fill="#f8d4a0"/><path d="M0 101 42 52 91 90 142 43 211 95 256 55 300 88V125H0Z" fill="#8e6878"/><path d="M0 105 60 81 113 108 175 74 230 111 276 81 300 96V128H0Z" fill="#5b5369"/>',
    coast: '<circle cx="60" cy="39" r="11" fill="#f6e7be"/><path d="M0 78h300v49H0z" fill="#528894"/><path d="M0 78V59l32 7 15-6 28 18m171 0 17-9 21 2 16-13v20" fill="#7d9b9d"/><path d="M38 91h29m69-4h32m-73 17h43m49 7h43m38-11h23" stroke="#d4e5db" opacity=".35"/><path d="M230 80v24m-2-22-13 19h13m5-13 10 13h-10" fill="#ede7cf" stroke="#ede7cf" stroke-width=".8"/><path d="M211 106h36l-8 4h-23Z" fill="#325866"/><path d="M0 114q39-6 73 1t76-1 77 1 74-3v18H0Z" fill="#cbbd98"/>',
    bamboo: '<path d="M0 94 37 75 83 94 130 69 181 91 238 71 300 91v39H0Z" fill="#a0b99b"/><path d="M0 108 63 91 107 108 173 86 230 104 300 89v41H0Z" fill="#7da58b"/><path d="m19 117-3-88m31 90 3-105m25 105-4-71m156 71 4-91m21 90-4-101m29 102 5-81" stroke="#567e66" stroke-width="4"/><path d="m19 56 17-12-4 11 13-3-20 12m27 11 15-12-6 13 15-1-19 9M248 50l-22-10 7 12-16-4 22 13m39 32-18-8 7 12-17-4 19 13" fill="#487860"/><path d="M0 119h300v8H0z" fill="#5f7e65"/>',
    lake: '<path d="M0 96 51 37 93 81 145 29 204 94 263 45 300 92v23H0Z" fill="#95b2b5"/><path d="m11 105 65-75 70 75m-8 0 62-84 83 84m-25 0 37-55 37 55" fill="#688a9b"/><path d="m57 51 19-21 19 21-13-7-5 9-8-7m113-1 18-24 22 24-14-7-7 11-8-10m72 26 10-15 10 15-10-5" fill="#e3e7d9"/><path d="M0 103h300v23H0z" fill="#558792"/><path d="M38 111h40m63-2h29m30 11h46m-153-1h34" stroke="#dce6dd" opacity=".35"/><path d="m11 84-9 17h18m-9-9-12 21h24m264-33-10 19h20m-10-8-13 23h26" fill="#3e6261"/>',
  };
  const background = backgrounds[venue];
  const previewPath = (points) => points.map(([x, y], i) => `${i ? 'L' : 'M'}${(x * 300 / 1100).toFixed(2)} ${(y * 180 / 600).toFixed(2)}`).join(' ');
  const outline = previewPath(COURT_OUTLINE.map(([x, z]) => projectCourtPoint(x, z)));
  const markings = COURT_MARKINGS.map((marking) => `<path d="${previewPath(projectCourtMarking(marking))}" stroke="#e8edda" stroke-width="${(courtLineWidth() * 300 / 1100).toFixed(2)}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 180" fill="none" aria-hidden="true" focusable="false"><path fill="${sky}" d="M0 0h300v180H0z"/>${background}<path fill="${floor}" d="M0 108h300v72H0z"/><path d="${outline}Z" fill="${court}"/>${markings}<path d="m143 93 7 3v29l-7-5Z" fill="#243b3e" opacity=".25"/><path d="m143 90 0 63m8-59v65m-6-64v26m3-25v28m-5-24 7 3m-7 3 7 3m-7 3 7 3m-7 3 7 3" stroke="${bright ? '#29493c' : '#768f98'}" stroke-width=".8"/><path d="M143 93q4 3 7 3" stroke="#fff4d5" stroke-width="1.7" stroke-linecap="round"/><path d="M8 44v112" stroke="#4b8cff" stroke-width="2"/><path d="M292 44v112" stroke="#ff745d" stroke-width="2"/></svg>`;
}
