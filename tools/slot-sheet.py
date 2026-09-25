"""Contact sheet from bagshot renders.

  python3 tools/slot-sheet.py <shots dir> <out.png> [--angles side,tq] [--cols 2]

<shots dir> is a bagshot --out directory (or shots/bag); every <slug>/ inside
it with the requested angle PNGs becomes one row: label, then each angle.
Pair a 'before' and an 'after' run of the same products to compare.
"""
import os, sys, json
from PIL import Image, ImageDraw
args = sys.argv[1:]
src, out = args[0], args[1]
angles = (args[args.index('--angles') + 1] if '--angles' in args else 'side,tq').split(',')
W = 520
rows = []
for slug in sorted(os.listdir(src)):
    d = os.path.join(src, slug)
    if not os.path.isdir(d): continue
    ims = [os.path.join(d, f'{a}.png') for a in angles]
    if not all(os.path.exists(x) for x in ims): continue
    rows.append((slug, ims))
if not rows:
    print('no rows'); sys.exit(1)
h0 = None
tiles = []
for slug, ims in rows:
    row = []
    for p in ims:
        im = Image.open(p).convert('RGB')
        im.thumbnail((W, W))
        row.append(im)
    tiles.append((slug, row))
H = max(im.size[1] for _, r in tiles for im in r)
sheet = Image.new('RGB', (W * len(angles), (H + 22) * len(tiles)), (18, 19, 21))
dr = ImageDraw.Draw(sheet)
for i, (slug, row) in enumerate(tiles):
    y = i * (H + 22)
    dr.text((6, y + 4), slug, fill=(230, 230, 230))
    for k, im in enumerate(row):
        sheet.paste(im, (k * W, y + 22))
sheet.save(out)
print(out, len(tiles), 'rows')
