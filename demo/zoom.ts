// A desktop window is far bigger than a phone, so at 1:1 the controls and the HUD look like a phone's in a sea of table
// (Jack, 2026-11-24). The page is zoomed so the match is laid out at most a big phone in landscape (932 x 430 pt) and
// drawn larger: every control and card keeps its phone proportion. A phone (or anything smaller) stays at 1.
// CSS zoom makes element rects and pointer positions come in window pixels while layout runs in zoomed pixels, so both
// are divided back here, and the viewport and pixel ratio react-native-web and Skia read are scaled to match.
// shortcut: patches browser prototypes for the whole page, fine for this one-screen demo, never for the app.
export const zoomOf = (w: number, h: number) => Math.max(1, Math.min(Math.max(w, h) / 932, Math.min(w, h) / 430));

export function zoomPage() {
  const vv = window.visualViewport, dpr = window.devicePixelRatio || 1;
  const z = () => zoomOf(window.innerWidth, window.innerHeight);
  const apply = () => { document.documentElement.style.setProperty('zoom', String(z())); };
  apply();
  window.addEventListener('resize', apply);
  // react-native-web reads the window size from visualViewport (width x scale); its resize listener stays on the real one.
  if (vv) Object.defineProperty(window, 'visualViewport', { configurable: true, value: {
    get width() { return vv.width / z(); }, get height() { return vv.height / z(); }, get scale() { return vv.scale; },
    addEventListener: vv.addEventListener.bind(vv), removeEventListener: vv.removeEventListener.bind(vv) } });
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, get: () => dpr * z() }); // Skia sizes its canvas by it
  const scale = (proto: object, keys: string[]) => { for (const k of keys) {
    const get = Object.getOwnPropertyDescriptor(proto, k)?.get;
    if (get) Object.defineProperty(proto, k, { configurable: true, get() { return get.call(this) / z(); } });
  } };
  scale(MouseEvent.prototype, ['clientX', 'clientY', 'pageX', 'pageY']);
  if (typeof Touch !== 'undefined') scale(Touch.prototype, ['clientX', 'clientY', 'pageX', 'pageY']);
  const rect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () { const r = rect.call(this), k = z(); return new DOMRect(r.x / k, r.y / k, r.width / k, r.height / k); };
  vv?.dispatchEvent(new Event('resize')); // in case anything read the window size before the patch
}
