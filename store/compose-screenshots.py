# Compose App Store screenshots from raw captures of the web build (store/capture/run.sh makes the captures and calls this).
# Usage: python3 store/compose-screenshots.py <raw-dir> <out-dir>
# <raw-dir> holds <size>/<slide>.png captured at 3x: 69 = 440x956 pt (1320x2868), 63 = 402x874 pt (1206x2622).
import sys
from PIL import Image, ImageDraw, ImageFont

F = 'node_modules/@expo-google-fonts/'
HEAD = F + 'bricolage-grotesque/800ExtraBold/BricolageGrotesque_800ExtraBold.ttf'
SUB = F + 'instrument-sans/600SemiBold/InstrumentSans_600SemiBold.ttf'
BAR = F + 'instrument-sans/700Bold/InstrumentSans_700Bold.ttf'
SIZES = {'69': (1320, 2868), '63': (1206, 2622)}
INK, CHALK = (22, 25, 26), (238, 242, 234)
# slide, headline lines, subline, background, text colour (the game's tile colours)
SLIDES = [
    ('play', ['Real pool.', 'No ads.'], '8-ball and 9-ball. Banks and cuts play true.', (239, 230, 210), INK),
    ('cues', ['26 wild', 'cues.'], 'Every one earned by playing, none sold.', (63, 191, 127), INK),
    ('spin', ['Bend the', 'cue ball.'], 'Massé and full spin control.', (132, 72, 200), CHALK),
    ('tour', ['Win the', 'cup.'], 'Four cups. Rivals with a game of their own.', (224, 72, 60), CHALK),
    ('learn', ['Learn every', 'shot.'], '13 lessons and 108 scenarios to master.', (75, 152, 238), INK),
    ('home', ['Pay once,', 'own it all.'], 'Six AI levels. Daily table. Works offline.', (244, 196, 48), INK),
]


def fit(path, text, size, width):
    while ImageFont.truetype(path, size).getlength(text) > width:
        size -= 2
    return ImageFont.truetype(path, size)


def status_bar(im, k):
    # iOS status bar in the top safe area (62 pt): time left, signal and battery right.
    d = ImageDraw.Draw(im)
    f = ImageFont.truetype(BAR, int(17 * k))
    d.text((int(56 * k), int(31 * k)), '9:41', font=f, fill=CHALK, anchor='mm')
    w = im.width
    x0, y0 = w - int(40 * k), int(31 * k)  # battery
    d.rounded_rectangle((x0 - 26 * k, y0 - 6.5 * k, x0, y0 + 6.5 * k), radius=4 * k, outline=CHALK, width=max(2, int(1.2 * k)))
    d.rounded_rectangle((x0 - 24 * k, y0 - 4.5 * k, x0 - 4 * k, y0 + 4.5 * k), radius=2.5 * k, fill=CHALK)
    d.rounded_rectangle((x0 + 1.5 * k, y0 - 2.5 * k, x0 + 3 * k, y0 + 2.5 * k), radius=1 * k, fill=CHALK)
    for i in range(4):  # signal bars
        bx = w - int(108 * k) + i * int(5.5 * k)
        d.rounded_rectangle((bx, y0 + 5 * k - (4 + 2.6 * i) * k, bx + 3.4 * k, y0 + 5 * k), radius=1 * k, fill=CHALK)


def slide(raw, out, size, n, name, lines, sub, bg, fg):
    W, H = SIZES[size]
    k = W / 440  # px per pt at the 6.9" size; the layout scales with width
    c = Image.new('RGB', (W, H), bg)
    d = ImageDraw.Draw(c)
    y = int(72 * k)
    hs = min(fit(HEAD, l, int(66 * k), W - int(56 * k)).size for sl in SLIDES for l in sl[1])  # one size on every slide
    hf = ImageFont.truetype(HEAD, hs)
    sf = ImageFont.truetype(SUB, min(fit(SUB, sl[2], int(19.5 * k), W - int(64 * k)).size for sl in SLIDES))  # one subline size too
    top = y + 2 * int(66 * k * 0.98) + int(14 * k) + int(19.5 * k) + int(34 * k)  # the phone sits at the same height on every slide
    y += (2 - len(lines)) * int(hs * 0.98) // 2  # a one-line headline sits in the middle of the two-line space
    for l in lines:
        d.text((W / 2, y + int(hs * 0.78)), l, font=hf, fill=fg, anchor='ms')  # on the baseline: lines without ascenders sit level
        y += int(hs * 0.98)
    d.text((W / 2, y + int(14 * k) + int(sf.size * 0.8)), sub, font=sf, fill=fg, anchor='ms')
    # the phone: the whole screen with a status bar, a black bezel and rounded corners, under the words
    shot = Image.open(f'{raw}/{size}/{name}.png').convert('RGB')
    status_bar(shot, shot.width / (W / 3))
    bez = int(9 * k)
    sc = (H - top - bez - int(30 * k)) / H
    w, h = int(W * sc), int(H * sc)
    shot = shot.resize((w, h), Image.LANCZOS)
    x = (W - w) // 2
    frame = Image.new('L', (w + 2 * bez, h + 2 * bez), 0)
    ImageDraw.Draw(frame).rounded_rectangle((0, 0, w + 2 * bez - 1, h + 2 * bez - 1), int(62 * k * sc), fill=255)
    c.paste((8, 10, 10), (x - bez, top - bez), frame)
    m = Image.new('L', (w, h), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w - 1, h - 1), int(55 * k * sc), fill=255)
    c.paste(shot, (x, top), m)
    c.save(f'{out}/{n:02d}-{name}.png', optimize=True)
    assert c.size == (W, H) and c.mode == 'RGB'
    return c


if __name__ == '__main__':
    raw, out = sys.argv[1], sys.argv[2]
    for size in SIZES:
        import os
        os.makedirs(f'{out}/{size}', exist_ok=True)
        ims = [slide(raw, f'{out}/{size}', size, n, *s) for n, s in enumerate(SLIDES, 1)]
        pw = 300
        prev = Image.new('RGB', ((pw + 12) * len(ims), int(pw * ims[0].height / ims[0].width)), (20, 20, 20))
        for i, im in enumerate(ims):
            prev.paste(im.resize((pw, prev.height)), (i * (pw + 12), 0))
        prev.save(f'{out}/preview-{size}.png')
