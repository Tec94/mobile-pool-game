import { weekday } from '../daily/daily';

// The Daily Table's weekday themes, Sunday first, as THEME in daily/daily.ts.
export const THEMES = ['Trick shot', 'Pots', 'Cut shots', 'Banks', 'Position', 'Combos', 'Kicks and safeties'];
export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthName = (k: string) => MONTHS[+k.slice(5, 7) - 1];
export const dateOf = (k: string) => `${DAYS[weekday(k)].slice(0, 3)} ${+k.slice(8, 10)} ${monthName(k).slice(0, 3)}`; // Wed 11 Nov

