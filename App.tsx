// The menus (src/ui/Menus.tsx) and the match. In the match two players pass the phone, or one plays the AI (quick match,
// src/ai/turn.ts): 8-ball or 9-ball under the WPA rules (src/rules), with the shot controls. Drag or tap on
// the table to aim, turn the dial to aim finely, pull the rail down and let go to shoot. The table never fires a shot.
// With the cue ball in hand, drag it; tap a pocket to call it. The cue ball button opens the tip and cue angle sheet
// (spin, jump, masse). A lesson (src/learn) plays on the same screen with its own table, goal and steps, and so does a
// scenario (src/scenarios): a lesson table played solo with tries, stars and the player's own cue.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Alert, AppState, BackHandler, PanResponder, PixelRatio, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Canvas, Picture, Skia, type SkPicture } from '@shopify/react-native-skia';
import { useFrameCallback, useReducedMotion, useSharedValue } from 'react-native-reanimated';
import { scheduleOnUI } from 'react-native-worklets';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import * as ScreenOrientation from 'expo-screen-orientation';
import { initialWindowMetrics, SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ball, breakSpot, CUE, HOLES, P, rack, Shot, strike } from './src/physics/engine';
import { benchAI } from './src/ai/bench';
import { advance, drawBalls, makeKit, newLook } from './src/render/balls';
import { drawMarks } from './src/render/marks';
import { newPace, nextFrame, type Pace, refresh, type Slot, spent } from './src/render/pace';
import { drawCue, shotLayout } from './src/render/cue';
import { BAR, drawAim, drawTable, onTable, toScreen, toTable } from './src/render/table';
import { LEVEL, shotTip } from './src/render/tip';
import { type Lesson, LESSON_PAY, LESSONS, lessonTable, type LessonRec, newLessonRec, noteLesson, PENCIL_AT, SOLO_RUN, type Stage, verdict } from './src/learn/lessons';
import { loadDone, saveDone } from './src/learn/save';
import { canCall, choose, handCue, judge, moveCue, newGame, newRec, onEight, Rec, record, setCall, spotBall, State } from './src/rules/rules';
import { thinkAsync } from './src/ai/think';
import { candsFor, choiceFor, type Move, nextSafeties, potPay, type Safeties, safetiesArg, softMove, think } from './src/ai/turn';
import { type Cand, TIERS } from './src/ai/shot-ai';
import { matchPay, type Pay } from './src/progress/pay';
import { aimGuide, DRAG, guideFor, nearest, previewPower, swing, TAP_MS, tapAim } from './src/shot/aim';
import { award, keep, ownStats, PASS_PLAY, profile, unlockCue } from './src/progress';
import { clear, clearFeats, isOpen, par, SCENARIOS, type Scenario, starCount, starsFor } from './src/scenarios/scenarios';
import { armChalk, chalkResult, dailyClear, dailyPick, dayKey, grantChalk } from './src/daily/daily';
import { loadDaily, saveDaily } from './src/daily/save';
import { loadStars, saveStars } from './src/scenarios/save';
import { levelNote } from './src/progress/profile';
import { CUES, stick } from './src/progress/cues';
import { loadSettings, saveSettings } from './src/settings/save';
import type { Settings } from './src/settings/settings';
import { BALLS, C, CLOTHS } from './src/theme';
import { Btn } from './src/ui/Btn';
import { LESSON_HUD, LessonHud } from './src/ui/LessonHud';
import { hudHeight, MatchHud, Results } from './src/ui/MatchHud';
import { Menus, type Screen } from './src/ui/Menus';
import { AimDial, PowerRail, shotStore } from './src/ui/ShotControls';
import { TipButton, TipSheet, tipStore } from './src/ui/TipControl';

const GRAB = 36; // px: a touch this near the cue ball in hand drags it. The ball is smaller than a fingertip, so the
// ball keeps its distance from the finger and stays in view.
const GUIDE_WORK = 3200; // ball-steps the aim guide may follow after first contact: one update stays inside a frame, even into the rack
// Pass and play is a matched game: both players on House Cue stats with the perks off, whatever cues the phone owns.
const MATCH_CUE = 'house', STICK = stick(MATCH_CUE, true), GUIDE_LEVEL = guideFor(CUES[MATCH_CUE].aim); // one cue for the shot and its guide
const THINK_MS = 800; // the AI takes at least this long, so a fast tier does not shoot the moment the table stops
const STILL = 1e9; // ms: a picture that stays on screen until the next one comes (the table at rest, the last frame of a shot)
// Sample shots, played from a fresh rack so the spin, jump and masse animation can be seen without aiming one.
const DEMOS: [string, Partial<Shot>][] = [['Draw', { speed: 2.5, b: -0.45 }], ['Side', { speed: 1.2, a: 0.45 }], ['Jump', { speed: 4.2, elev: 0.7 }], ['Massé', { speed: 3.5, a: 0.4, elev: 1.19 }]];
const kit = makeKit(Skia);
const EMPTY = (() => { const rec = Skia.PictureRecorder(); rec.beginRecording(); return rec.finishRecordingAsPicture(); })();

// A racked table for the start of a game. rec = the record of the shot in play; push = a push out was declared for it.
const newTable = (rules: State) => {
  const [x0, y0] = breakSpot(), ids = [0], B: Ball[] = [{ x: x0 - 1e-3, y: y0, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true }]; // above the head string, not on it
  for (const [id, x, y] of rack(rules.game)) { ids.push(id); B.push({ x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true }); }
  return { B, ids, look: newLook(B), rules, rec: null as Rec | null, push: false };
};
// A lesson's table. No rules play: the state only marks the lesson's pocket, and the lesson judges the shot.
const newLesson = (l: Lesson) => {
  const { B, ids } = lessonTable(l), rules: State = { ...newGame(8, 0, false), phase: 'play', hand: false, balls: ids.slice(1), call: l.goal.pocket ?? -1 };
  return { B, ids, look: newLook(B), rules, rec: null as Rec | null, push: false };
};

export default function App() {
  return <SafeAreaProvider initialMetrics={initialWindowMetrics}><Root /></SafeAreaProvider>;
}

const LOCKS = [ScreenOrientation.OrientationLock.DEFAULT, ScreenOrientation.OrientationLock.PORTRAIT_UP, ScreenOrientation.OrientationLock.LANDSCAPE];

// The screen on show and the settings. A match reads its setup when it starts.
function Root() {
  const [set, setSet] = useState(loadSettings), [screen, go] = useState<Screen | 'match' | 'ai' | 'lesson' | 'scenario' | 'daily'>('home');
  const [done, setDone] = useState(loadDone), [lesson, setLesson] = useState(0);
  const learn = (i: number) => { setLesson(i); go('lesson'); };
  const [stars, setStars] = useState(loadStars), [scen, setScen] = useState(0);
  const play = (i: number) => { setScen(i); go('scenario'); };
  // A scenario cleared: its new stars pay once, and only when saved; a first clear also counts toward the feats.
  // shortcut: tries start again when the scenario is left, so the par star can be retried from 1; keep them per table if that matters.
  const cleared = (s: Scenario, tries: number, guideOff: boolean): Clear => {
    const had = stars[s.id] ?? 0, c = clear(s, had, tries, guideOff, profile().cue);
    if (!c.n) return { ...c, saved: true };
    const now = { ...stars, [s.id]: c.bits };
    if (!saveStars(now)) return { ...c, saved: false }; // unsaved stars stay unearned, so a later clear pays them
    setStars(now);
    if (!had) keep(clearFeats(profile(), s));
    return { ...c, saved: true, gained: award(c.pay, profile().cue) }; // the scenario played the player's own cue
  };
  // The Daily Table. today is read at launch and again each time the app comes back, which a phone does for days.
  const [today, setToday] = useState(() => dayKey(new Date())), [day, setDay] = useState(today);
  const [daily, setDaily] = useState(() => { const { daily: d, damaged } = loadDaily(today), g = grantChalk(d, today); if (g !== d && !damaged) saveDaily(g); return g; });
  useEffect(() => {
    const sub = AppState.addEventListener('change', a => {
      if (a !== 'active') return;
      const k = dayKey(new Date()), g = grantChalk(daily, k);
      setToday(k); if (g !== daily) { saveDaily(g); setDaily(g); }
    });
    return () => sub.remove();
  }, [daily]);
  const playDay = (k: string) => { setDay(k); go('daily'); };
  const arm = (on: boolean) => { const g = armChalk(daily, on); if (g !== daily && saveDaily(g)) setDaily(g); };
  // A quick match ended: an armed charge pays the match pay again on a win, only when its spending is saved.
  const chalk = (won: boolean, m: Pay): Pay => { const r = chalkResult(daily, won, m); if (r.state === daily || !saveDaily(r.state)) return { xp: 0, coins: 0 }; setDaily(r.state); return r.extra; };
  const dayScen = SCENARIOS[dailyPick(day, SCENARIOS)];
  const dayCleared = (tries: number, guideOff: boolean): Clear => { // like cleared: pay only what was saved
    const c = dailyClear(daily.stars[day] ?? 0, starsFor(dayScen, tries, guideOff));
    if (!c.n) return { ...c, saved: true };
    const now = { ...daily, stars: { ...daily.stars, [day]: c.bits } };
    if (!saveDaily(now)) return { ...c, saved: false };
    setDaily(now);
    return { ...c, saved: true, gained: award(c.pay, profile().cue) }; // the daily table played the player's own cue
  };
  const nextScen = SCENARIOS[scen + 1]?.pack === SCENARIOS[scen].pack && isOpen(scen + 1, stars, profile().xp);
  // A lesson passed for the first time pays once and counts toward the Giant Pencil.
  const pass = (id: string) => { // true = paid
    if (done.includes(id)) return false;
    const now = LESSONS.map(l => l.id).filter(k => k === id || done.includes(k));
    setDone(now); const saved = saveDone(now); if (saved) award(LESSON_PAY);
    if (now.length >= PENCIL_AT) unlockCue('pencil');
    return saved;
  };
  const change = (p: Partial<Settings>) => setSet(s => ({ ...s, ...p }));
  const first = useRef(true);
  useEffect(() => { if (first.current) first.current = false; else saveSettings(set); }, [set]);
  useEffect(() => { if (done.length >= PENCIL_AT) unlockCue('pencil'); }, []); // also at launch: lessons passed before cues existed still count
  useEffect(() => { ScreenOrientation.lockAsync(LOCKS[set.orient]).catch(() => {}); }, [set.orient]);
  useEffect(() => { // Android back: from a menu page to home
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { if (screen !== 'home' && screen !== 'match' && screen !== 'ai' && screen !== 'lesson' && screen !== 'scenario' && screen !== 'daily') { go('home'); return true; } return false; });
    return () => sub.remove();
  }, [screen]);
  return <>
    <StatusBar style="light" />
    {screen === 'match' || screen === 'ai' ? <Game key={screen} set={set} ai={screen === 'ai' ? set.tier : -1} chalk={screen === 'ai' ? chalk : undefined} onQuit={() => go('home')} />
      : screen === 'lesson' ? <Game key={lesson} set={set} lesson={lesson} fresh={!done.includes(LESSONS[lesson].id)} onPass={pass} onNext={() => setLesson(lesson + 1)} onQuit={() => go('learn')} />
      : screen === 'scenario' ? <Game key={`s${scen}`} set={set} scen={SCENARIOS[scen]} onClear={(t, off) => cleared(SCENARIOS[scen], t, off)} onNext={nextScen ? () => setScen(scen + 1) : undefined} onQuit={() => go('scenarios')} />
      : screen === 'daily' ? <Game key={`d${day}`} set={set} scen={dayScen} back="Daily Table" onClear={dayCleared} onQuit={() => go('calendar')} />
      : <Menus screen={screen} set={set} change={change} go={go} done={done} learn={learn} stars={stars} play={play} daily={daily} today={today} day={day} playDay={playDay} arm={arm} />}
  </>;
}

type Clear = ReturnType<typeof clear> & { saved: boolean; gained?: ReturnType<typeof award> };
// A match, a lesson (lesson), or a scenario (scen, any table: the daily table plays one too). fresh = the lesson has not
// been passed before; onPass = it was just passed; onClear = the scenario was just cleared, with its tries and whether
// the whole try was played with the guide off. back = the page onQuit returns to, named on the result card.
// ai = the AI tier (index into TIERS) in player 1's seat; -1 = pass and play.
function Game({ set, ai = -1, onQuit, lesson: n = -1, fresh, onPass, onNext, scen: S, onClear, back = 'Scenarios', chalk }: { set: Settings; ai?: number; chalk?: (won: boolean, matchPay: Pay) => Pay; back?: string; onQuit: () => void; lesson?: number; fresh?: boolean; onPass?: (id: string) => boolean; onNext?: () => void; scen?: Scenario; onClear?: (tries: number, guideOff: boolean) => Clear }) {
  const vs = ai >= 0, game = vs ? set.aiGame : set.game, race = vs ? set.aiRace : set.race, names = vs ? [set.names[0], TIERS[ai].name] : set.names;
  const { width, height } = useWindowDimensions();
  const pad = useSafeAreaInsets(), calm = useReducedMotion();
  const L: Lesson | undefined = S ?? LESSONS[n];
  const table = useRef(L ? newLesson(L) : newTable(newGame(game, 0, set.callAll))), HUD = L ? LESSON_HUD : hudHeight(table.current.rules.game); // screen units kept above the table for the HUD
  // The lesson's step, the passes in a row in the solo step, and the verdict on the last shot (a card over the table).
  const [stage, setStage] = useState<Stage>('watch'), [run, setRun] = useState(0), [said, setSaid] = useState<{ title: string; say: string; ok: boolean } | null>(null);
  // A scenario counts its tries; the third star wants a try with the aim guide never on screen (peeked = it was).
  const [tries, setTries] = useState(1), [guideOff, setGuideOff] = useState(false), peeked = useRef(false);
  const les = useRef({ stage, run, said, tries, guideOff }); les.current = { stage, run, said, tries, guideOff };
  const lay = shotLayout(width, height, { ...pad, top: pad.top + HUD }), view = { ...lay.view, dpr: PixelRatio.get(), calm }, where = [view.land, view.s, view.ox, view.oy];
  const { cloth } = set;
  const map = useRef(view); map.current = view; // the pan responder is created once, so it reads the latest mapping
  // The table never changes during play: one picture, drawn again only when the window does.
  const felt = useMemo(() => { const rec = Skia.PictureRecorder(); drawTable(Skia, rec.beginRecording(), view, CLOTHS[cloth]); return rec.finishRecordingAsPicture(); }, [...where, cloth]);

  const score = useRef<[number, number]>([0, 0]), [paused, setPaused] = useState(false); // score = frames won
  const gained = useRef<ReturnType<typeof award> | null>(null); // the award of the match, for the results card
  // Quick match: what the human's shots earned this match, the run of pots this visit, fouls and own balls potted (for
  // matchPay), the pots on the table at the strike (for pRef), and the pay of the finished match.
  // shortcut: a match left from the pause card pays nothing, not even its shots; no safety pay (needs the AI's reply).
  const won = useRef({ shots: { xp: 0, coins: 0 } as Pay, run: 0, fouls: 0, own: 0, cands: [] as Cand[], pay: PASS_PLAY, chalk: null as Pay | null });
  const safe = useRef<Safeties>({ row: 0, rack: 0 }), seed = useRef(Math.floor(Math.random() * 2 ** 31)), [thinking, setThinking] = useState(false);
  useEffect(() => { const sub = BackHandler.addEventListener('hardwareBackPress', () => { setPaused(p => !p); return true; }); return () => sub.remove(); }, []); // Android back opens and closes the pause card
  const rules = table.current.rules, [, redraw] = useReducer((n: number) => n + 1, 0); // the rules live with the table; redraw shows a change
  const shot = useRef(shotStore(nearest(table.current.B))).current; // the held aim and the power on the rail
  const stale = useRef(true); // the guide must be drawn again: the aim, the power, the tip or the table changed
  const [demo, setDemo] = useState(0);
  const [hud, setHud] = useState(__DEV__), [rates, setRates] = useState(''); // frame rate readout: hold the Rack button to show or hide it
  const tip = useRef(tipStore()).current, [sheet, setSheet] = useState(false), [tools, setTools] = useState(false);
  const moving = useRef(false), grab = useRef<{ x: number; y: number } | 'call' | null>(null);
  // The balls and the aim guide are Skia pictures, recorded on the JS thread and handed to the canvas through shared
  // values, so a frame of play or of aiming never re-renders React.
  const picture = useSharedValue(EMPTY), guide = useSharedValue(EMPTY);
  const draw = useRef(() => EMPTY);
  draw.current = () => {
    const rec = Skia.PictureRecorder(), c = rec.beginRecording(), { B, ids, look, rules: s, rec: shot } = table.current;
    const me = !shot && !bot(); // on the AI's turn the human's marks stay off
    drawMarks(Skia, c, view, { hand: me && !s.choice && s.hand, x: B[0].x, y: B[0].y, call: s.call, ask: me && onEight(s), ms: performance.now(), zone: L?.goal.zone });
    drawBalls(kit, c, B, ids, look, view);
    return rec.finishRecordingAsPicture();
  };
  // Frames of play wait in queue and the UI thread shows one on each display refresh (see src/render/pace.ts).
  const queue = useSharedValue<Slot<SkPicture>[]>([]), left = useSharedValue(STILL);
  const seen = useSharedValue([0, 0, 0, 0, 0]); // counts for the readout (refreshes, frames shown, refreshes with no frame ready, frames skipped), then the share of the last refreshes that came less than 12 ms apart: above a half is a 120 Hz display
  // One function for the life of the screen: a new one would register again and lose a refresh on each React render.
  const beat = useFrameCallback(useCallback(f => {
    'worklet';
    const dt = f.timeSincePreviousFrame ?? 0, r = refresh(queue.value, left.value, dt), s = seen.value;
    left.value = r.left;
    if (r.show) { queue.value = r.rest; picture.value = r.show; }
    seen.value = [s[0] + 1, s[1] + (r.show ? 1 : 0), s[2] + (r.dry ? 1 : 0), s[3] + r.skipped, dt ? 0.9 * s[4] + (dt < 12 ? 0.1 : 0) : s[4]];
  }, []), false);
  const live = useRef(beat); live.current = beat;
  const push = (pic: SkPicture, ms: number, first: boolean) => { 'worklet'; queue.value = first ? [{ pic, ms }] : [...queue.value, { pic, ms }]; if (first) left.value = 0; };
  const still = (pic: SkPicture) => { 'worklet'; queue.value = []; left.value = STILL; picture.value = pic; };
  const pace = useRef<Pace | null>(null), made = useRef([0, 0]); // made = frames made and the ms they took, for the readout
  // The table as it is now, shown at once in place of any frames that wait. Play that goes on starts its frames again.
  // A ball the rules or a finger moved did not travel there: no speed streak.
  // again = the guide is drawn again too; the pulse of the ring round the cue ball in hand does not need that.
  const paint = (again = true) => { const { B, look } = table.current; look.last.set(B.flatMap(b => [b.x, b.y])); pace.current = null; if (again) stale.current = true; scheduleOnUI(still, draw.current()); };
  useEffect(() => { touch.current = null; paint(); }, where); // a drag measured in the old layout ends when the window turns
  useEffect(() => { const again = () => { stale.current = true; }, off = [shot.sub(again), tip.sub(again)]; return () => off.forEach(f => f()); }, []);
  // A lesson plays with the engine's own cue, the one its reference shots are tuned on (src/learn/lessons.test.mjs).
  // A scenario and quick match play with the player's own cue and its aim guide (stick stats count in challenges).
  const own = useMemo(() => profile().cue, []), mine = useMemo(() => ownStats(own), []), cue = useMemo(() => (S || vs ? stick(own, false, mine) : L ? CUE : STICK), []); // fixed for the life of the screen: a cue change takes effect at the next table
  const shotOf = (power: number): Shot => ({ ang: shot.get().aim, speed: Math.max(0.05, power * (table.current.rules.phase === 'break' ? cue.breakSpeed : cue.maxSpeed)), ...shotTip(tip.get(), cue) });
  // No shot can be made: balls move, the rules have not ruled on the last shot, a player has a decision to make, or the
  // rack is over. In a lesson: the shot plays itself, or the verdict card is up.
  const bot = () => vs && table.current.rules.turn === 1; // on the AI's turn nothing can be touched
  const shut = () => { const t = table.current; return moving.current || !!t.rec || !!t.rules.choice || t.rules.phase === 'over' || (!!L && (les.current.stage === 'watch' || !!les.current.said)) || bot(); };
  const watching = () => !!L && les.current.stage === 'watch' && !les.current.said && !moving.current && !table.current.rec; // the reference shot is lined up: its guide shows
  // Put a ruling on the table: a new rack, or the balls the rules spot and the cue ball in hand.
  const apply = useRef((s: State) => {});
  apply.current = (s: State) => {
    const t = table.current;
    if (s.phase === 'over' && s.winner !== -1) { score.current[s.winner]++; if (score.current[s.winner] === race) {
      const w = won.current, m = vs && matchPay({ tier: ai + 1, won: s.winner === 0, fouls: w.fouls, ownPotted: w.own, early: s.winner === 1 && s.note.endsWith('went down early.') }); // early: only an early 8 pays nothing (the note of over() in rules.ts)
      const x = m && chalk ? chalk(s.winner === 0, m) : null; w.chalk = x?.xp || x?.coins ? x : null; // Fresh Chalk doubles the match pay, not the shot pay
      w.pay = m ? { xp: m.xp + w.shots.xp + (x?.xp ?? 0), coins: m.coins + w.shots.coins + (x?.coins ?? 0) } : PASS_PLAY; gained.current = award(w.pay, vs ? own : undefined); // quick match played the player's own cue
    } }
    if (s.phase === 'break') { table.current = newTable(s); moving.current = false; safe.current = { row: 0, rack: 0 }; won.current.run = 0; }
    else { for (const id of s.spot) spotBall(t.B, t.ids.indexOf(id)); if (s.hand) handCue(t.B, s.hand); Object.assign(t, { rules: s, rec: null, push: false }); }
    paint(); redraw();
    shot.set({ aim: nearest(table.current.B, shot.get().aim), power: 0, fine: false, locked: shut() }); // the cue points at the nearest ball and the controls unlock
  };


  useEffect(() => {
    let raf = 0, on = true; // on = the UI thread's frame callback runs. It stops between shots: it keeps the display at full rate
    live.current.setActive(true); // a short run at launch measures the display's refresh interval for the first shot
    const rest = () => setTimeout(() => { if (!on) live.current.setActive(false); }, 300);
    let timer = rest(); on = false;
    const tick = (t: number) => {
      const { B, ids, look, rules: s, rec, push: pushOut } = table.current;
      if (stale.current) { // one guide a frame, however many touches came. While a shot can be made the guide and the cue stick are always there: for the pull on the rail, or for a firm shot without one
        const rec = Skia.PictureRecorder(), c = rec.beginRecording(), { aim, power } = shot.get();
        if (!shut() || watching()) {
          const g = aimGuide(B, shotOf(previewPower(power)), S || vs ? guideFor(mine.aim) : L ? 3 : GUIDE_LEVEL, GUIDE_WORK, cue); // lessons use the full guide
          if (!(S && les.current.guideOff)) { peeked.current = true; drawAim(Skia, c, map.current, g.path, g.ghost, g.lands, g.lost, g.ob); } drawCue(Skia, c, map.current, B[0].x, B[0].y, aim, power);
        }
        guide.value = rec.finishRecordingAsPicture(); stale.current = false;
      }
      const busy = () => moving.current || look.fx.length > 0; // effects (a ball falling into a pocket) outlive the last moving ball
      if (busy()) {
        let p = pace.current;
        const first = !p;
        if (!p) p = pace.current = newPace(seen.value[4] > 0.5 ? 1000 / 120 : 1000 / 60);
        if (!on) { on = true; clearTimeout(timer); live.current.setActive(true); }
        for (let n = 0, ms; n < 4 && busy() && (ms = nextFrame(p, t)); n++) { // at most 4 frames a turn, so a late JS thread still answers touches
          const t0 = performance.now();
          moving.current = advance(B, look, ms, moving.current, rec ? ev => (L ? noteLesson(rec as LessonRec, ev, B, ids) : record(rec, ev, B, ids)) : undefined);
          scheduleOnUI(push, draw.current(), busy() ? p.frame : STILL, first && !n);
          const cost = performance.now() - t0; spent(p, cost); made.current[0]++; made.current[1] += cost;
        }
        if (!busy()) pace.current = null; // the last frame stays on screen: a shot struck before the next turn starts its frames again
      } else if (rec) { // the shot is over: when its last frame is on screen, the rules say what it was
        if (!queue.value.length && L) { table.current.rec = null; ended.current(rec as LessonRec); }
        else if (!queue.value.length) {
          const next = judge(s, rec, pushOut);
          if (vs && s.turn === 0) { const w = won.current, p = potPay(w.cands, rec, s, next, w.run, ai); w.shots.xp += p.pay.xp; w.shots.coins += p.pay.coins; w.run = p.run; w.own += p.own; w.fouls += +next.note.startsWith('Foul'); }
          if (next.phase === 'over' || next.note.startsWith('Foul')) Haptics.notificationAsync(next.winner < 0 ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success);
          apply.current(next);
        }
      } else {
        if (on) { on = false; pace.current = null; timer = rest(); }
        if (s.hand && !s.choice && !map.current.calm) paint(false); // the ring round the cue ball in hand pulses
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (!hud) return;
    let was = seen.value, n = 0, cost = 0;
    const id = setInterval(() => { // twice a second
      const s = seen.value, [m, c] = made.current, k = m - n;
      setRates(`display ${s[4] > 0.5 ? 120 : 60} Hz  shown ${2 * (s[1] - was[1])}/s  none ready ${2 * (s[2] - was[2])}/s  skipped ${2 * (s[3] - was[3])}/s\nmade ${2 * k}/s  ${k ? ((c - cost) / k).toFixed(1) : '-'} ms each${pace.current ? `  for ${Math.round(1000 / pace.current.frame)} Hz` : ''}`);
      was = s; n = m; cost = c;
    }, 500);
    return () => clearInterval(id);
  }, [hud]);

  // The rail calls this on release: the strike. The cue goes back to level and centre ball after every shot.
  // shortcut: no follow-through of the stick; the cue is off the table from the frame of the strike.
  const fire = (power: number) => {
    const t = table.current;
    if (shut() || (onEight(t.rules) && t.rules.call < 0)) { shot.set({ power: 0 }); return; } // the 8 needs its pocket called first: the HUD asks for it
    Haptics.impactAsync(power > 0.7 ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light);
    if (vs) won.current.cands = t.rules.phase === 'break' ? [] : candsFor(t.B, t.ids, t.rules); // shortcut: a full candidate search on the strike frame, cheap next to a guide
    t.rec = L ? newLessonRec() : newRec(); strike(t.B[0], shotOf(power), cue); moving.current = true;
    tip.set(LEVEL); setSheet(false); setTools(false); shot.set({ power: 0, fine: false, locked: true });
  };
  // The AI's shot: its cue ball in hand, its call, then the strike as fire() makes it. The AI plans on the engine CUE and
  // strikes with the House Cue (STICK), its speed and tip held to that cue. shortcut: no cue stick on the table before the AI strikes.
  const play = (m: Move) => {
    const t = table.current;
    if (moving.current || t.rec || t.rules.phase === 'over' || !bot()) return;
    if (m.at) moveCue(t.B, m.at[0], m.at[1], t.rules.hand);
    if (m.call >= 0) t.rules = setCall(t.rules, m.call);
    safe.current = nextSafeties(safe.current, m.safety);
    const top = t.rules.phase === 'break' ? STICK.breakSpeed : STICK.maxSpeed, hold = (x: number) => Math.max(-STICK.tipLimit, Math.min(STICK.tipLimit, x));
    t.rec = newRec(); strike(t.B[0], { ...m.shot, speed: Math.min(m.shot.speed, top), a: hold(m.shot.a), b: hold(m.shot.b) }, STICK); moving.current = true; paint(); redraw();
  };
  // The AI's turn: when the table rests and no ruling waits, think (off the JS thread), wait out THINK_MS, then decide
  // or shoot. A pause, a new ruling or leaving the match drops a think that is still running; its result is ignored.
  useEffect(() => {
    const t = table.current, s = t.rules;
    if (!vs || paused || s.turn !== 1 || s.phase === 'over' || t.rec || moving.current) return;
    let live = true, wait: ReturnType<typeof setTimeout> | undefined;
    const t0 = Date.now(), then = (f: () => void) => { if (live) wait = setTimeout(() => { setThinking(false); f(); }, Math.max(0, THINK_MS - (Date.now() - t0))); };
    setThinking(true);
    if (s.choice) then(() => apply.current(choose(s, choiceFor(s))));
    else {
      const args = [t.B, t.ids, s, ai, seed.current++, safetiesArg(safe.current)] as const;
      thinkAsync(...args).then(m => then(() => play(m)), e => { // the runtime failed: think on the JS thread rather than stall the match
        if (__DEV__) console.warn('AI think failed off the JS thread', e);
        then(() => {
          let m: Move;
          try { m = think(args[0].map(b => ({ ...b })), [...args[1]], s, ai, args[4], args[5]); }
          catch (e2) { if (__DEV__) console.warn('AI think failed', e2); m = softMove(t.B, t.ids, s); }
          play(m);
        });
      });
    }
    return () => { live = false; clearTimeout(wait); setThinking(false); };
  }, [rules, paused]);
  // Where the finger is about the cue ball: its angle in the table frame and its distance on the screen.
  const finger = (px: number, py: number) => { const p = toTable(map.current, px, py), c = table.current.B[0]; return { ang: Math.atan2(p.y - c.y, p.x - c.x), lever: Math.hypot(p.x - c.x, p.y - c.y) * map.current.s }; };
  const touch = useRef<{ t: number; moved: boolean; ang: number; lever: number } | null>(null);
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: e => !shut() && onTable(map.current, e.nativeEvent.pageX, e.nativeEvent.pageY), // a touch that misses a control must not turn the aim
    onPanResponderGrant: (_, g) => { // a touch by the cue ball in hand drags it, a touch on a pocket calls it, any other aims
      const t = table.current, s = t.rules, v = map.current, p = toTable(v, g.x0, g.y0), c = t.B[0], at = toScreen(v, c.x, c.y);
      const k = canCall(s) ? HOLES.findIndex(h => Math.hypot(h[0] - p.x, h[1] - p.y) < 0.1) : -1;
      grab.current = s.hand && Math.hypot(at.x - g.x0, at.y - g.y0) < GRAB ? { x: c.x - p.x, y: c.y - p.y } : k >= 0 ? 'call' : null;
      if (k >= 0 && grab.current === 'call') { t.rules = setCall(s, k === s.call ? -1 : k); Haptics.selectionAsync(); paint(); redraw(); }
      touch.current = grab.current ? null : { t: Date.now(), moved: false, ...finger(g.x0, g.y0) };
    },
    onPanResponderMove: (_, g) => {
      if (g.numberActiveTouches > 1) { touch.current = null; return; } // a second finger moves the centre of the touches: no aim and no ball follows that
      const h = grab.current, t = table.current;
      if (h) { if (h !== 'call') { const p = toTable(map.current, g.moveX, g.moveY); if (moveCue(t.B, p.x + h.x, p.y + h.y, t.rules.hand)) paint(); } return; }
      const d = touch.current; if (!d || (!d.moved && Math.hypot(g.dx, g.dy) < DRAG)) return; // a drag swings the aim by the turn of the finger about the cue ball
      const f = finger(g.moveX, g.moveY);
      if (d.moved) shot.set({ aim: swing(shot.get().aim, d.ang, f.ang, f.lever) }); // the turn is counted from where the drag began: a touch on the cue ball itself would turn a slip of 6 px into a whip
      d.moved = true; d.ang = f.ang;
    },
    onPanResponderRelease: () => { // a tap points the cue at the tapped point
      const d = touch.current, s = shot.get(); touch.current = grab.current = null;
      if (!d || d.moved || Date.now() - d.t >= TAP_MS || d.lever < P.R * map.current.s) return; // a tap on the cue ball itself points nowhere
      const aim = tapAim(s.aim, s.fine, d.ang); if (aim !== s.aim) { shot.set({ aim }); Haptics.selectionAsync(); }
    },
    onPanResponderTerminate: () => { touch.current = grab.current = null; },
  })).current;

  // A lesson: the table is set again for every shot. Guided sets the reference spin; watch lines up the reference shot
  // and plays it after a moment.
  const reset = (to: Stage) => {
    peeked.current = false;
    const was = les.current.stage; // a try keeps the aim of the last try (the balls go back where they were); after watch it starts fresh
    table.current = newLesson(L!); moving.current = false; setSaid(null); les.current = { ...les.current, stage: to, said: null }; setStage(to);
    tip.set(to === 'solo' ? LEVEL : L!.ref.tip);
    shot.set(to === 'watch' ? { aim: L!.ref.ang, power: L!.ref.power, fine: false, locked: true } : { aim: was === 'watch' ? nearest(table.current.B) : shot.get().aim, power: 0, fine: false, locked: false });
    paint(); redraw();
  };
  useEffect(() => { if (L) reset(S ? 'solo' : 'watch'); }, []);
  useEffect(() => {
    if (!L || stage !== 'watch' || said || paused) return;
    const id = setTimeout(() => { const t = table.current; t.rec = newLessonRec(); strike(t.B[0], { ang: L.ref.ang, speed: L.ref.power * CUE.maxSpeed, ...shotTip(L.ref.tip) }); tip.set(LEVEL); moving.current = true; shot.set({ power: 0 }); }, 1200);
    return () => clearTimeout(id);
  }, [stage, said, paused]);
  const ended = useRef((r: LessonRec) => {});
  ended.current = r => {
    const v = verdict(L!, r, table.current.B[0]), { stage: st, run: k } = les.current;
    if (st !== 'watch') Haptics.notificationAsync(v.ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
    let out = { title: v.ok ? 'Nice' : 'Not this time', say: v.say, ok: v.ok };
    if (S) { // a miss is one more try; a clear says its stars, its pay and the star still to get
      if (!v.ok) setTries(les.current.tries + 1);
      else {
        const c = onClear!(les.current.tries, !peeked.current), k = starCount(c.bits);
        const left = !(c.bits & 2) ? `Next star: clear it within ${par(S)} tries.` : !(c.bits & 4) ? 'Next star: clear it with the guide off.' : '';
        const pay = !c.n ? 'No new stars.' : c.saved ? [c.pay.xp && `+${c.pay.xp} XP`, c.pay.coins && `+${c.pay.coins} coins`, c.gained && levelNote(c.gained)].filter(Boolean).join(' · ') + (c.gained?.mastery ? `\n${c.gained.mastery}` : '') : 'The stars could not be saved, so they pay nothing yet.';
        out = { title: `${'★'.repeat(k)}${'☆'.repeat(3 - k)}  Cleared`, say: [pay, left].filter(Boolean).join('\n'), ok: true };
      }
      les.current = { ...les.current, said: out }; setSaid(out); paint(); redraw(); return;
    }
    if (st === 'watch') out = { title: 'That is the shot', say: L!.how, ok: true };
    else if (st === 'solo') {
      const now = v.ok ? k + 1 : 0; setRun(now);
      if (now >= SOLO_RUN) { const paid = onPass?.(L!.id); out = { title: 'Lesson passed', say: paid ? `+${LESSON_PAY.xp} XP, first time.` : fresh ? 'The pass could not be saved, so it pays nothing yet.' : 'Replays are free practice.', ok: true }; }
      else if (v.ok) out.title = `${now} of ${SOLO_RUN} in a row`;
      else if (k) out.say += ' The run starts again.';
    }
    les.current = { ...les.current, said: out }; setSaid(out); paint(); redraw(); // shut() reads it before React renders
  };

  // A new rack. The break alternates after a finished rack (WPA 1.3); a rack started over keeps its breaker.
  const over = rules.phase === 'over';
  const win = rules.winner === -1 ? 0 : rules.winner, done = over && score.current[win] >= race; // the match is over
  const rerack = (breaker = over ? 1 - rules.breaker : rules.breaker) => {
    if (done) { score.current = [0, 0]; won.current = { shots: { xp: 0, coins: 0 }, run: 0, fouls: 0, own: 0, cands: [], pay: PASS_PLAY, chalk: null }; }
    apply.current(newGame(game, breaker as 0 | 1, set.callAll));
  };

  return (
    <View style={styles.root} {...pan.panHandlers}>
      {/* The table has its own canvas: it is most of the drawing work and it does not change during play. */}
      <Canvas style={StyleSheet.absoluteFill}>
        <Picture picture={felt} />
      </Canvas>
      <Canvas style={StyleSheet.absoluteFill}>
        <Picture picture={guide} />
        <Picture picture={picture} />
      </Canvas>
      {hud && <Text pointerEvents="none" style={[styles.rates, { top: pad.top + HUD, left: pad.left + 8 }]}>{rates}</Text>}
      {L && <LessonHud lesson={L} n={n} stage={stage} run={run} land={view.land} pad={pad} head={S && `${S.title} · par ${par(S)}`} line={S && `Try ${tries}${guideOff ? ' · guide off' : ''}`}>
        {S && <Btn label={guideOff ? 'Guide off' : 'Guide on'} name="Aim guide" on={!guideOff} onPress={() => { setGuideOff(!guideOff); les.current.guideOff = !guideOff; stale.current = true; }} />}
        <Btn label="II" name="Pause" onPress={() => { setPaused(true); setSheet(false); }} />
      </LessonHud>}
      {/* The player plates, the 9-ball strip and the banner with the last ruling (src/ui/MatchHud.tsx). */}
      {!L && <MatchHud rules={rules} names={names} push={table.current.push} view={view} pad={pad} calm={calm} wait={bot() && !over ? (thinking ? `${names[1]} is thinking…` : '') : undefined}>
        {rules.push && !rules.choice && !(vs && rules.turn === 1) && <Btn label={table.current.push ? 'Push out: on' : 'Push out'} onPress={() => { if (!table.current.rec) { table.current.push = !table.current.push; redraw(); } }} />}
        <Btn label="II" name="Pause" onPress={() => { setPaused(true); setTools(false); setSheet(false); }} />
      </MatchHud>}
      {/* A lesson's verdict on the last shot, and where to go from it. */}
      {L && said && !paused && (
        <View style={styles.sheet} pointerEvents="box-none">
          <View style={styles.card} accessibilityViewIsModal>
            <Text maxFontSizeMultiplier={1.3} accessibilityRole="header" style={styles.cardTitle}>{said.title}</Text>
            <Text maxFontSizeMultiplier={1.3} style={[styles.cardNote, said.say.startsWith('+') && styles.pay]}>{said.say}</Text>
            {S ? said.ok ? <>{onNext && <Btn label="Next scenario" onPress={onNext} />}<Btn label="Play again" onPress={() => { setTries(1); les.current.tries = 1; reset('solo'); }} /><Btn label={`Back to ${back}`} onPress={onQuit} /></>
              : <Btn label="Retry" onPress={() => reset('solo')} />
              : stage === 'watch' ? <><Btn label="Try it" onPress={() => reset('guided')} /><Btn label="Watch again" onPress={() => reset('watch')} /></>
              : run >= SOLO_RUN ? <>{onNext && n + 1 < LESSONS.length && <Btn label="Next lesson" onPress={onNext} />}<Btn label="Back to Learn" onPress={onQuit} /></>
              : stage === 'guided' ? <>{said.ok && <Btn label="Next: solo" onPress={() => { setRun(0); reset('solo'); }} />}<Btn label={said.ok ? 'Again' : 'Retry'} onPress={() => reset('guided')} /><Btn label="Watch again" onPress={() => reset('watch')} /></>
              : <Btn label={said.ok ? 'Next shot' : 'Retry'} onPress={() => reset('solo')} />}
          </View>
        </View>
      )}
      {/* A decision the rules hand to a player: a card over the table, and play waits for it. */}
      {rules.choice && !paused && !(vs && rules.turn === 1) && (
        <View style={styles.sheet} pointerEvents="box-none">
          <View style={styles.card} accessibilityViewIsModal>
            <Text maxFontSizeMultiplier={1.3} accessibilityRole="header" style={styles.cardTitle}>{`${names[rules.turn]}, your call`}</Text>
            {!!rules.note && <Text maxFontSizeMultiplier={1.3} style={styles.cardNote}>{rules.note}</Text>}
            {rules.choice.map((o, i) => <Btn key={o.label} label={o.label} onPress={() => apply.current(choose(rules, i))} />)}
          </View>
        </View>
      )}
      {/* The end of the rack: the frame score in a race, the pay at the end of the match. */}
      {over && !paused && (
        <Results rules={rules} kind={vs ? 'Quick match' : undefined} title={`${names[win]} wins${race > 1 ? done ? ' the match' : ' the frame' : ''}`}>
          {race > 1 && <Text maxFontSizeMultiplier={1.3} style={styles.cardNote}>{`${names[0]} ${score.current[0]} – ${score.current[1]} ${names[1]}`}</Text>}
          {!done && <Text maxFontSizeMultiplier={1.3} style={styles.cardNote}>{`${names[1 - rules.breaker]} breaks`}</Text>}
          {done && <Text maxFontSizeMultiplier={1.3} style={[styles.cardNote, styles.pay]}>{`+${won.current.pay.xp} XP · +${won.current.pay.coins} coins`}</Text>}
          {done && vs && <Text maxFontSizeMultiplier={1.3} style={styles.cardNote}>{`Shots +${won.current.shots.xp} XP · +${won.current.shots.coins} coins`}</Text>}
          {done && won.current.chalk && <Text maxFontSizeMultiplier={1.3} style={styles.cardNote}>{`Fresh Chalk: +${won.current.chalk.xp} XP · +${won.current.chalk.coins} coins`}</Text>}
          {done && gained.current && <Gained {...gained.current} />}
          {done && !!gained.current?.mastery && <Text maxFontSizeMultiplier={1.3} style={styles.cardNote}>{gained.current.mastery}</Text>}
          <Btn label={done ? 'Rematch' : 'Next rack'} onPress={() => rerack()} />
          {done && <Btn label="Menu" onPress={onQuit} />}
        </Results>
      )}
      {/* The shot controls sit inside the safe area where shotLayout puts them. */}
      <PowerRail store={shot} box={lay.rail} onStrike={fire} />
      <AimDial store={shot} box={lay.dial} />
      {!(L && stage === 'watch') && <View style={[styles.at, lay.spin]}><TipButton store={tip} onPress={() => { setSheet(!sheet); setTools(false); }} /></View>}
      {!L && !vs && <View style={[styles.at, lay.tools]}><Btn label="•••" name="Table tools" onPress={() => { setTools(!tools); setSheet(false); }} /></View>}
      {/* shortcut: the test buttons (Rack, Demo), behind one button. Not in quick match: a new rack would dodge a loss and a demo pot would pay. */}
      {tools && (
        <View onStartShouldSetResponder={() => true} style={[styles.tools, view.land ? { left: lay.tools.left + lay.tools.width + 12, bottom: height - lay.tools.top - lay.tools.height } : { left: lay.tools.left, bottom: height - lay.dial.top + 8 }]}>
          <Btn label="Rack" onPress={() => rerack()} onLongPress={() => setHud(!hud)} />
          <Btn label={'Demo\n' + DEMOS[demo][0]} onLongPress={() => Alert.alert('AI think time', benchAI())} onPress={() => { // hold: time the AI (blocks the JS thread a few seconds); tap: a fresh rack, and the demo shot is its break
            rerack(); const t = table.current; t.B[0].y = P.W / 2; // the demo shots go straight down the middle
            t.rec = newRec(); strike(t.B[0], { ang: 0, speed: 1, a: 0, b: 0, ...DEMOS[demo][1] });
            paint(); moving.current = true; shot.set({ power: 0, locked: true }); setDemo((demo + 1) % DEMOS.length);
          }} />
        </View>
      )}
      {/* The sheet stops short of the rail, so a shot can be pulled while it is open. */}
      {sheet && <TipSheet store={tip} land={view.land} calm={calm} felt={CLOTHS[cloth].felt} onDone={() => setSheet(false)} width={view.land ? 300 : lay.rail.left - 8 - lay.tools.left}
        style={view.land ? { right: width - lay.rail.left + 8, bottom: Math.max(pad.bottom, 8) } : { left: lay.tools.left, bottom: height - lay.dial.top + 8 }} />}
      {/* Paused: drawn last, so the card and its ground take every touch and no control or aim works behind them. Leaving ends the match. */}
      {paused && (
        <View style={[styles.sheet, styles.dim]} onStartShouldSetResponder={() => true}>
          <View style={styles.card} accessibilityViewIsModal>
            <Text maxFontSizeMultiplier={1.3} accessibilityRole="header" style={styles.cardTitle}>Paused</Text>
            {!L && race > 1 && <Text maxFontSizeMultiplier={1.3} style={styles.cardNote}>{`${names[0]} ${score.current[0]} – ${score.current[1]} ${names[1]} · race to ${race}`}</Text>}
            <Btn label="Resume" onPress={() => setPaused(false)} />
            <Btn label={S ? 'Leave scenario' : L ? 'Leave lesson' : 'Leave match'} onPress={onQuit} />
          </View>
        </View>
      )}
    </View>
  );
}

// The player's level after the award, on one line (levelNote): yellow for a level-up, like the pay.
function Gained(g: ReturnType<typeof award>) {
  return <Text maxFontSizeMultiplier={1.3} style={[styles.cardNote, g.to > g.from && styles.pay]}>{levelNote(g)}</Text>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.ground },
  at: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  tools: { position: 'absolute', flexDirection: 'row', gap: 8, padding: 8, backgroundColor: C.panel, borderColor: C.chalk + '40', borderWidth: 1, borderRadius: 12 },
  sheet: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { maxWidth: 320, alignSelf: 'center', padding: 16, gap: 10, borderRadius: 10, borderWidth: 1, borderColor: C.chalk + '66', backgroundColor: C.ground + 'F2' },
  cardTitle: { color: C.chalk, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  cardNote: { color: C.chalk, fontSize: 14, lineHeight: 19, textAlign: 'center' },
  dim: { backgroundColor: C.ground + '99' },
  pay: { color: BALLS[0], fontWeight: '700' }, // one-ball yellow is for coins and XP
  rates: { position: 'absolute', color: C.chalk, fontSize: 10, lineHeight: 13, fontVariant: ['tabular-nums'] },
});
