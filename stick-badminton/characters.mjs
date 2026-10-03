const INK = '#1a3038';
const CREAM = '#f5efcd';

// Shared ability values are used by the game engine and character selection.
// Power affects rally shots only; every character keeps the same serve controls.
export const CHARACTER_STATS = Object.freeze({
  classic: Object.freeze({ power: 1, speed: 1, jumpHeight: 1 }),
  ninja: Object.freeze({ power: 1, speed: 1.1, jumpHeight: 1 }),
  robot: Object.freeze({ power: 1.1, speed: 1, jumpHeight: 1 }),
  astro: Object.freeze({ power: 1, speed: 1, jumpHeight: 1.1 }),
});

export const CHARACTERS = Object.freeze([
  { id: 'classic', name: { zh: '追风', en: 'Breeze' }, description: { zh: '均衡型：标准力量、速度与跳跃', en: 'Balanced: standard power, speed and jump.' } },
  { id: 'ninja', name: { zh: '影刃', en: 'Shadow' }, description: { zh: '移动速度 +10%', en: 'Movement speed +10%.' } },
  { id: 'robot', name: { zh: '小铁', en: 'Bolt' }, description: { zh: '普通与大力击球力量 +10%；发球不变', en: 'Normal and power shots +10% power; serves unchanged.' } },
  { id: 'astro', name: { zh: '星跃', en: 'Nova' }, description: { zh: '跳跃高度 +10%', en: 'Jump height +10%.' } },
].map((character) => Object.freeze({ ...character, stats: CHARACTER_STATS[character.id] })));

function ellipse(ctx, x, y, rx, ry, fill, stroke, width = 3) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

function path(ctx, points, fill, stroke, width = 3, closed = true) {
  ctx.beginPath(); ctx.moveTo(...points[0]);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  if (closed) ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

function box(ctx, x, y, width, height, radius, fill, stroke, lineWidth = 3) {
  ctx.beginPath(); ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y); ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius); ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height); ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius); ctx.quadraticCurveTo(x, y, x + radius, y); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

export function drawCharacterDetails(ctx, { id, x, y, lean = 0, head, shoulder, dir = 1, color, time = 0, moving = false }) {
  if (id === 'classic' || !CHARACTERS.some((character) => character.id === id)) return;
  const [hx, hy] = head, [sx, sy] = shoulder;
  const waist = x - lean * .5;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  if (id === 'ninja') {
    const flutter = moving ? Math.sin(time * 13) * 4 : Math.sin(time * 3) * 1.5;
    path(ctx, [[sx - dir * 2, sy - 2], [sx - dir * 27, sy + 3 + flutter], [sx - dir * 21, sy + 10 + flutter], [sx - dir * 5, sy + 5]], color, INK, 1.5);
    path(ctx, [[sx - 6, sy + 1], [sx + 6, sy + 1], [waist + 7, y - 47], [waist - 7, y - 47]], INK, '#71899d', 1.5);
    path(ctx, [[sx - dir * 5, sy + 4], [waist + dir * 5, y - 49]], null, color, 4, false);
    ellipse(ctx, hx, hy, 18, 19, INK, '#91a7b9', 1.5);
    box(ctx, hx - 13, hy - 7, 26, 10, 4, CREAM);
    path(ctx, [[hx - 13, hy - 12], [hx + 13, hy - 12]], null, color, 4, false);
    path(ctx, [[hx - 10, hy + 9], [hx + 10, hy + 9]], null, '#344f54', 2, false);
    ellipse(ctx, hx + dir * 6, hy - 2, 2, 2.6, INK);
    box(ctx, sx - 8, sy - 4, 16, 7, 3, color);
  } else if (id === 'robot') {
    path(ctx, [[sx - 8, sy + 1], [sx + 8, sy + 1], [waist + 8, y - 46], [waist - 8, y - 46]], '#d9e5d9', INK, 2.5);
    path(ctx, [[sx - 5, sy + 7], [sx + 5, sy + 7]], null, color, 4, false);
    ellipse(ctx, waist, y - 54, 3, 3, '#f9dc55', INK, 1);
    box(ctx, hx - 20, hy - 6, 6, 14, 2, color, INK, 2);
    box(ctx, hx + 14, hy - 6, 6, 14, 2, color, INK, 2);
    path(ctx, [[hx, hy - 17], [hx, hy - 25]], null, INK, 3, false);
    ellipse(ctx, hx, hy - 27, 3.5, 3.5, '#f9dc55', INK, 1.5);
    box(ctx, hx - 17, hy - 17, 34, 35, 6, '#d9e5d9', INK, 3.5);
    box(ctx, hx - 13, hy - 10, 26, 16, 4, INK);
    box(ctx, hx - 8 + dir * 2, hy - 6, 4, 7, 1, '#95e6c1');
    box(ctx, hx + 4 + dir * 2, hy - 6, 4, 7, 1, '#95e6c1');
    path(ctx, [[hx - 6, hy + 12], [hx + 6, hy + 12]], null, color, 3, false);
  } else {
    box(ctx, sx - dir * 13 - 5, sy + 2, 10, 22, 4, '#b9ccbf', INK, 2);
    path(ctx, [[sx - 9, sy + 1], [sx + 9, sy + 1], [waist + 8, y - 45], [waist - 8, y - 45]], '#f4f0da', INK, 2.5);
    box(ctx, waist - 5, y - 66, 10, 13, 2, color);
    path(ctx, [[waist - 2, y - 62], [waist + 2, y - 62]], null, '#f9dc55', 2, false);
    ellipse(ctx, hx, hy, 22, 22, '#f4f0da', INK, 3);
    ellipse(ctx, hx + dir, hy, 16, 16, '#2e5b63', color, 2.5);
    ellipse(ctx, hx + dir * 4, hy + 3, 10, 11, CREAM);
    ellipse(ctx, hx + dir * 8, hy + 2, 1.8, 2, INK);
    path(ctx, [[hx - 9, hy - 6], [hx - 5, hy - 10], [hx + 1, hy - 11]], null, '#dffbf1', 3, false);
    box(ctx, sx - 9, sy - 5, 18, 6, 3, color, INK, 1.5);
    ellipse(ctx, hx - 19, hy + 2, 3, 4, color);
    ellipse(ctx, hx + 19, hy + 2, 3, 4, color);
  }
  ctx.restore();
}

// The previews contain only local vector shapes; no font, image, or network asset is needed.
export function characterPreview(id, color = '#2364dc') {
  const team = /^#[\da-f]{6}$/i.test(color) ? color : '#2364dc';
  const safeId = CHARACTERS.some((character) => character.id === id) ? id : 'classic';
  const face = safeId === 'classic'
    ? `<ellipse cx="57" cy="31" rx="16" ry="17" fill="${CREAM}" stroke="${INK}" stroke-width="5"/><path d="M43 26h28M41 26l-12 4" stroke="${team}" stroke-width="5"/><circle cx="63" cy="33" r="2" fill="${INK}"/>`
    : safeId === 'ninja'
      ? `<path d="M53 51 29 55l6 7 19-6Z" fill="${team}" stroke="${INK}" stroke-width="1.5"/><path d="m51 54 12 0 1 26H50Z" fill="${INK}"/><path d="m52 57 11 20" stroke="${team}" stroke-width="4"/><ellipse cx="57" cy="31" rx="18" ry="19" fill="${INK}" stroke="#91a7b9" stroke-width="1.5"/><rect x="44" y="24" width="26" height="10" rx="4" fill="${CREAM}"/><path d="M44 19h26" stroke="${team}" stroke-width="4"/><path d="M47 40h20" stroke="#344f54" stroke-width="2"/><ellipse cx="63" cy="29" rx="2" ry="2.6" fill="${INK}"/><rect x="49" y="49" width="16" height="7" rx="3" fill="${team}"/>`
      : safeId === 'robot'
        ? `<path d="M49 54h16l1 27H49Z" fill="#d9e5d9" stroke="${INK}" stroke-width="2.5"/><path d="M52 60h10" stroke="${team}" stroke-width="4"/><circle cx="57" cy="73" r="3" fill="#f9dc55" stroke="${INK}"/><rect x="37" y="25" width="6" height="14" rx="2" fill="${team}" stroke="${INK}" stroke-width="2"/><rect x="71" y="25" width="6" height="14" rx="2" fill="${team}" stroke="${INK}" stroke-width="2"/><path d="M57 14V6" stroke="${INK}" stroke-width="3"/><circle cx="57" cy="4" r="3.5" fill="#f9dc55" stroke="${INK}" stroke-width="1.5"/><rect x="40" y="14" width="34" height="35" rx="6" fill="#d9e5d9" stroke="${INK}" stroke-width="3.5"/><rect x="44" y="21" width="26" height="16" rx="4" fill="${INK}"/><path d="M53 25v7m12-7v7" stroke="#95e6c1" stroke-width="4"/><path d="M51 43h12" stroke="${team}" stroke-width="3"/>`
        : `<rect x="39" y="55" width="10" height="22" rx="4" fill="#b9ccbf" stroke="${INK}" stroke-width="2"/><path d="M48 54h18l-1 28H49Z" fill="#f4f0da" stroke="${INK}" stroke-width="2.5"/><rect x="52" y="61" width="10" height="13" rx="2" fill="${team}"/><path d="M55 65h4" stroke="#f9dc55" stroke-width="2"/><circle cx="57" cy="31" r="22" fill="#f4f0da" stroke="${INK}" stroke-width="3"/><circle cx="58" cy="31" r="16" fill="#2e5b63" stroke="${team}" stroke-width="2.5"/><ellipse cx="61" cy="34" rx="10" ry="11" fill="${CREAM}"/><ellipse cx="65" cy="33" rx="1.8" ry="2" fill="${INK}"/><path d="m48 25 4-4 6-1" stroke="#dffbf1" stroke-width="3"/><rect x="48" y="48" width="18" height="6" rx="3" fill="${team}" stroke="${INK}" stroke-width="1.5"/><ellipse cx="38" cy="33" rx="3" ry="4" fill="${team}"/><ellipse cx="76" cy="33" rx="3" ry="4" fill="${team}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 140" fill="none" aria-hidden="true" focusable="false"><g stroke-linecap="round" stroke-linejoin="round"><ellipse cx="60" cy="132" rx="30" ry="4" fill="${INK}" opacity=".1"/><path d="m44 127 4-22 12-15 13 16 2 21M60 90l-3-37m0 5-19 15-7-15m26-5 17 16 16-23" stroke="#d5dfe8" stroke-width="7"/><path d="m57 56 3 22M40 128h10m23 0h10" stroke="${team}" stroke-width="7"/><path d="m90 46 8-12" stroke="#91a8be" stroke-width="4"/><g transform="rotate(27 103 25)"><ellipse cx="103" cy="25" rx="11" ry="18" fill="${CREAM}" fill-opacity=".12" stroke="${team}" stroke-width="3"/><path d="M98 11v28m5-31v34m5-31v28M94 19h18M92 25h22M94 31h18" stroke="#b8cddd" stroke-width=".8" opacity=".65"/></g>${face}</g></svg>`;
}
