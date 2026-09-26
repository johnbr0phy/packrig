"""Contact sheet for silscore results: per product, the render's mask, and its
profile (white) over the maker's traced profile (orange), drawn as mirrored
silhouettes at the same aspect.   python3 tools/silsheet.py shots/sil/<run> [out.png]"""
import json, sys, os
from PIL import Image, ImageDraw, ImageFont
run = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(run, 'sheet.png')
d = json.load(open(os.path.join(run, 'scores.json')))
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
photo = json.load(open(os.path.join(root, 'data/profiles.json')))
drawn = json.load(open(os.path.join(root, 'data/diagram-profiles.json')))
rows = [r for r in d['results'] if r.get('profile')]
W, H = 560, 170
sheet = Image.new('RGB', (W, H * max(1, len(rows))), (24, 25, 28))
dr = ImageDraw.Draw(sheet)
def poly(p, aspect, x0, y0, w, h, col, width=2):
    n = len(p); L = w; D = min(h * 0.45, L / max(aspect, 0.5) / 2 if aspect else h * 0.45)
    top = [(x0 + L * i / (n - 1), y0 + h / 2 - p[i] * D) for i in range(n)]
    bot = [(x0 + L * i / (n - 1), y0 + h / 2 + p[i] * D) for i in reversed(range(n))]
    dr.line(top + bot + [top[0]], fill=col, width=width)
for k, r in enumerate(rows):
    y = k * H
    m = os.path.join(run, r['key'] + '.png')
    if os.path.exists(m): sheet.paste(Image.open(m).resize((150, 150)), (8, y + 10))
    t = drawn.get(r['key']) or photo.get(r['key'])
    if t:
        tp = t['profile']
        # show truth in whichever direction matched
        if r.get('reversed'): tp = list(reversed(tp))
        poly(tp, t.get('aspect'), 180, y + 20, 360, 120, (255, 122, 69), 3)
    poly(r['profile'], r.get('aspect'), 180, y + 20, 360, 120, (235, 235, 235), 2)
    txt = f"{r['name'][:52]}   score {r.get('score', '–')}  iou {r.get('iou', '–')}  aspect {r.get('aspect')}/{r.get('truthAspect')}" + ('  REV' if r.get('reversed') else '')
    dr.text((180, y + 4), txt, fill=(220, 220, 220))
sheet.save(out)
print(out, len(rows))
