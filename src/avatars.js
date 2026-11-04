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

export const AVATARS = [
  { id: 'bunny', name: '토끼', src: animalSvg('bunny', '#fff7ed') },
  { id: 'cat', name: '고양이', src: animalSvg('cat', '#cbd5e1') },
  { id: 'bear', name: '곰', src: animalSvg('bear', '#d6a77a') },
  { id: 'chick', name: '병아리', src: animalSvg('chick', '#fde68a') },
];

export function avatarById(id) {
  return AVATARS.find((item) => item.id === id) || AVATARS[0];
}
