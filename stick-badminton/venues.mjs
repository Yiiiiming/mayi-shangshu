export const VENUES = Object.freeze([
  { id: 'night', name: { zh: '夜幕球馆', en: 'Night arena' }, description: { zh: '深蓝室内场，灯光聚焦球场', en: 'A midnight indoor court under arena lights.' } },
  { id: 'classic', name: { zh: '经典绿场', en: 'Classic court' }, description: { zh: '明亮日光，熟悉的绿色球场', en: 'Bright daylight and a classic green court.' } },
  { id: 'sunset', name: { zh: '落日山谷', en: 'Sunset valley' }, description: { zh: '暖色晚霞，远山环绕的露天场', en: 'An open-air court with sunset mountain views.' } },
].map((venue) => Object.freeze({
  ...venue, name: Object.freeze(venue.name), description: Object.freeze(venue.description),
})));

// Self-contained local SVG artwork; unknown IDs use the default night arena.
export function venuePreview(id) {
  const bright = id === 'classic', sunset = id === 'sunset';
  const sky = bright ? '#e2ece5' : sunset ? '#b8797d' : '#15202c';
  const floor = bright ? '#99bda5' : sunset ? '#313448' : '#172531';
  const court = bright ? '#588b72' : sunset ? '#45465f' : '#304556';
  const background = sunset
    ? '<circle cx="217" cy="40" r="17" fill="#f8d4a0"/><path d="M0 101 42 52 91 90 142 43 211 95 256 55 300 88V125H0Z" fill="#8e6878"/><path d="M0 105 60 81 113 108 175 74 230 111 276 81 300 96V128H0Z" fill="#5b5369"/>'
    : `<path d="M0 30H300M0 73H300M0 94H300" stroke="${bright ? '#a2bbb1' : '#3b4e60'}" stroke-width="2"/><path d="M20 82h19m22 0h19m22 0h19m22 0h19m22 0h19m22 0h19m22 0h19M10 104h24m20 0h24m20 0h24m20 0h24m20 0h24m20 0h24m20 0h24" stroke="${bright ? '#abc6b2' : '#43596c'}" stroke-width="5" stroke-linecap="round"/><path d="M18 29h25m49 0h25m49 0h25m49 0h25" stroke="${bright ? '#fffdf3' : '#ecf6ff'}" stroke-width="4" stroke-linecap="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 180" fill="none" aria-hidden="true" focusable="false"><path fill="${sky}" d="M0 0h300v180H0z"/>${background}<path fill="${floor}" d="M0 120h300v60H0z"/><path d="M28 124h244l19 45H9Z" fill="${court}" stroke="#e8edda" stroke-width="1.5"/><path d="M18 148h264M82 124l-9 45m145-45 9 45M150 124v45" stroke="#e8edda" stroke-width="1" opacity=".8"/><path d="M150 95v64" stroke="${bright ? '#29493c' : '#b7c8d7'}" stroke-width="3"/><path d="M144 94h12" stroke="#fff4d5" stroke-width="4" stroke-linecap="round"/><path d="M8 44v112" stroke="#4b8cff" stroke-width="2"/><path d="M292 44v112" stroke="#ff745d" stroke-width="2"/></svg>`;
}
