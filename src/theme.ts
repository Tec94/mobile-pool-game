// Quiet Slate palette.
export const C = { ground: '#101F1C', frame: '#D9A866', sight: '#16302B', pocket: '#08100E', chalk: '#EEF2EA', accent: '#5B93F0', ink: '#16191A',
  white: '#F6F4EC', shade: '#06120F', warn: '#EF6B5E', panel: '#16302B', // white = the cue ball and stripes (warmer than chalk, which is for lines and text); shade = ball shadows;
  // warn = a shot that loses the cue ball; panel = sheets over the ground
  // The hand design: menus sit on a darker ground. Gold is for XP and coins only; blue for Fresh Chalk and the Daily ball only.
  menu: '#0E1B19', gold: '#F2C230', blue: '#4B98EE', keyOff: '#EEF2EA1C' };
export const BALLS = ['#F2C230', '#4B98EE', '#E0483C', '#8448C8', '#EC7428', '#3FBF7F', '#A8323F', '#16191A']; // balls 1 to 8; 9 to 15 repeat 1 to 7 as stripes
// Cloths the player can choose between: slate is the default, blue is the approved option. The maple frame stays.
export const CLOTHS = [{ name: 'Slate', felt: '#27504A', cushion: '#1C3A35' }, { name: 'Blue', felt: '#25485A', cushion: '#1B3542' }];

// A slab's colours: [face, lip]. Cream = the thing you press to go, and the player to shoot; dark = secondary, locked, missed.
export type Paint = readonly [string, string];
export const CREAM: Paint = ['#EFE6D2', '#B9AD92'], DARK: Paint = ['#1B3530', '#0A1513'];
// Each mode takes its ball's colour. Quick match is cream.
export const MODE = { daily: ['#4B98EE', '#2A69B8'], scenarios: ['#E0483C', '#A52B22'], learn: ['#8448C8', '#5A2B93'], pass: ['#EC7428', '#B04F12'], cues: ['#3FBF7F', '#2A8C5A'] } satisfies Record<string, Paint>;
// Text on a face: ink on light faces (cream, daily, pass, cues), chalk on scenarios, learn and dark.
// By the face, so a mixed paint (a dark face on a learn lip) reads right too.
export const inkOn = (p: Paint) => ([MODE.scenarios[0], MODE.learn[0], DARK[0]].includes(p[0]) ? C.chalk : C.ink);

// One family name per face, so no fontWeight is ever needed: the names are the PostScript names, which iOS finds in the
// embedded files; app.json gives Android the same names, and src/ui/fonts.web.ts loads them on the web.
export const FONT = { display: 'BricolageGrotesque-ExtraBold', semi: 'InstrumentSans-SemiBold', bold: 'InstrumentSans-Bold' };
