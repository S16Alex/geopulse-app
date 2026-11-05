function animalSvg(kind, color) {
  const ears = {
    bunny: `
      <ellipse cx="27" cy="19" rx="8" ry="17"
        fill="${color}" stroke="#334155" stroke-width="2"/>
      <ellipse cx="53" cy="19" rx="8" ry="17"
        fill="${color}" stroke="#334155" stroke-width="2"/>
      <ellipse cx="27" cy="18" rx="3" ry="10" fill="#f9a8d4"/>
      <ellipse cx="53" cy="18" rx="3" ry="10" fill="#f9a8d4"/>
    `,
    cat: `
      <path d="M16 39 L16 12 L35 28 M45 28 L64 12 L64 39"
        fill="${color}" stroke="#334155" stroke-width="2"
        stroke-linejoin="round"/>
    `,
    bear: `
      <circle cx="20" cy="24" r="11"
        fill="${color}" stroke="#334155" stroke-width="2"/>
      <circle cx="60" cy="24" r="11"
        fill="${color}" stroke="#334155" stroke-width="2"/>
      <circle cx="20" cy="24" r="5" fill="#f4c9a4"/>
      <circle cx="60" cy="24" r="5" fill="#f4c9a4"/>
    `,
    chick: `
      <path d="M37 23 Q28 3 41 12 Q46 2 48 22"
        fill="${color}" stroke="#334155" stroke-width="2"
        stroke-linejoin="round"/>
    `,
  }[kind];

  const mouth = kind === 'chick'
    ? '<path d="M35 48 L45 48 L40 54 Z" fill="#fb923c"/>'
    : `<path d="M34 50 Q37 55 40 50 Q43 55 46 50"
         fill="none" stroke="#334155" stroke-width="2"
         stroke-linecap="round"/>`;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg"
      width="80" height="80" viewBox="0 0 80 80">
      <ellipse cx="40" cy="73" rx="23" ry="4"
        fill="#0f172a" opacity=".2"/>
      ${ears}
      <ellipse cx="40" cy="45" rx="27" ry="25"
        fill="${color}" stroke="#334155" stroke-width="2"/>
      <ellipse cx="25" cy="49" rx="6" ry="4" fill="#f9a8d4"/>
      <ellipse cx="55" cy="49" rx="6" ry="4" fill="#f9a8d4"/>
      <circle cx="30" cy="41" r="3" fill="#334155"/>
      <circle cx="50" cy="41" r="3" fill="#334155"/>
      <circle cx="31" cy="40" r="1" fill="white"/>
      <circle cx="51" cy="40" r="1" fill="white"/>
      ${mouth}
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function stickerSvg(bg, emoji, label) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
      <rect x="6" y="6" width="84" height="84" rx="22" fill="${bg}" stroke="#334155" stroke-width="3"/>
      <text x="48" y="50" font-size="34" text-anchor="middle" dominant-baseline="central">${emoji}</text>
      <rect x="14" y="64" width="68" height="20" rx="10" fill="#0f172acc"/>
      <text x="48" y="75" font-size="11" font-weight="700" fill="#ffffff" font-family="sans-serif" text-anchor="middle" dominant-baseline="central">${label}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export const AVATARS = [
  { id: 'bunny', name: '토끼', src: animalSvg('bunny', '#fff7ed') },
  { id: 'cat', name: '고양이', src: animalSvg('cat', '#cbd5e1') },
  { id: 'bear', name: '곰', src: animalSvg('bear', '#d6a77a') },
  { id: 'chick', name: '병아리', src: animalSvg('chick', '#fde68a') },
];

export const EMOTICONS = [
  { id: 'wave', label: '안녕!', emoji: '👋', src: stickerSvg('#fef3c7', '👋', '안녕!') },
  { id: 'run', label: '가는 중', emoji: '🏃', src: stickerSvg('#dbeafe', '🏃', '가는 중!') },
  { id: 'arrival', label: '도착!', emoji: '📍', src: stickerSvg('#dcfce7', '📍', '도착 완료!') },
  { id: 'heart', label: '좋아요', emoji: '💖', src: stickerSvg('#fce7f3', '💖', '좋아요!') },
  { id: 'coffee', label: '커피타임', emoji: '☕', src: stickerSvg('#ffedd5', '☕', '커피 한잔') },
  { id: 'question', label: '어디야?', emoji: '👀', src: stickerSvg('#f3e8ff', '👀', '어디야?') },
  { id: 'ok', label: '오케이', emoji: '🙆', src: stickerSvg('#e0f2fe', '🙆', '오케이!') },
  { id: 'hurry', label: '빨리 와!', emoji: '⚡', src: stickerSvg('#fee2e2', '⚡', '빨리 와!') },
];

export function avatarById(id) {
  return AVATARS.find((item) => item.id === id) || AVATARS[0];
}

export function emoticonById(id) {
  return EMOTICONS.find((item) => item.id === id) || null;
}
