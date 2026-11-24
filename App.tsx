// The menus (src/ui/Menus.tsx) and the match. In the match two players pass the phone, or one plays the AI (quick match,
// src/ai/turn.ts): 8-ball or 9-ball under the WPA rules (src/rules), with the shot controls. Drag or tap on
// the table to aim, turn the dial to aim finely, pull the rail down and let go to shoot. The table never fires a shot.
// With the cue ball in hand, drag it; tap a pocket to call it. The cue ball button opens the tip and cue angle sheet
// (spin, jump, masse). A lesson (src/learn) plays on the same screen with its own table, goal and steps, and so does a
// scenario (src/scenarios): a lesson table played solo with tries, stars and the player's own cue.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AppState, BackHandler, PanResponder, PixelRatio, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Canvas, Circle, Picture, Skia, type SkPicture } from '@shopify/react-native-skia';
import { cancelAnimation, Easing, useAnimatedReaction, useDerivedValue, useFrameCallback, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { scheduleOnUI } from 'react-native-worklets';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import * as ScreenOrientation from 'expo-screen-orientation';
import { initialWindowMetrics, SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ball, breakSpot, CUE, HOLES, P, rack, Shot, strike } from './src/physics/engine';
import { advance, drawBalls, makeKit, newLook } from './src/render/balls';
import { drawMarks, SETTLE } from './src/render/marks';
import { drawBank } from './src/render/bank';
import { frameOf, newPace, nextFrame, type Pace, refresh, type Slot, spent } from './src/render/pace';
import { drawCue, shotLayout } from './src/render/cue';
import { BAR, drawAim, drawTable, onTable, toScreen, toTable } from './src/render/table';
import { LEVEL, shotTip } from './src/render/tip';
import { type Lesson, LESSON_PAY, LESSONS, lessonTable, type LessonRec, litCushions, newLessonRec, noteLesson, PENCIL_AT, SOLO_RUN, soloTable, type Stage, verdict } from './src/learn/lessons';
import { loadDone, saveDone } from './src/learn/save';
import { canCall, choose, handCue, hooked, legalFirst, moveCue, newGame, newRec, ranOut, Rec, record, setCall, spotBall, State } from './src/rules/rules';
import { thinkAsync } from './src/ai/think';
import { candsFor, choiceFor, type Move, nextSafeties, potPay, type Safeties, safetiesArg, softMove, think } from './src/ai/turn';
import { rng, TIERS } from './src/ai/shot-ai';
import { hustler, matchFeats, newLedger, noteShot, type Pay, rackOver, settle, type Settled, type Vs } from './src/progress/pay';
import type { StyleId } from './src/ai/styles';
import { medalOf, newRun, type Opts, type Run } from './src/tournament/bracket';
import { loadRun, saveRun } from './src/tournament/save';
import { fits, type Snap } from './src/tournament/snap';
import { tourMatch as tm, type TourMatch as TM } from './src/tournament/match';
import { DRAG, guideLen, nearest, pointAt, previewPower, rollOut, shorten, swing, TAP_MS, tapAim } from './src/shot/aim';
import { farAhead, farGuide, type Guide, type GuideAsk, nearGuide } from './src/shot/far';
import { guidePacer } from './src/shot/pacer';
import { award, featsDone, keep, matchLeft, matchOpen, maxPick, ownStats, passPlayPay, payRun, profile, ramOwed, rivalDone, unlockCue } from './src/progress';
import { shown, tenth } from './src/progress/rival';
import { clear, clearFeats, isOpen, par, SCENARIOS, type Scenario, starCount, starsFor } from './src/scenarios/scenarios';
import { armChalk, chalkResult, dailyClear, dailyPick, dayKey, grantChalk } from './src/daily/daily';
import { loadDaily, saveDaily } from './src/daily/save';
import { loadStars, saveStars } from './src/scenarios/save';
import { levelNote } from './src/progress/profile';
import { type CueId, CUES, guideScale, LOW_TIP, plain, sketch, type Stat, stick } from './src/progress/cues';
import { maxStats, nextPick } from './src/progress/mastery';
import { brakeAt, gold, hindsight, KEEP, HOLD_MS, STILL as HELD, mog, mogLead, trickFor } from './src/progress/tricks';
import { loadSettings, saveSettings } from './src/settings/save';
import { RIVAL, type Settings } from './src/settings/settings';
import { BALLS, C, CLOTHS, CREAM, DARK, FONT } from './src/theme';
import { Btn } from './src/ui/Btn';
import { useFontsReady } from './src/ui/fonts';
import { LESSON_HUD, LessonHud } from './src/ui/LessonHud';
import { Act, hudHeight, MatchHud, PayRow, PayTotal, Results } from './src/ui/MatchHud';
import { Menus, type Screen } from './src/ui/Menus';
import { AimDial, PowerRail, RAIL_FONT, shotStore } from './src/ui/ShotControls';
import { TipButton, TipSheet, tipStore } from './src/ui/TipControl';
import { CLIP, CLIP_TIER, fullGame } from './src/clip';

const GRAB = 36; // px: a touch this near the cue ball in hand drags it. The ball is smaller than a fingertip, so the
// ball keeps its distance from the finger and stays in view.
const GUIDE_WORK = 3200, LONG_WORK = 8000, DAY_WORK = 12000; // ball-steps the aim guide may follow after first contact: a guide of 45 cm or less past the hit, a longer one (3,200 cuts a 60 cm line short on most soft shots), and the Daybreak's. The steps before it are not capped: a slow guide is worked out off the JS thread (src/shot/pacer.ts)
// Pass and play is a matched game: both players on House Cue stats with the perks off, whatever cues the phone owns.
const MATCH_CUE = 'house', STICK = stick(MATCH_CUE, true), GUIDE_AIM = CUES[MATCH_CUE].aim; // one cue for the shot and its guide
const THINK_MS = 800; // the AI takes at least this long, so a fast tier does not shoot the moment the table stops
const STILL = 1e9; // ms: a picture that stays on screen until the next one comes (the table at rest, the last frame of a shot)
// Sample shots, played from a fresh rack so the spin, jump and masse animation can be seen without aiming one.
const DEMOS: [string, Partial<Shot>][] = [['Draw', { speed: 2.5, b: -0.45 }], ['Side', { speed: 1.2, a: 0.45 }], ['Jump', { speed: 4.2, elev: 0.7 }], ['Massé', { speed: 3.5, a: 0.4, elev: 1.19 }]];
const kit = makeKit(Skia);
const EMPTY = (() => { const rec = Skia.PictureRecorder(); rec.beginRecording(); return rec.finishRecordingAsPicture(); })();

// A racked table for the start of a game. rec = the record of the shot in play; push = a push out was declared for it.
// Every rack of a match has its own seed (a re-rack after an illegal break too), so no break is the same twice.
const newTable = (rules: State) => {
  const [x0, y0] = breakSpot(), ids = [0], B: Ball[] = [{ x: x0 - 1e-3, y: y0, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true }]; // above the head string, not on it
  for (const [id, x, y] of rack(rules.game, undefined, undefined, Math.floor(Math.random() * 2 ** 31))) { ids.push(id); B.push({ x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true }); }
  return { B, ids, look: newLook(B), rules, rec: null as Rec | null, push: false };
};
// A tournament match's saved table, as Game plays it (snap.ts).
const resumed = (t: unknown) => { const s = t as Snap, B = s.B.map(b => ({ ...b })); return { B, ids: [...s.ids], look: newLook(B), rules: s.rules, rec: null as Rec | null, push: s.push }; };
type TourMatch = TM<ReturnType<typeof payRun>>;
// A lesson's table. No rules play: the state only marks the lesson's pocket, and the lesson judges the shot.
const newLesson = (l: Lesson) => {
  const { B, ids } = lessonTable(l), rules: State = { ...newGame(8, 0, false), phase: 'play', hand: false, balls: ids.slice(1), call: l.goal.pocket ?? -1 };
  return { B, ids, look: newLook(B), rules, rec: null as Rec | null, push: false };
};

export default function App() {
  if (!useFontsReady()) return null;
  return <SafeAreaProvider initialMetrics={initialWindowMetrics}><Root /></SafeAreaProvider>;
}

const LOCKS = [ScreenOrientation.OrientationLock.DEFAULT, ScreenOrientation.OrientationLock.PORTRAIT_UP, ScreenOrientation.OrientationLock.LANDSCAPE];
const PLAY = ['match', 'ai', 'lesson', 'scenario', 'daily', 'tourMatch'] as const; // the screens that are a table, not a menu
const MENU_LOCKS = [ScreenOrientation.OrientationLock.LANDSCAPE, ScreenOrientation.OrientationLock.PORTRAIT_UP];

// The screen on show and the settings. A match reads its setup when it starts.
function Root() {
  // The App Clip plays one quick match against the Regular tier, calling only the 8, and has no menus.
  const [set, setSet] = useState((): Settings => CLIP ? { ...loadSettings(), tier: CLIP_TIER, aiGame: 8, aiRace: 1, callAll: false } : loadSettings()), [screen, go] = useState<Screen | typeof PLAY[number]>(CLIP ? 'ai' : 'home');
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
  // A lesson passed for the first time pays once and counts toward the Surveyor.
  const pass = (id: string) => { // true = paid
    if (done.includes(id)) return false;
    const now = LESSONS.map(l => l.id).filter(k => k === id || done.includes(k));
    setDone(now); const saved = saveDone(now); if (saved) award(LESSON_PAY);
    if (now.length >= PENCIL_AT) unlockCue('surveyor');
    return saved;
  };
  // The tournament run (src/tournament): in a ref too, since a match saves it after every shot without a render.
  const [loaded] = useState(loadRun), [run, setRun] = useState(loaded.run), runRef = useRef(run);
  // The run moves on in memory even if the save fails: disk keeps the match before its result, and a relaunch plays
  // the saved shot again to the same result, so nothing is lost and the pay goes out then.
  const putRun = (r: Run | null) => { runRef.current = r; setRun(r); return saveRun(r); };
  // The next run's seed comes from the last run's (kept on disk until a new one starts), so abandoning a field and
  // starting again cannot re-roll it. Only the first run, or one after a damaged save, is random.
  // Anything the old run still owes is paid first: once the new run is saved, the old one's pay mark no longer matches.
  const startRun = (o: Opts) => {
    const old = runRef.current;
    if (old) payOut(old);
    putRun(newRun(o, Math.floor((old ? rng(old.seed + 1)() : Math.random()) * 2 ** 31)));
  };
  // The run's pay goes out after the run is saved, marked paid in the same profile save (payRun): a crash pays the rest
  // at the next launch, and nothing twice. The run's medal goes in that save too.
  const payOut = (r: Run, cue?: CueId) => payRun({ seed: r.seed, earned: r.earned, medal: medalOf(r) ? [r.opts.cup, medalOf(r)] : null }, cue);
  useEffect(() => { if (run) payOut(run); }, []); // at launch: anything a crash left unpaid, as XP with no cue mastery (the cue played is not known)
  const tourMatch = () => tm({ get: () => runRef.current, put: putRun, pay: payOut, keep: (x) => { runRef.current = x; saveRun(x); } });
  const match = useRef<TourMatch | undefined>(undefined); // fixed while the match screen is up: the run changes under it
  const change = (p: Partial<Settings>) => setSet(s => ({ ...s, ...p }));
  const first = useRef(true);
  useEffect(() => { if (first.current) first.current = false; else saveSettings(set); }, [set]);
  useEffect(() => { if (done.length >= PENCIL_AT) unlockCue('surveyor'); }, []); // also at launch: lessons passed before cues existed still count
  useEffect(matchLeft, []); // the app was closed in a match that counts for the Unbeaten streak: a loss, as leaving it is
  // The lock follows the place: the menus are one way up (settings.menus), a match, lesson or table its own (settings.orient).
  const playing = (PLAY as readonly string[]).includes(screen);
  useEffect(() => { ScreenOrientation.lockAsync(playing ? LOCKS[set.orient] : MENU_LOCKS[set.menus]).catch(() => {}); }, [playing, set.orient, set.menus]);
  useEffect(() => { // Android back: from a menu page to home
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { if (screen !== 'home' && !playing) { go('home'); return true; } return false; });
    return () => sub.remove();
  }, [screen]);
  return <>
    <StatusBar style="light" />
    {screen === 'match' || screen === 'ai' ? <Game key={screen} set={set} ai={screen === 'ai' ? set.tier : -1} chalk={screen === 'ai' ? chalk : undefined} onQuit={() => go('home')} />
      : screen === 'lesson' ? <Game key={lesson} set={set} lesson={lesson} fresh={!done.includes(LESSONS[lesson].id)} onPass={pass} onNext={() => setLesson(lesson + 1)} onQuit={() => go('learn')} />
      : screen === 'scenario' ? <Game key={`s${scen}`} set={set} scen={SCENARIOS[scen]} onClear={(t, off) => cleared(SCENARIOS[scen], t, off)} onNext={nextScen ? () => setScen(scen + 1) : undefined} onQuit={() => go('scenarios')} />
      : screen === 'tourMatch' && match.current ? <Game key="tour" set={set} tour={match.current} onQuit={() => { setRun(runRef.current); go('tour'); }} />
      : screen === 'daily' ? <Game key={`d${day}`} set={set} scen={dayScen} back="Daily Table" onClear={dayCleared} onQuit={() => go('calendar')} />
      : <Menus screen={screen === 'tourMatch' ? 'tour' : screen} set={set} change={change} go={go} done={done} learn={learn} stars={stars} play={play} daily={daily} today={today} day={day} playDay={playDay} arm={arm} run={run} damaged={loaded.damaged} startRun={startRun} abandon={() => tourMatch()?.forfeit()} playTour={() => { match.current = tourMatch(); if (match.current) go('tourMatch'); }} />}
  </>;
}

type Clear = ReturnType<typeof clear> & { saved: boolean; gained?: ReturnType<typeof award> };
// A match, a lesson (lesson), or a scenario (scen, any table: the daily table plays one too). fresh = the lesson has not
// been passed before; onPass = it was just passed; onClear = the scenario was just cleared, with its tries and whether
// the whole try was played with the guide off. back = the page onQuit returns to, named on the result card.
// ai = the AI tier (index into TIERS) in player 1's seat, or RIVAL; -1 = pass and play. tour = a tournament match
// against a styled AI (src/tournament): its own rules, saved after every strike and ruling so it resumes exactly.
function Game({ set, ai = -1, tour, onQuit, lesson: n = -1, fresh, onPass, onNext, scen: S, onClear, back = 'Scenarios', chalk }: { set: Settings; ai?: number; tour?: TourMatch; chalk?: (won: boolean, matchPay: Pay) => Pay; back?: string; onQuit: () => void; lesson?: number; fresh?: boolean; onPass?: (id: string) => boolean; onNext?: () => void; scen?: Scenario; onClear?: (tries: number, guideOff: boolean) => Clear }) {
  const vs = ai >= 0 || !!tour, rival = ai === RIVAL, snap0 = tour && fits(tour.live?.table, tour.game) ? tour.live.table : undefined;
  const game = tour ? tour.game : vs ? set.aiGame : set.game, race = tour ? tour.race : vs ? set.aiRace : set.race;
  const callAll = tour ? tour.callAll : set.callAll, bankRule = tour ? tour.bank : set.bank;
  // The AI's rating on the tier scale. The Rival's is frozen for the match and read again for a rematch; a tournament
  // opponent plays its style's bump on top of the rating it is shown at.
  const level = useRef(tour ? tour.level : rival ? profile().rival[game].rating : ai + 1), moved = useRef('');
  // Shot pay (in the frame loop, which reads level.current so a rematch pays at the new rating): the Rival pays 0.7 + 0.1 x rating, as a boss does.
  const names = tour ? ['You', tour.name] : vs ? [set.names[0], rival ? `Rival ${shown(level.current)}` : TIERS[ai].name] : set.names;
  const { width, height } = useWindowDimensions();
  const pad = useSafeAreaInsets(), calm = useReducedMotion();
  const L: Lesson | undefined = S ?? LESSONS[n];
  const at = useRef(L); // the table up: in a lesson's solo step, a new one every shot
  // a fresh rack in a match that has frames already (its saved table did not fit): the break alternates by frame (WPA 1.3)
  const fresh0 = (((tour?.breaker ?? 0) + (tour?.live ? tour.live.score[0] + tour.live.score[1] : 0)) % 2) as 0 | 1;
  const table = useRef(L ? newLesson(L) : snap0 ? resumed(snap0) : newTable(newGame(game, fresh0, callAll, bankRule, Math.floor(Math.random() * 2 ** 31)))), HUD = L ? LESSON_HUD : hudHeight(table.current.rules.game); // screen units kept above the table for the HUD
  // The lesson's step, the passes in a row in the solo step, and the verdict on the last shot (a card over the table).
  const [stage, setStage] = useState<Stage>('watch'), [run, setRun] = useState(0), [said, setSaid] = useState<{ title: string; say: string; ok: boolean } | null>(null);
  // A scenario counts its tries; the third star wants a try with the aim guide never on screen (peeked = it was).
  const [tries, setTries] = useState(1), [guideOff, setGuideOff] = useState(false), peeked = useRef(false);
  const les = useRef({ stage, run, said, tries, guideOff }); les.current = { stage, run, said, tries, guideOff };
  const pure = useRef(!snap0); // Purist: no shot of this match was played with the guide on (a match picked up again does not count)
  const lay = shotLayout(width, height, { ...pad, top: pad.top + HUD }), view = { ...lay.view, dpr: PixelRatio.get(), calm }, where = [view.land, view.s, view.ox, view.oy];
  const { cloth } = set;
  const map = useRef(view); map.current = view; // the pan responder is created once, so it reads the latest mapping
  // The table never changes during play: one picture, drawn again only when the window does.
  const felt = useMemo(() => { const rec = Skia.PictureRecorder(); drawTable(Skia, rec.beginRecording(), view, CLOTHS[cloth]); return rec.finishRecordingAsPicture(); }, [...where, cloth]);

  const score = useRef<[number, number]>(tour?.live ? [...tour.live.score] : [0, 0]), [paused, setPaused] = useState(false), held = useRef(false); // score = frames won; held = paused, for the frame loop
  const gained = useRef<ReturnType<typeof award> | null>(null); // the award of the match, for the results card
  // Quick match: the pay so far (src/progress/pay.ts), the pots on the table at the strike (for pRef), and the pay lines
  // of the finished match.
  // shortcut: a quick match left from the pause card pays nothing, not even its shots (a tournament forfeit pays them); no safety pay (needs the AI's reply).
  const won = useRef(snap0 ? { ...snap0.ledger, shots: { ...snap0.ledger.shots } } : newLedger()), pre = useRef<Ball[]>([]), end = useRef<Settled | null>(null), prize = useRef<Pay | null>(null);
  // The opponent, for pay and feats (pay.ts Vs): an AI tier, or the rating of a Rival or a tournament seat. The Twig's Humble reads the cue.
  const foe = (): Vs => (rival || tour ? { boss: level.current, tour: tour?.stakes, cue: own } : { tier: ai + 1, cue: own });
  // The Whisper's Soft hands (tricks.ts): its uses this rack, the pull of the last strike, and whether the player's last shot used it.
  const snooker = useRef(false); // the player came to the table with no straight line to a ball they may hit (Escape Artist)
  const opened = () => { if (vs && !tour && hustler(foe())) matchOpen(); }; // at a strike: the first one of a match marks it as in play (progress.ts matchOpen)
  const safe = useRef<Safeties>(snap0?.safe ?? { row: 0, rack: 0 }), seed = useRef(snap0?.seed ?? Math.floor(Math.random() * 2 ** 31)), asked = useRef<{ rules: State; args: Parameters<typeof thinkAsync>; p: Promise<Move> } | null>(null), [thinking, setThinking] = useState(false);
  // A tournament match is saved at every strike (with the shot, so a relaunch plays the same shot again) and ruling.
  const snap = (shot?: Shot) => {
    if (!tour) return;
    const t = table.current, B = t.B.map(b => ({ ...b }));
    const saved: Snap = { v: 1, B, ids: [...t.ids], rules: t.rules, push: t.push, ledger: won.current, safe: safe.current, seed: seed.current, cue: own, stats: mine, shot };
    tour.save({ score: [...score.current], table: saved });
  };
  const [sure, setSure] = useState(false); // a tournament match is left by forfeit, a second tap
  useEffect(() => setSure(false), [paused]); // closing the card disarms it
  useEffect(() => { if (tour && !snap0) snap(); }, []); // a new rack (the first, or one in place of a save that did not fit) is saved before its break, so a relaunch never re-racks it
  useEffect(() => { const sub = BackHandler.addEventListener('hardwareBackPress', () => { setPaused(p => !p); return true; }); return () => sub.remove(); }, []); // Android back opens and closes the pause card
  const rules = table.current.rules, [, redraw] = useReducer((n: number) => n + 1, 0); // the rules live with the table; redraw shows a change
  const shot = useRef(shotStore(nearest(table.current.B))).current; // the held aim and the power on the rail
  const stale = useRef(true); // the guide must be worked out again: the aim, the power, the tip or the table changed
  // The frame loop on the JS thread sleeps while nothing changes (a phone that stays cool keeps its clock up); wake starts it.
  const wake = useRef(() => {}), dirty = () => { stale.current = true; wake.current(); };
  // line = the newest guide; redo = it or the stick must be drawn again; took = what it took and where; gap = the longest wait between two turns of the JS thread (readout)
  const line = useRef<Guide | null>(null), redo = useRef(false), took = useRef<[number, boolean]>([0, false]), gap = useRef(0);
  const guides = useRef(guidePacer<GuideAsk, Guide>(nearGuide, farGuide(), (g, ms, off) => { line.current = g; redo.current = true; took.current = [ms, off]; wake.current(); })).current;
  const [demo, setDemo] = useState(0);
  const [hud, setHud] = useState(false), [rates, setRates] = useState(''); // frame rate readout, dev builds only: hold the Rack button to show or hide it
  const tip = useRef(tipStore()).current, [sheet, setSheet] = useState(false), [tools, setTools] = useState(false);
  const moving = useRef(false), grab = useRef<{ x: number; y: number } | 'call' | null>(null), called = useRef(0); // called = when the player called a pocket: its ring settles from then
  // The balls and the aim guide are Skia pictures, recorded on the JS thread and handed to the canvas through shared
  // values, so a frame of play or of aiming never re-renders React.
  // The marks (src/render/marks.ts) are a picture of their own: the pulse of the ring round the cue ball in hand
  // redraws them alone, not the 16 balls (4 canvas calls a frame in place of about 190, scripts/draw-bench.mjs).
  const picture = useSharedValue(EMPTY), guide = useSharedValue(EMPTY), marks = useSharedValue(EMPTY);
  const draw = useRef(() => EMPTY), mark = useRef(() => EMPTY);
  draw.current = () => {
    const rec = Skia.PictureRecorder(), { B, ids, look } = table.current;
    drawBalls(kit, rec.beginRecording(), B, ids, look, view);
    return rec.finishRecordingAsPicture();
  };
  mark.current = () => {
    const rec = Skia.PictureRecorder(), { B, rules: s, rec: shot } = table.current;
    const me = !shot && !bot(); // on the AI's turn the human's marks stay off
    const c = rec.beginRecording(); drawBank(Skia, c, view, at.current ? litCushions(at.current) : s.lit); // a bank table's lit cushions, worked out once per table, or the bank shots of a match
    drawMarks(Skia, c, view, { hand: me && !s.choice && s.hand, x: B[0].x, y: B[0].y, call: s.call >= 0 ? s.call : aiCall.current, ask: me && mustCall(s), ms: performance.now(), at: called.current, zone: at.current?.goal.zone, pulse: false }); // the growing ring is the <Circle> on the UI thread
    return rec.finishRecordingAsPicture();
  };
  // Frames of play wait in queue and the UI thread shows one on each display refresh (see src/render/pace.ts).
  const queue = useSharedValue<Slot<SkPicture>[]>([]), left = useSharedValue(STILL);
  const seen = useSharedValue([0, 0, 0, 0, 1000 / 60]); // counts for the readout (refreshes, frames shown, refreshes with no frame ready, frames skipped), then the time between refreshes in ms: it falls fast and rises slowly, so a missed refresh barely moves it
  // The ring that grows out of the cue ball in hand, on the UI thread: [x, y, ball radius] in px, and on (0 or 1). The JS loop sleeps meanwhile.
  const ring = useSharedValue([0, 0, 0]), ringOn = useSharedValue(0), phase = useSharedValue(0);
  useAnimatedReaction(() => ringOn.value, (on, was) => {
    if (on === was) return;
    if (on) phase.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.linear }), -1, false);
    else { cancelAnimation(phase); phase.value = 0; }
  });
  const ringR = useDerivedValue(() => (1.7 + 1.6 * (1 - (1 - phase.value) ** 3)) * ring.value[2]), ringO = useDerivedValue(() => ringOn.value * 0.7 * (1 - phase.value));
  const ringX = useDerivedValue(() => ring.value[0]), ringY = useDerivedValue(() => ring.value[1]), ringW = useDerivedValue(() => Math.max(1, 0.16 * ring.value[2]));
  // One function for the life of the screen: a new one would register again and lose a refresh on each React render.
  const beat = useFrameCallback(useCallback(f => {
    'worklet';
    const dt = f.timeSincePreviousFrame ?? 0, r = refresh(queue.value, left.value, dt), s = seen.value;
    left.value = r.left;
    if (r.show) { queue.value = r.rest; picture.value = r.show; }
    seen.value = [s[0] + 1, s[1] + (r.show ? 1 : 0), s[2] + (r.dry ? 1 : 0), s[3] + r.skipped, dt > 2 && dt < 50 ? s[4] + (dt < s[4] ? 0.2 : 0.02) * (dt - s[4]) : s[4]];
  }, []), false);
  const live = useRef(beat); live.current = beat;
  // mk = the marks for the shot in play, with its first frame (they do not change while balls move)
  const push = (pic: SkPicture, ms: number, first: boolean, mk: SkPicture | null) => { 'worklet'; queue.value = first ? [{ pic, ms }] : [...queue.value, { pic, ms }]; if (first) { left.value = 0; ringOn.value = 0; } if (mk) marks.value = mk; }; // a shot in play has no ring
  const setRing = (at: number[], on: number) => { 'worklet'; ring.value = at; ringOn.value = on; };
  const still = (pic: SkPicture, mk: SkPicture, at: number[], on: number) => { 'worklet'; queue.value = []; left.value = STILL; picture.value = pic; marks.value = mk; setRing(at, on); };
  // Where the ring is and whether it pulses: the player's own ball in hand, at rest, not paused, motion not reduced.
  const ringOf = (): [number[], number] => { const { B, rules: s, rec } = table.current, v = map.current, c = toScreen(v, B[0].x, B[0].y); return [[c.x, c.y, P.R * v.s], !v.calm && !held.current && !rec && !bot() && !s.choice && s.hand ? 1 : 0]; };
  const setMarks = (mk: SkPicture) => { 'worklet'; marks.value = mk; };
  const pace = useRef<Pace | null>(null), made = useRef([0, 0]); // made = frames made and the ms they took, for the readout
  // The table as it is now, shown at once in place of any frames that wait. Play that goes on starts its frames again.
  // A ball the rules or a finger moved did not travel there: no speed streak.
  // again = the guide is drawn again too; a ball the AI carries does not need that.
  const paint = (again = true) => { const { B, look } = table.current; look.last.set(B.flatMap(b => [b.x, b.y])); pace.current = null; if (again) { dirty(); guides.drop(); line.current = null; } scheduleOnUI(still, draw.current(), mark.current(), ...ringOf()); }; // a guide for the table as it was is not drawn
  useEffect(() => { touch.current = null; paint(); }, where); // a drag measured in the old layout ends when the window turns
  useEffect(() => { const off = [shot.sub(dirty), tip.sub(dirty)]; return () => off.forEach(f => f()); }, []);
  useEffect(() => hind ? shot.sub(() => { if (tr.k.past.was?.kept && shot.get().power > 0.05) { tr.k.past.was = null; redraw(); } }) : undefined, []); // a pot can be taken back until the next pull
  useEffect(() => { if (!seer) return; const off = [shot.sub(() => watch()), tip.sub(() => watch())]; return () => { off.forEach(f => f()); clearTimeout(hold.current.timer); }; }, []);
  useEffect(() => { held.current = paused; scheduleOnUI(setRing, ...ringOf()); wake.current(); }, [paused]); // the marks and the ring stop under the pause card, and move again after it
  // A lesson plays with the engine's own cue, the one its reference shots are tuned on (src/learn/lessons.test.mjs).
  // A scenario and quick match play with the player's own cue and its aim guide (stick stats count in challenges).
  const own = useMemo(() => snap0?.cue ?? profile().cue, []), mine = useMemo(() => snap0?.stats ?? ownStats(own), []), cue = useMemo(() => (S || vs ? stick(own, false, mine, vs) : L ? CUE : STICK), []), pen = !!(S || vs) && sketch(own); // fixed for the life of the screen: a cue change takes effect at the next table
  // The Aura's run comes from the profile into the ledger of a match against Hustler or harder (a tournament match that is picked up again keeps its own), and goes back when the match settles.
  if (vs && own === 'aura' && hustler(foe()) && !won.current.aura) won.current.aura = { ...(profile().aura ?? { run: 0, owed: false }) };
  // The stats and the stick in play. The cue's own, but for a cue whose trick changes its stats in a match (the Marble).
  const inPlay = useRef({ stats: mine, cue });
  const lines = vs && (own === 'daybreak' || own === 'banker' || own === 'vernier') ? own : undefined, optic = vs && own === 'optic'; // the cues whose trick is in the guide (aim.ts aimGuide)
  const struck = () => (inPlay.current.cue.dead && table.current.rules.phase === 'break' ? { ...inPlay.current.cue, dead: false } : inPlay.current.cue); // the stick for the shot now: the Plumb's Dead stop is off on the break
  const setStats = (st: typeof mine) => { const was = inPlay.current.stats; if (st.power === was.power && st.spin === was.spin && st.aim === was.aim) return; inPlay.current = { stats: st, cue: stick(own, false, st, vs) }; dirty(); };
  // The Maxxed's Statmaxxing: one stat is 10. The pick is free before the break shot of a rack. Once a rack the player may
  // pick again at the start of a turn (visit = the shots of this visit to the table); the pick is spent at the strike,
  // when it is another stat than the turn began with (from), so the button can step through the three.
  const maxxed = vs && own === 'maxxed', [pick, setPick] = useState<Stat>(() => profile().maxxed ?? 'aim'), tr = useRef(trickFor(vs ? own : undefined, pick, vs && own === 'ram' && !!profile().ram)).current; // the cue's trick in this rack (tricks.ts)
  const canPick = () => { const t = table.current; return maxxed && !bot() && !moving.current && !t.rec && !t.rules.choice && (t.rules.phase === 'break' || (t.rules.phase === 'play' && tr.k.again && !tr.k.visit)); };
  const repick = () => { if (!canPick()) return; const to = nextPick(pick); setPick(to); maxPick(to); setStats(maxStats(to)); };
  const marble = vs && own === 'marble'; // the Marble's Mog
  // The Ram's Overdrive (tricks.ts): the player's pull stands for up to 120% power, and a strike past 100% owes a shot with no guide.
  // The Seer's Omen (tricks.ts). hold = the pull that is held still: the shot it stands for (aim, tip and raise as one
  // key, and the pull), the timer of its 0.6 s, and a count that a move raises, so an answer for an old shot is dropped.
  const seer = vs && own === 'seer', hold = useRef<{ key: string; pull: number; timer?: ReturnType<typeof setTimeout>; job: number }>({ key: '', pull: 0, job: 0 });
  const canSee = () => { const t = table.current; return seer && !shut() && t.rules.phase === 'play' && !t.push && !(canCall(t.rules) && t.rules.call < 0); }; // not on the break or a push-out, and where a call is needed, not before it
  const shutEye = () => { const o = tr.k.omen; clearTimeout(hold.current.timer); hold.current.job++; if (o.armed || o.open) { o.armed = o.open = false; redraw(); dirty(); } };
  const see = () => { // the pull held still: play the shot ahead, off the JS thread; the eye is open when it answers
    const o = tr.k.omen, h = hold.current, t = table.current, job = h.job, pull = shot.get().power;
    if (!o.armed || o.open || !canSee()) return;
    farAhead(t.B, t.ids, t.rules, shotOf(pull), struck()).then(res => {
      if (job !== h.job || !o.armed || table.current !== t || t.rec) return; // the shot changed while the answer came
      Object.assign(o, { open: true, left: o.left - 1, gold: gold(t.rules, res), pull, plain: true }); Haptics.selectionAsync(); redraw(); dirty();
    }, () => {});
  };
  const watch = () => { // every change of the aim, the pull or the tip: a move starts the 0.6 s again, and closes an open eye
    const o = tr.k.omen, h = hold.current; if (!o.armed) return;
    const { aim, power } = shot.get(), t = tip.get(), key = `${aim} ${t.x} ${t.y} ${t.elev}`;
    if (key === h.key && Math.abs(power - h.pull) < HELD) return;
    clearTimeout(h.timer); h.job++; h.key = key; h.pull = power;
    if (o.open) shutEye(); else if (power >= 0.05) h.timer = setTimeout(see, HOLD_MS);
  };
  // The Hindsight's Take back (tricks.ts). was = the table, the rules and the pay as they were at the player's last
  // strike (kept = that shot was a pot: it can be taken back until the next pull); stay = the ruling on a shot that
  // ended the turn, fouled or lost the rack, held while the card asks.
  const hind = vs && own === 'hindsight', stay = useRef<State | null>(null);
  const takeBack = () => {
    const w = tr.k.past.was, t = table.current; if (!w || moving.current || t.rec) return;
    tr.k.past = { left: 0, blind: true, was: null }; stay.current = null;
    t.B.splice(0, t.B.length, ...w.B); t.look.m = w.m; t.look.fx = [];
    Object.assign(t, { rules: { ...w.rules, call: -1, hand: false }, rec: null, push: false }); // the call is cleared, and ball in hand is not given again
    won.current = w.ledger; snooker.current = w.snooker; // the shot's pay and feat counts go back too
    tip.set(LEVEL); paint(); redraw(); snap();
    shot.set({ aim: Math.atan2(P.W / 2 - t.B[0].y, P.L / 2 - t.B[0].x), power: 0, fine: false, locked: shut() }); // lined up from nothing: the cue points at the centre spot, not at a ball
  };
  const letStand = () => { const n = stay.current; if (!n) return; stay.current = null; tr.k.past.was = null; apply.current(n); };
  // The Airbrake's Brake (tricks.ts): a tap on the table while the armed shot plays puts back the table of the frame
  // on screen, with the cue ball stopped dead, and play goes on from there.
  // shortcut: the frame on screen when the JS thread gets the tap, a frame or two after the finger landed; upgrade with the show times of the last frames from the UI thread.
  const air = vs && own === 'airbrake';
  const canBrake = () => air && !shut() && table.current.rules.phase === 'play' && (tr.k.brake.armed || tr.k.brake.left > 0);
  const brakeNow = () => {
    const k = tr.k.brake, t = table.current, f = t.rec ? brakeAt(k.frames, queue.value.length) : null; if (!k.live || !f) return;
    t.B.splice(0, t.B.length, ...f.B); t.look.m = f.m; t.look.fx = f.fx as typeof t.look.fx; t.rec = f.rec; k.live = false; k.frames = [];
    const c = t.B[0]; c.vx = c.vy = c.vz = c.wx = c.wy = c.wz = 0; // dead: no speed and no spin
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); moving.current = true; pace.current = null; // the frames made ahead are dropped: the next one starts the queue again
    scheduleOnUI(still, draw.current(), mark.current(), ...ringOf()); redraw(); wake.current();
  };
  // The Nonchalant's Whatever (tricks.ts): the player calls no pocket and has no guide; flukes = the paid flukes left this rack.
  const free = vs && own === 'nonchalant', mustCall = (s: State) => canCall(s) && !(free && s.turn === 0);
  const ram = vs && own === 'ram';
  const powerOf = (pull: number) => tr.power(pull, table.current.rules, tip.get().elev);
  const dark = (pull: number) => tr.dark(pull, table.current.rules, tip.get().elev); // no guide: the Nonchalant; the shot in place of one the Hindsight took back; the Ram's owed shot, and while its pull is past 100%
  const shotOf = (power: number): Shot => { const c = lining.current ? STICK : inPlay.current.cue; return { ang: shot.get().aim, speed: Math.max(0.05, powerOf(power) * (table.current.rules.phase === 'break' ? c.breakSpeed : c.maxSpeed)), ...shotTip(tip.get(), c) }; }; // the AI lines up with the House Cue
  // No shot can be made: balls move, the rules have not ruled on the last shot, a player has a decision to make, or the
  // rack is over. In a lesson: the shot plays itself, or the verdict card is up.
  const bot = () => vs && table.current.rules.turn === 1; // on the AI's turn nothing can be touched
  // The marks move while a called pocket settles. At rest they do not, and the ring round the cue ball in hand pulses on the UI thread.
  // Not under the pause card, which hides the table: the loop sleeps there.
  const beats = () => !map.current.calm && !held.current && performance.now() - called.current < SETTLE;
  const shut = () => { const t = table.current; return moving.current || !!t.rec || !!stay.current || !!t.rules.choice || t.rules.phase === 'over' || (!!L && (les.current.stage === 'watch' || !!les.current.said)) || bot(); };
  const watching = () => !!L && les.current.stage === 'watch' && !les.current.said && !moving.current && !table.current.rec; // the reference shot is lined up: its guide shows
  // Put a ruling on the table: a new rack, or the balls the rules spot and the cue ball in hand.
  const apply = useRef((s: State) => {});
  apply.current = (s: State) => {
    const t = table.current, hard = hustler(foe()), came = t.rules.turn === 1 && s.turn === 0; // came = the turn passes to the player
    if (vs && s.game === 8 && s.solids >= 0) { const down = (p: number) => 7 - s.balls.filter(id => id !== 8 && (id < 8) === (s.solids === p)).length; if (down(1) - down(0) >= 3) won.current.behind = true; } // Nine Lives: the opponent 3 balls or more ahead
    if (s.phase === 'over' && s.winner !== -1) { score.current[s.winner]++;
      if (vs) { rackOver(won.current, s.winner === 0, hard, ranOut(t.rules.turn, s)); if (game === 9 && race >= 3 && score.current[1] - score.current[0] >= 2) won.current.down = true; } // in 9-ball a comeback is 2 racks down in a race to 3 or 5
      if (score.current[s.winner] === race) {
      const pp = vs ? null : passPlayPay(dayKey(new Date()), s.early ? 'an early 8' : s.foul ? 'a foul' : ''); // the 8 down early, or the last shot a foul: three in a row, the 8 down or off the table on one
      const r = vs ? settle(won.current, { tier: rival || tour ? tenth(level.current) : ai + 1, won: s.winner === 0, early: s.winner === 1 && s.early, tour: tour && tour.stakes * race, racks: score.current[0] }, chalk) // only an early 8 pays nothing
        : { match: pp!.pay, shots: { xp: 0, coins: 0 }, chalk: null, total: pp!.pay, note: pp!.note };
      // A tournament saves the result, then pays it (with any prize) marked in the profile: tour.done.
      if (tour) { const p = tour.prize(s.winner === 0); prize.current = p && (p.xp || p.coins) ? p : null; }
      // The feats of the match and the streak are saved before the pay; a cue they gave shows on the results card.
      const got = vs ? featsDone(matchFeats(won.current, { vs: foe(), won: s.winner === 0, cue: own, dry: !!r.note, pure: pure.current }), hard && !r.note ? s.winner === 0 : undefined, won.current.aura) : [];
      end.current = got.length ? { ...r, got } : r; gained.current = tour ? tour.done(s.winner === 0, [...score.current], r.total, own) : award(r.total, vs ? own : undefined, pp?.mark); // quick match played the player's own cue
      // The loser's own balls left (8-ball; 7 on an open table) say how close the match was.
      if (rival) { const lose = 1 - s.winner, left = s.solids < 0 ? 7 : s.balls.filter(id => id !== 8 && (id < 8) === (s.solids === lose)).length, [a, b] = rivalDone(game, s.winner === 0, left, set.mood); moved.current = `Rival ${shown(a)} to ${shown(b)}`; }
    } }
    if (s.phase === 'break') { table.current = newTable(s); moving.current = false; safe.current = { row: 0, rack: 0 }; won.current.run = 0; clearTimeout(hold.current.timer); tr.rack(pick); }
    else { for (const id of s.spot) spotBall(t.B, t.ids.indexOf(id)); if (s.hand) handCue(t.B, s.hand); Object.assign(t, { rules: s, rec: null, push: false }); }
    if (came) tr.turn(pick);
    if (marble) setStats(mog(mogLead(s, tr.k.sunk))); // it changes the moment a shot is ruled on
    snooker.current = vs && came && s.phase === 'play' && !s.hand && hooked(table.current.B, table.current.ids, s); // judged at the start of a turn, not after a pot of your own, and not with ball in hand
    paint(); redraw();
    if (!(s.phase === 'over' && s.winner >= 0 && score.current[s.winner as 0 | 1] === race)) snap(); // the match end was saved by tour.done
    shot.set({ aim: nearest(table.current.B, shot.get().aim), power: 0, fine: false, locked: shut() }); // the cue points at the nearest ball and the controls unlock
  };


  useEffect(() => {
    let raf = 0, on = true; // on = the UI thread's frame callback runs. It stops between shots: it keeps the display at full rate
    live.current.setActive(true); // a short run at launch measures the display's refresh interval for the first shot
    const rest = () => setTimeout(() => { if (!on) live.current.setActive(false); }, 300);
    let timer = rest(); on = false;
    let was = performance.now();
    let dead = false, beat = false; // beat = the marks moved last turn: one more picture shows them at rest
    const tick = (t: number) => {
      raf = 0; if (dead) return;
      const { B, ids, look, rules: s, rec, push: pushOut } = table.current;
      if (stale.current) { // one guide a frame, however many touches came. While a shot can be made the guide and the cue stick are always there: for the pull on the rail, or for a firm shot without one
        stale.current = false; redo.current = true;
        const { power } = shot.get();
        const ai = lining.current, stat = ai ? GUIDE_AIM : S || vs ? inPlay.current.stats.aim : L ? 10 : GUIDE_AIM, trick = ai ? undefined : lines, sketched = !ai && pen; // the AI's line-up shows the House Cue's guide, no cue tricks
        if (!shut() || watching() || ai) guides.ask({ B, shot: shotOf(previewPower(power)), aim: stat, budget: trick === 'daybreak' ? DAY_WORK : trick === 'banker' || guideLen(stat) > 0.45 ? LONG_WORK : GUIDE_WORK, stick: ai ? STICK : struck(), real: watching() || sketched, scale: sketched ? guideScale(own) : 1, trick }, power > 0.05); // lessons use the full guide; watch shows the real path, as the shot plays next; so does the Surveyor, on a shorter guide
        else { guides.drop(); line.current = null; }
      }
      if (redo.current) { // the stick follows the finger every frame; the line is the newest guide there is, a few frames old when it came from the other thread
        const rec = Skia.PictureRecorder(), c = rec.beginRecording(), { aim, power } = shot.get(), g = line.current;
        if (!shut() || watching() || lining.current) {
          const bad = !!g && !L && !pushOut && g.first > 0 && !legalFirst(s, ids[g.first]); // the ghost meets a ball the rules do not allow first
          const coiled = vs && s.turn === 0 && own === 'coil' && tip.get().elev >= 4; // the Coil's price: with the cue raised the guide stops 20 cm from the cue ball
          if (g && !((S || vs) && les.current.guideOff && !lining.current) && !dark(power)) { peeked.current = true; if (coiled) drawAim(Skia, c, map.current, shorten(g.path, 0.2)); else {
              // The Optic's Range, for the speed the guide shows: a mark where the cue ball's roll would end before the first ball, and a ring of the first ball's reach. A ring wider than 2.5 m is a number by the ball.
              const ranged = optic && !lining.current, far = ranged && g.first > 0 && 2 * g.roll > 2.5;
              drawAim(Skia, c, map.current, g.path, g.ghost, g.lands, g.lost, g.ob, bad, g.stub, { fill: g.dead, gold: tr.k.omen.open && tr.k.omen.gold, ...(ranged && { mark: pointAt(g.path, rollOut(shotOf(previewPower(power)).speed)), ring: g.first > 0 && !far ? [B[g.first].x, B[g.first].y, g.roll] : null, note: far ? `${g.roll.toFixed(1)} m` : '', font: RAIL_FONT }) });
            } }
          if (!grab.current || grab.current === 'call') drawCue(Skia, c, map.current, B[0].x, B[0].y, aim, power, (S || vs) && !lining.current ? own : undefined); // no stick while a finger carries the cue ball in hand; the player's own cue where it counts, the plain stick for the AI and for matched games
        }
        guide.value = rec.finishRecordingAsPicture(); redo.current = false;
      }
      gap.current = Math.max(gap.current, t - was); was = t;
      const busy = () => moving.current || look.fx.length > 0; // effects (a ball falling into a pocket) outlive the last moving ball
      if (busy()) {
        let p = pace.current;
        const first = !p;
        if (!p) p = pace.current = newPace(frameOf(seen.value[4]));
        if (!on) { on = true; clearTimeout(timer); live.current.setActive(true); }
        for (let n = 0, ms; n < 4 && busy() && (ms = nextFrame(p, t)); n++) { // at most 4 frames a turn, so a late JS thread still answers touches
          const t0 = performance.now();
          moving.current = advance(B, look, ms, moving.current, rec ? ev => (L ? noteLesson(rec as LessonRec, ev, B, ids) : record(rec, ev, B, ids)) : undefined);
          if (tr.k.brake.live && rec) { const fr = tr.k.brake.frames; fr.push({ B: B.map(b => ({ ...b })), m: look.m.map(m => [...m]), fx: look.fx.map(f => ({ ...f })), rec: JSON.parse(JSON.stringify(rec)) }); if (fr.length > KEEP) fr.shift(); } // the Airbrake: a copy of the table for this frame
          scheduleOnUI(push, draw.current(), busy() ? p.frame : STILL, first && !n, first && !n ? mark.current() : null);
          const cost = performance.now() - t0; spent(p, cost); made.current[0]++; made.current[1] += cost;
        }
        if (!busy()) pace.current = null; // the last frame stays on screen: a shot struck before the next turn starts its frames again
      } else if (rec) { // the shot is over: when its last frame is on screen, the rules say what it was
        if (!queue.value.length && L) { table.current.rec = null; ended.current(rec as LessonRec); }
        else if (!queue.value.length) {
          let next = tr.rule(s, rec, pushOut);
          if (vs && s.turn === 0) {
            const p = potPay(s.phase === 'break' ? [] : candsFor(pre.current, ids, s), rec, s, next, won.current.run, foe(), inPlay.current.cue.tipLimit, pushOut ? undefined : won.current.aura, free ? tr.k.flukes : undefined, tr.k.omen.plain); // a push-out neither adds to the Aura's run nor ends it
            if (snooker.current && !pushOut && !next.foul && rec.first >= 0 && !tr.k.omen.plain) p.feats.push('escape'); // out of a snooker with a legal hit
            tr.k.omen.plain = false; // the Seer's price is paid on one shot
            noteShot(won.current, p, next.foul && next.phase !== 'over', s.phase === 'break' && next.phase === 'over' && next.winner === 0, hustler(foe()), next.phase === 'over' && next.winner === 1);
          } // a foul that ends the rack does not cost the clean-match bonus; a rack won on the break shot is counted (pay.ts settle)
          if (next.phase === 'over' || next.foul) Haptics.notificationAsync(next.winner < 0 ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success);
          tr.k.brake.live = false; tr.k.brake.frames = []; // the braked shot is over, tapped or not
          const ask = hind && s.turn === 0 && tr.k.past.was ? hindsight(next, 0) : 'no';
          if (ask === 'keep') tr.k.past.was!.kept = true; else if (ask === 'no') tr.k.past.was = null;
          if (ask === 'ask') { stay.current = next; table.current.rec = null; redraw(); } // the game stops and asks before the ruling goes on the table
          else apply.current(next);
        }
      } else {
        if (on) { on = false; pace.current = null; timer = rest(); }
        const b = beats(); if (b || beat) scheduleOnUI(setMarks, mark.current()); beat = b;
      }
      const n = table.current, pulse = beats() || beat; // the table now: a ruling may have racked a new one
      if ((stale.current || redo.current || moving.current || n.look.fx.length || n.rec || on || pulse) && !raf) raf = requestAnimationFrame(tick); // !raf: a wake inside this turn already asked for the next
    };
    wake.current = () => { if (!raf && !dead) { was = performance.now(); raf = requestAnimationFrame(tick); } };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); dead = true; clearTimeout(timer); }; // dead: a late wake does not start it again
  }, []);

  useEffect(() => {
    if (!hud) return;
    let was = seen.value, n = 0, cost = 0;
    const id = setInterval(() => { // twice a second
      const s = seen.value, [m, c] = made.current, k = m - n;
      setRates(`display ${Math.round(1000 / frameOf(s[4]))} Hz  shown ${2 * (s[1] - was[1])}/s  none ready ${2 * (s[2] - was[2])}/s  skipped ${2 * (s[3] - was[3])}/s\nmade ${2 * k}/s  ${k ? ((c - cost) / k).toFixed(1) : '-'} ms each${pace.current ? `  for ${Math.round(1000 / pace.current.frame)} Hz` : ''}\nguide ${took.current[0].toFixed(1)} ms ${took.current[1] ? 'off thread' : 'on JS'}  longest JS gap ${gap.current.toFixed(0)} ms`); gap.current = 0;
      was = s; n = m; cost = c;
    }, 500);
    return () => clearInterval(id);
  }, [hud]);

  // The rail calls this on release: the strike. The cue goes back to level and centre ball after every shot.
  // shortcut: no follow-through of the stick; the cue is off the table from the frame of the strike.
  const fire = (power: number) => {
    const t = table.current;
    if (shut() || (mustCall(t.rules) && t.rules.call < 0)) { shot.set({ power: 0 }); return; } // a pocket must be called first: the HUD asks for it
    if (tr.k.omen.open) power = tr.k.omen.pull; // the Seer's frozen shot: the power the eye saw
    shutEye();
    Haptics.impactAsync(powerOf(power) > 0.7 ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light);
    if (vs) pre.current = t.B.map(b => ({ ...b })); // the pay candidates are searched at the ruling, from this copy: 15 ms on the strike frame without JIT
    const sh = shotOf(power); snap(sh); opened();
    if (tr.k.brake.armed) { tr.k.brake = { left: 0, armed: false, live: true, frames: [] }; redraw(); } // used up at the strike, tapped or not
    if (hind) { const p = tr.k.past; p.was = p.left && t.rules.phase !== 'break' ? { B: t.B.map(b => ({ ...b })), m: t.look.m.map(m => [...m]), rules: t.rules, ledger: JSON.parse(JSON.stringify(won.current)), snooker: snooker.current, kept: false } : null; p.blind = false; }
    if (!les.current.guideOff) pure.current = false;
    tr.strike(power, t.rules, pick, powerOf(power)); if (ram) ramOwed(tr.k.owed);
    t.rec = L ? newLessonRec() : newRec(sh); strike(t.B[0], sh, struck()); moving.current = true; wake.current();
    tip.set(LEVEL); setSheet(false); setTools(false); shot.set({ power: 0, fine: false, locked: true });
  };
  // The AI's shot: its cue ball in hand, its line-up, its call, then the strike as fire() makes it. The AI strikes with
  // the House Cue (STICK), its speed and tip held to that cue; the Masters plans inside those limits (aim.ts lim), the
  // other tiers on the engine CUE.
  // stage: 0 slides the cue ball in hand, 1 places it and lines up, 2 strikes.
  const play = (m: Move, stage = 0) => {
    const t = table.current;
    if (moving.current || t.rec || t.rules.phase === 'over' || !bot()) { aiCall.current = -1; return; } // no stale call ring if the turn went
    if (!stage && m.call >= 0) { aiCall.current = m.call; called.current = performance.now(); paint(false); wake.current(); } // the call shows from the AI's first move; its ring settles as the player's does
    if (!stage && m.at) { carry(m.at, () => play(m, 1)); return; }
    const top = t.rules.phase === 'break' ? STICK.breakSpeed : STICK.maxSpeed, hold = (x: number) => Math.max(-STICK.tipLimit, Math.min(STICK.tipLimit, x));
    if (stage < 2) {
      if (m.at) moveCue(t.B, m.at[0], m.at[1], t.rules.hand);
      lineUp(m.shot, top, hold, () => play(m, 2)); return;
    }
    if (m.call >= 0) t.rules = setCall(t.rules, m.call); // into the rules at the strike: a new ruling now would start the AI's turn again
    safe.current = nextSafeties(safe.current, m.safety);
    const sh = { ...m.shot, speed: Math.min(m.shot.speed, top), a: hold(m.shot.a), b: hold(m.shot.b) }; snap(sh); opened();
    t.rec = newRec(sh); strike(t.B[0], sh, STICK); moving.current = true; paint(); redraw();
  };
  // A tournament match reopened with a shot in flight: the same shot again from the same table.
  useEffect(() => {
    const t = table.current, sh = snap0?.shot;
    if (!sh) return;
    if (t.rules.turn === 0) pre.current = t.B.map(b => ({ ...b }));
    t.rec = newRec(sh); strike(t.B[0], sh, t.rules.turn === 0 ? struck() : STICK); moving.current = true; shot.set({ power: 0, locked: true }); paint(); redraw();
  }, []);
  // The AI's moves on the table play out over time: tween runs f(eased 0..1) each frame for ms, rests, then done().
  // drop() ends a tween the turn left (a pause, a new ruling, leaving the match) and runs its undo.
  const drop = useRef(() => {});
  const tween = (ms: number, f: (e: number) => void, rest: number, done: () => void, undo: () => void) => {
    const t0 = performance.now(); let raf = 0, wait: ReturnType<typeof setTimeout> | undefined;
    const step = (now: number) => {
      const k = ms > 0 ? Math.min(1, (now - t0) / ms) : 1; f(k < 0.5 ? 2 * k * k : 1 - (2 - 2 * k) ** 2 / 2); // ease in and out
      if (k < 1) raf = requestAnimationFrame(step); else wait = setTimeout(() => { drop.current = () => {}; done(); }, rest);
    };
    drop.current = () => { cancelAnimationFrame(raf); clearTimeout(wait); drop.current = () => {}; undo(); };
    raf = requestAnimationFrame(step);
  };
  // The AI's cue ball in hand slides to its spot, longer for a longer way. Lifted over the balls on the way: only the end
  // spot must be legal. Dropped, the ball goes back.
  const carry = ([x, y]: [number, number], done: () => void) => {
    const c = table.current.B[0], x0 = c.x, y0 = c.y;
    tween(Math.min(900, 350 + 400 * Math.hypot(x - x0, y - y0)), e => {
      c.x = x0 + (x - x0) * e; c.y = y0 + (y - y0) * e;
      paint(false); // the tick's pulse redraws the marks only, not the balls
    }, 250, done, () => { c.x = x0; c.y = y0; aiCall.current = -1; paint(false); });
  };
  // The AI lines up on the controls as a player would: the stick turns to its aim while the tip dot moves to its spin,
  // then the rail pulls to its power. lining = draw the stick though the controls are shut.
  const lining = useRef(false), aiCall = useRef(-1); // aiCall = the AI's pocket, shown from its first move; the rules get it at the strike
  const lineUp = (m: Shot, top: number, hold: (x: number) => number, done: () => void) => {
    const a0 = shot.get().aim, turn = ((m.ang - a0) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI; // the short way round
    const x = hold(m.a) / STICK.tipLimit, y = hold(m.b) / STICK.tipLimit, elev = Math.round((m.elev ?? 0) * 180 / Math.PI), p = Math.min(1, m.speed / top);
    const quick = map.current.calm ? 0 : 1, undo = () => { lining.current = false; aiCall.current = -1; paint(false); tip.set(LEVEL); shot.set({ power: 0, shown: false }); };
    lining.current = true; shot.set({ shown: true });
    tween(500 * quick, e => { shot.set({ aim: a0 + turn * e }); tip.set({ x: x * e, y: y * e, elev: Math.round(elev * e) }); }, 150, () =>
      tween((250 + 350 * p) * quick, e => shot.set({ power: p * e }), 250, () => { undo(); done(); }, undo), undo);
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
      // A pause or a ruling-free remount of this effect reuses the think already asked for this table: the runtime runs
      // one think at a time and cannot cancel, so asking again would queue a second full think behind it.
      if (asked.current?.rules !== s) {
        const args: Parameters<typeof thinkAsync> = [t.B, t.ids, s, level.current, seed.current++, safetiesArg(safe.current), tour?.style];
        asked.current = { rules: s, args, p: thinkAsync(...args) };
      }
      const { args, p } = asked.current;
      p.then(m => then(() => play(m)), e => { // the runtime failed: think on the JS thread rather than stall the match
        if (__DEV__) console.warn('AI think failed off the JS thread', e);
        then(() => {
          let m: Move;
          try { m = think(args[0].map(b => ({ ...b })), [...args[1]], s, args[3], args[4], args[5], args[6]); }
          catch (e2) { if (__DEV__) console.warn('AI think failed', e2); m = softMove(t.B, t.ids, s); }
          play(m);
        });
      });
    }
    return () => { live = false; clearTimeout(wait); setThinking(false); drop.current(); };
  }, [rules, paused]);
  // Where the finger is about the cue ball: its angle in the table frame and its distance on the screen.
  const finger = (px: number, py: number) => { const p = toTable(map.current, px, py), c = table.current.B[0]; return { ang: Math.atan2(p.y - c.y, p.x - c.x), lever: Math.hypot(p.x - c.x, p.y - c.y) * map.current.s }; };
  const touch = useRef<{ t: number; moved: boolean; ang: number; lever: number } | null>(null);
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: e => { // a touch that misses a control must not turn the aim
      const on = onTable(map.current, e.nativeEvent.pageX, e.nativeEvent.pageY);
      if (on && tr.k.brake.live) { brakeNow(); return false; } // the Airbrake's tap: it stops the cue ball and aims nothing
      return !shut() && on;
    },
    onPanResponderGrant: (_, g) => { // a touch by the cue ball in hand drags it, a touch on a pocket calls it, any other aims
      const t = table.current, s = t.rules, v = map.current, p = toTable(v, g.x0, g.y0), c = t.B[0], at = toScreen(v, c.x, c.y);
      const k = mustCall(s) ? HOLES.findIndex(h => Math.hypot(h[0] - p.x, h[1] - p.y) < 0.1) : -1;
      grab.current = s.hand && Math.hypot(at.x - g.x0, at.y - g.y0) < GRAB ? { x: c.x - p.x, y: c.y - p.y } : k >= 0 ? 'call' : null;
      if (grab.current && grab.current !== 'call') dirty(); // the stick goes as the finger takes the ball
      if (k >= 0 && grab.current === 'call') { if (k !== s.call) called.current = performance.now(); shutEye(); t.rules = setCall(s, k === s.call ? -1 : k); Haptics.selectionAsync(); paint(); redraw(); }
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
      const d = touch.current, s = shot.get(); if (grab.current) dirty(); touch.current = grab.current = null; // a carried cue ball gets its stick back
      if (!d || d.moved || Date.now() - d.t >= TAP_MS || d.lever < P.R * map.current.s) return; // a tap on the cue ball itself points nowhere
      const aim = tapAim(s.aim, s.fine, d.ang); if (aim !== s.aim) { shot.set({ aim }); Haptics.selectionAsync(); }
    },
    onPanResponderTerminate: () => { if (grab.current) dirty(); touch.current = grab.current = null; },
  })).current;

  // A lesson: the table is set again for every shot, and in solo it is a new table each shot. Guided sets the reference
  // spin; watch lines up the reference shot and plays it after a moment.
  const reset = (to: Stage) => {
    peeked.current = false;
    const was = les.current.stage; // a try on the same table keeps the aim of the last try; after watch or on a new table it starts fresh
    const prev = at.current; at.current = to === 'solo' && !S ? soloTable(L!, prev) : L!;
    table.current = newLesson(at.current); moving.current = false; setSaid(null); les.current = { ...les.current, stage: to, said: null }; setStage(to);
    tip.set(to === 'solo' ? LEVEL : L!.ref.tip);
    shot.set(to === 'watch' ? { aim: L!.ref.ang, power: L!.ref.power, fine: false, locked: true } : { aim: was === 'watch' || at.current !== prev ? nearest(table.current.B) : shot.get().aim, power: 0, fine: false, locked: false });
    paint(); redraw();
  };
  useEffect(() => { if (L) reset(S ? 'solo' : 'watch'); }, []);
  useEffect(() => {
    if (!L || stage !== 'watch' || said || paused) return;
    const id = setTimeout(() => { const t = table.current; t.rec = newLessonRec(); strike(t.B[0], { ang: L.ref.ang, speed: L.ref.power * CUE.maxSpeed, ...shotTip(L.ref.tip) }); tip.set(LEVEL); moving.current = true; wake.current(); shot.set({ power: 0 }); }, 1200);
    return () => clearTimeout(id);
  }, [stage, said, paused]);
  const ended = useRef((r: LessonRec) => {});
  ended.current = r => {
    const v = verdict(at.current!, r, table.current.B[0]), { stage: st, run: k } = les.current;
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
  const paid = done ? end.current : null;
  const trick = tr.line(rules, won.current, hustler(foe())); // the state of the cue's trick, after the player's name on the HUD
  const rerack = (breaker = over ? 1 - rules.breaker : rules.breaker) => {
    if (done) { score.current = [0, 0]; if (rival) { level.current = profile().rival[game].rating; moved.current = ''; } won.current = newLedger(); end.current = null; pure.current = true; }
    apply.current(newGame(game, breaker as 0 | 1, callAll, bankRule, Math.floor(Math.random() * 2 ** 31)));
  };

  const cardAt = !view.land && { right: width - lay.rail.left, padding: 8 }; // portrait: a card over the table sits at the middle of the table, clear of the rail
  const card = !!(L && said) || !!rules.choice || !!stay.current || over || paused; // a card or the results are up: the tip sheet closes, as it would lie over them
  useEffect(() => { if (card) setSheet(false); }, [card]);
  return (
    <View style={styles.root} {...pan.panHandlers}>
      {/* The table has its own canvas: it is most of the drawing work and it does not change during play. */}
      <Canvas style={StyleSheet.absoluteFill}>
        <Picture picture={felt} />
      </Canvas>
      <Canvas style={StyleSheet.absoluteFill}>
        <Picture picture={guide} />
        <Picture picture={marks} />
        <Circle cx={ringX} cy={ringY} r={ringR} color={C.accent} style="stroke" strokeWidth={ringW} opacity={ringO} />
        <Picture picture={picture} />
      </Canvas>
      {hud && <Text pointerEvents="none" style={[styles.rates, { top: pad.top + HUD, left: pad.left + 8 }]}>{rates}</Text>}
      {L && <LessonHud pause={<Btn label="II" name="Pause" onPress={() => { setPaused(true); setSheet(false); }} />} lesson={L} n={n} stage={stage} run={run} land={view.land} pad={pad} head={S && `${S.title} · par ${par(S)}`} line={S && `Try ${tries}${guideOff ? ' · guide off' : ''}`}>
        {S && <Btn label={guideOff ? 'Guide off' : 'Guide on'} name="Aim guide" on={!guideOff} onPress={() => { setGuideOff(!guideOff); les.current.guideOff = !guideOff; dirty(); }} />}
      </LessonHud>}
      {/* The player plates, the 9-ball strip and the banner with the last ruling (src/ui/MatchHud.tsx). */}
      {!L && <MatchHud style={tour?.style} trick={trick} free={free} rules={rules} names={names} push={table.current.push} view={view} pad={pad} calm={calm} wait={bot() && !over ? (thinking ? `${names[1]} is thinking…` : '') : undefined} score={race > 1 ? score.current : undefined}
        pause={<Btn label="II" name="Pause" onPress={() => { setPaused(true); setTools(false); setSheet(false); }} />}>
        {rules.push && !rules.choice && !(vs && rules.turn === 1) && <Btn label={table.current.push ? 'Push out: on' : 'Push out'} onPress={() => { if (!table.current.rec) { table.current.push = !table.current.push; redraw(); } }} />}
      </MatchHud>}
      {/* A lesson's verdict on the last shot, and where to go from it. */}
      {L && said && !paused && (
        <View style={[styles.sheet, cardAt]} pointerEvents="box-none">
          <View style={styles.card} accessibilityViewIsModal>
            <Text maxFontSizeMultiplier={1.3} accessibilityRole="header" style={styles.cardTitle}>{said.title}</Text>
            <Text maxFontSizeMultiplier={1.3} style={[styles.cardNote, said.say.startsWith('+') && styles.pay]}>{said.say}</Text>
            {S ? said.ok ? <>{onNext && <Act paint={CREAM} label="Next scenario" onPress={onNext} />}<Act paint={onNext ? undefined : CREAM} label="Play again" onPress={() => { setTries(1); les.current.tries = 1; reset('solo'); }} /><Act label={`Back to ${back}`} onPress={onQuit} /></>
              : <Act paint={CREAM} label="Retry" onPress={() => reset('solo')} />
              : stage === 'watch' ? <><Act paint={CREAM} label="Try it" onPress={() => reset('guided')} /><Act label="Watch again" onPress={() => reset('watch')} /></>
              : run >= SOLO_RUN ? <>{onNext && n + 1 < LESSONS.length && <Act paint={CREAM} label="Next lesson" onPress={onNext} />}<Act label="Back to Learn" onPress={onQuit} /></>
              : stage === 'guided' ? <>{said.ok && <Act paint={CREAM} label="Next: solo" onPress={() => { setRun(0); reset('solo'); }} />}<Act paint={said.ok ? undefined : CREAM} label={said.ok ? 'Again' : 'Retry'} onPress={() => reset('guided')} /><Act label="Watch again" onPress={() => reset('watch')} /></>
              : <Act paint={CREAM} label={said.ok ? 'Next shot' : 'Retry'} onPress={() => reset('solo')} />}
          </View>
        </View>
      )}
      {/* The Hindsight's question, before the ruling on the shot goes on the table. */}
      {stay.current && !paused && (
        <View style={[styles.sheet, cardAt]} pointerEvents="box-none">
          <View style={styles.card} accessibilityViewIsModal>
            <Text maxFontSizeMultiplier={1.3} accessibilityRole="header" style={styles.cardTitle}>Take it back?</Text>
            <Text maxFontSizeMultiplier={1.3} style={styles.cardNote}>{`${stay.current.note || 'No pot: your turn ends.'}\nOnce a rack. The shot in its place has no guide.`}</Text>
            <Act paint={CREAM} label="Take it back" onPress={takeBack} />
            <Act label="Let it stand" onPress={letStand} />
          </View>
        </View>
      )}
      {/* A decision the rules hand to a player: a card over the table, and play waits for it. */}
      {rules.choice && !paused && !(vs && rules.turn === 1) && (
        <View style={[styles.sheet, cardAt]} pointerEvents="box-none">
          <View style={styles.card} accessibilityViewIsModal>
            <Text maxFontSizeMultiplier={1.3} accessibilityRole="header" style={styles.cardTitle}>{`${names[rules.turn]}, your call`}</Text>
            {!!rules.note && <Text maxFontSizeMultiplier={1.3} style={styles.cardNote}>{rules.note}</Text>}
            {rules.choice.map((o, i) => <Act key={o.label} label={o.label} onPress={() => apply.current(choose(rules, i))} />)}
          </View>
        </View>
      )}
      {/* The shot controls sit inside the safe area where shotLayout puts them. */}
      <PowerRail store={shot} box={lay.rail} onStrike={fire} wait={!bot() && mustCall(rules) && rules.call < 0} {...tr.rail(powerOf, () => table.current.rules.turn)} {...(optic && { note: (pull: number) => `${rollOut(shotOf(pull).speed).toFixed(1)} m` })} />
      <AimDial store={shot} box={lay.dial} />
      {!(L && stage === 'watch') && <View style={[styles.at, lay.spin]}><TipButton store={tip} land={view.land} onPress={() => { setSheet(!sheet); setTools(false); }} /></View>}
      {maxxed && <View style={[styles.at, lay.tools]}><Btn label={`${pick[0].toUpperCase()}${pick.slice(1)}\n${plain('maxxed') ? '10' : 'maxxing'}`} name={`Statmaxxing: ${pick} is 10. Pick another stat`} off={!canPick()} onPress={repick} /></View>}
      {seer && <View style={[styles.at, lay.tools]}><Btn label={tr.k.omen.open ? (tr.k.omen.gold ? 'Eye\ngold' : 'Eye\nopen') : tr.k.omen.armed ? 'Eye\narmed' : 'Eye'} name={tr.k.omen.open ? (tr.k.omen.gold ? 'Omen: the eye is open. This shot pots' : 'Omen: the eye is open. No pot on this shot') : tr.k.omen.armed ? 'Omen: armed. Hold the pull still' : 'Omen: arm the eye'} on={tr.k.omen.armed || tr.k.omen.open} off={!tr.k.omen.armed && !tr.k.omen.open && (!tr.k.omen.left || !canSee())}
        onPress={() => { const o = tr.k.omen; if (o.armed || o.open) shutEye(); else if (o.left && canSee()) { o.armed = true; hold.current.key = ''; redraw(); } }} /></View>}
      {hind && <View style={[styles.at, lay.tools]}><Btn label={'Take\nback'} name="Take back: take your last shot back" off={!tr.k.past.was?.kept || shut()} onPress={takeBack} /></View>}
      {air && <View style={[styles.at, lay.tools]}><Btn label={tr.k.brake.armed ? 'Brake\narmed' : 'Brake'} name={tr.k.brake.armed ? 'Brake: armed. Tap to take it off' : 'Brake: arm it for this shot'} on={tr.k.brake.armed} off={!canBrake()} onPress={() => { if (!canBrake()) return; tr.k.brake.armed = !tr.k.brake.armed; redraw(); dirty(); }} /></View>}
      {!L && !vs && <View style={[styles.at, lay.tools]}><Btn label="•••" name="Table tools" onPress={() => { setTools(!tools); setSheet(false); }} /></View>}
      {/* shortcut: the test buttons (Rack, Demo), behind one button. Not in quick match: a new rack would dodge a loss and a demo pot would pay. */}
      {tools && (
        <View onStartShouldSetResponder={() => true} style={[styles.tools, view.land ? { left: lay.tools.left + lay.tools.width + 12, bottom: height - lay.tools.top - lay.tools.height } : { left: lay.tools.left, bottom: height - lay.spin.top + 8 }]}>
          <Btn label="Rack" onPress={() => rerack()} onLongPress={__DEV__ ? () => setHud(!hud) : undefined} />
          <Btn label={'Demo\n' + DEMOS[demo][0]} onPress={() => { // a fresh rack, and the demo shot is its break (AI think time: npm run bench:ai)
            rerack(); const t = table.current; t.B[0].y = P.W / 2; // the demo shots go straight down the middle
            t.rec = newRec(); strike(t.B[0], { ang: 0, speed: 1, a: 0, b: 0, ...DEMOS[demo][1] });
            paint(); moving.current = true; shot.set({ power: 0, locked: true }); setDemo((demo + 1) % DEMOS.length);
          }} />
        </View>
      )}
      {/* The tip and cue angle sheet, at the centre of the window. A touch outside it closes it and does nothing else; the rail still shoots. */}
      {sheet && !card && <TipSheet store={tip} land={view.land} keep={width - lay.rail.left} calm={calm} felt={CLOTHS[cloth].felt} blend={set.zones} low={vs && own === 'star' ? LOW_TIP : 1} onDone={() => setSheet(false)} />}
      {/* The end of the rack: the frame score in a race, the pay at the end of the match. Over the controls, which wait. */}
      {over && !paused && (
        <Results rules={rules} kind={tour ? `Tournament · ${tour.round}` : vs ? 'Quick match' : undefined} title={tour && done ? (win ? 'Knocked out' : tour.next ? `Through to the ${tour.next.toLowerCase()}` : 'Champion') : `${names[win]} wins${race > 1 ? done ? ' the match' : ' the frame' : ''}`} gold={!vs || win === 0}
          score={race > 1 ? score.current : undefined} names={names} foot={done ? moved.current : ''}>
          {!done && <Text maxFontSizeMultiplier={1.3} style={[styles.cardNote, styles.left]}>{`${names[1 - rules.breaker]} breaks`}</Text>}
          {paid && <PayRow label={!vs ? 'Pass and play' : win === 0 ? 'Match win' : 'Match'} xp={paid.match.xp} coins={paid.match.coins} twice={!!paid.chalk} />}
          {paid && vs && <PayRow label="Shots" xp={paid.shots.xp} coins={paid.shots.coins} />}
          {!!paid?.note && <Text maxFontSizeMultiplier={1.3} style={[styles.cardNote, styles.left]}>{paid.note}</Text>}
          {!!paid?.why && <Text maxFontSizeMultiplier={1.3} style={[styles.cardNote, styles.left]}>{paid.why}</Text>}
          {!!paid?.got && <Text maxFontSizeMultiplier={1.3} style={[styles.cardNote, styles.left]}>{`New cue: ${paid.got.join(', ')}`}</Text>}
          {paid && prize.current && <PayRow label="Prize" xp={prize.current.xp} coins={prize.current.coins} />}
          {paid && <PayTotal xp={paid.total.xp + (prize.current?.xp ?? 0)} coins={paid.total.coins + (prize.current?.coins ?? 0)} />}
          {done && gained.current && <Gained {...gained.current} />}
          {done && tour && !gained.current && !!paid?.total.xp && <Text maxFontSizeMultiplier={1.3} style={[styles.cardNote, styles.left]}>Not saved yet: this pay comes at the next launch.</Text>}
          {done && !!gained.current?.mastery && <Text maxFontSizeMultiplier={1.3} style={[styles.cardNote, styles.left]}>{gained.current.mastery}</Text>}
          <View style={styles.acts}>
            {tour && done ? <Act paint={CREAM} label="Bracket" onPress={onQuit} /> : <>
              <Act paint={CREAM} label={done ? 'Rematch' : 'Next rack'} onPress={() => rerack()} />
              {done && (CLIP ? <Act paint={DARK} label="Get the full game" onPress={fullGame} /> : <Act paint={DARK} label="Menu" onPress={onQuit} />)}
            </>}
          </View>
        </Results>
      )}
      {/* Paused: drawn last, so the card and its ground take every touch and no control or aim works behind them. Leaving ends the match. */}
      {paused && (
        <View style={[styles.sheet, styles.dim]} onStartShouldSetResponder={() => true}>
          <View style={styles.card} accessibilityViewIsModal>
            <Text maxFontSizeMultiplier={1.3} accessibilityRole="header" style={styles.cardTitle}>Paused</Text>
            {!L && (race > 1 || tour) && (
              <Text maxFontSizeMultiplier={1.3} style={styles.cardNote}>
                {[tour && `${tour.round} · pays ×${tour.stakes}`, race > 1 && `${names[0]} – ${names[1]}\n${score.current[0]} – ${score.current[1]}\nRace to ${race}`].filter(Boolean).join('\n')}
              </Text>
            )}
            <Act paint={CREAM} label="Resume" onPress={() => { setPaused(false); setSure(false); }} />
            {vs && !done && <Act label={guideOff ? 'Aim guide: off' : 'Aim guide: on'} onPress={() => { setGuideOff(!guideOff); les.current.guideOff = !guideOff; dirty(); }} />}{/* Purist asks for it off all match */}
            {tour && !done ? <>
              <Act label="Save and leave" onPress={onQuit} />{/* every strike and ruling is saved: Play on the bracket picks the match up */}
              <Act paint={sure ? [C.warn, '#A33A30'] : undefined} label={sure ? 'Forfeit: a loss, shots still pay. Tap again' : 'Forfeit match'} onPress={() => { if (!sure) return setSure(true); if (hustler(foe())) featsDone({}, false); tour.forfeit([...score.current]); onQuit(); }} />{/* a forfeit ends the Unbeaten streak, as a loss does */}
            </>
              : CLIP ? <Act label="Get the full game" onPress={fullGame} />
              : <Act label={tour ? 'Bracket' : S ? 'Leave scenario' : L ? 'Leave lesson' : 'Leave match'} onPress={() => { if (vs && !tour) matchLeft(); onQuit(); }} />}
          </View>
        </View>
      )}
    </View>
  );
}

// The player's level after the award, on one line (levelNote): yellow for a level-up, like the pay.
function Gained(g: ReturnType<typeof award>) {
  return <Text maxFontSizeMultiplier={1.3} style={[styles.cardNote, styles.left, g.to > g.from && styles.pay]}>{levelNote(g)}</Text>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.ground },
  at: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  // Cards and the tools tray are dark slabs: the lip is a solid bottom edge of the lip colour, not an outline.
  tools: { position: 'absolute', flexDirection: 'row', gap: 8, padding: 8, backgroundColor: DARK[0], borderBottomWidth: 5, borderColor: DARK[1], borderRadius: 5 },
  sheet: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: 300, maxWidth: '100%', alignSelf: 'center', padding: 16, gap: 12, borderRadius: 5, backgroundColor: DARK[0], borderBottomWidth: 5, borderColor: DARK[1] },
  cardTitle: { color: C.chalk, fontFamily: FONT.display, fontSize: 24, lineHeight: 28, textAlign: 'center' },
  cardNote: { color: C.chalk, fontFamily: FONT.semi, fontSize: 14, lineHeight: 19, textAlign: 'center' },
  dim: { backgroundColor: C.menu + 'B3' },
  pay: { color: BALLS[0], fontFamily: FONT.bold }, // one-ball yellow is for coins and XP
  left: { textAlign: 'left' },
  acts: { flexDirection: 'row', gap: 8, marginTop: 4 },
  rates: { position: 'absolute', color: C.chalk, fontSize: 10, lineHeight: 13, fontVariant: ['tabular-nums'] },
});
