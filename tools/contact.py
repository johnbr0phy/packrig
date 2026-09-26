"""Contact sheets for the screen shots.

  python3 tools/contact.py sheet <dir> <out.jpg> --device phone|desktop [--only S04,S05]
      every <id>-<device>-<state>.png in <dir>, labelled, in a grid
  python3 tools/contact.py pair <before dir> <after dir> <out.jpg> --only S08,S09
      before | after side by side, phone and desktop, one row per shot
  python3 tools/contact.py shrink <dir> <out dir>
      downscaled JPEGs of every PNG (what gets committed; raw PNGs stay local)
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont

args = sys.argv[1:]
mode = args[0]
def opt(k, d=None):
    return args[args.index(k) + 1] if k in args else d
only = opt('--only')
only = only.split(',') if only else None

try:
    FONT = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 18)
except Exception:
    FONT = ImageFont.load_default()

def shots(d, device=None):
    out = []
    for f in sorted(os.listdir(d)):
        if not f.endswith('.png') or f.endswith('-2.png'): continue
        parts = f[:-4].split('-')
        dev = next((p for p in parts if p in ('phone', 'desktop')), None)
        if device and dev != device: continue
        sid = parts[0]
        if only and not any(f.startswith(o) for o in only): continue
        out.append((f, os.path.join(d, f)))
    return out

def thumb(p, w):
    im = Image.open(p).convert('RGB')
    h = round(im.height * w / im.width)
    return im.resize((w, h), Image.LANCZOS)

def label(im, text):
    c = Image.new('RGB', (im.width, im.height + 30), (18, 19, 22))
    c.paste(im, (0, 30))
    ImageDraw.Draw(c).text((6, 5), text, fill=(235, 235, 235), font=FONT)
    return c

def grid(tiles, cols, out):
    if not tiles: print('nothing to sheet'); return
    w = max(t.width for t in tiles); h = max(t.height for t in tiles)
    rows = (len(tiles) + cols - 1) // cols
    S = Image.new('RGB', (cols * (w + 10) + 10, rows * (h + 10) + 10), (10, 10, 12))
    for i, t in enumerate(tiles):
        S.paste(t, (10 + (i % cols) * (w + 10), 10 + (i // cols) * (h + 10)))
    S.save(out, quality=82)
    print('wrote', out, S.size)

if mode == 'sheet':
    d, out = args[1], args[2]
    dev = opt('--device', 'phone')
    w = 300 if dev == 'phone' else 560
    tiles = [label(thumb(p, w), f[:-4]) for f, p in shots(d, dev)]
    grid(tiles, 6 if dev == 'phone' else 3, out)
elif mode == 'pair':
    b, a, out = args[1], args[2], args[3]
    tiles = []
    names = sorted({f for f, _ in shots(a)} | {f for f, _ in shots(b)})
    rows = []
    for dev, w in (('phone', 300), ('desktop', 560)):
        for f in [n for n in names if f'-{dev}-' in n]:
            pb, pa = os.path.join(b, f), os.path.join(a, f)
            cells = []
            for tag, p in (('before', pb), ('after', pa)):
                if os.path.exists(p): cells.append(label(thumb(p, w), f'{tag}  {f[:-4]}'))
            if cells:
                row = Image.new('RGB', (sum(c.width for c in cells) + 10 * (len(cells) + 1), max(c.height for c in cells) + 20), (10, 10, 12))
                x = 10
                for c in cells: row.paste(c, (x, 10)); x += c.width + 10
                rows.append(row)
    if not rows: print('nothing'); sys.exit(0)
    W = max(r.width for r in rows); H = sum(r.height for r in rows)
    S = Image.new('RGB', (W, H), (10, 10, 12)); y = 0
    for r in rows: S.paste(r, (0, y)); y += r.height
    S.save(out, quality=80); print('wrote', out, S.size)
elif mode == 'shrink':
    d, od = args[1], args[2]
    os.makedirs(od, exist_ok=True)
    for f, p in shots(d):
        w = 393 if '-phone-' in f else 720
        thumb(p, w).save(os.path.join(od, f[:-4] + '.jpg'), quality=78)
    print('shrunk into', od)
