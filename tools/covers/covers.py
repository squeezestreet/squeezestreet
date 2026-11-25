"""Finish the covers: python3 covers.py WORK OUT landscape=1920x1080 portrait=800x1200+1080x1620 square=800x800
Each WORK/raw-<fmt>.png (rendered at 2x) is downsampled with LANCZOS to its exact size and written atomically to
OUT/cover-<fmt>-<WxH>.png, plus a .jpg (quality 92) when the PNG is over 2 MB. A +WxH extra size (the preview video's
opening frame, sharper than upscaling the cover) goes to WORK/frame0-<fmt>-<WxH>.png. Writes WORK/contact.png: the covers at
full size over the same covers at CrazyGames grid-thumbnail size (270x152, 160x240, 160x160), and WORK/thumbs.png."""
import os, sys
from PIL import Image

work, out, specs = sys.argv[1], sys.argv[2], sys.argv[3:]
THUMB = {'landscape': (270, 152), 'portrait': (160, 240), 'square': (160, 160)}
os.makedirs(out, exist_ok=True)

def save(im, path, **kw):
    tmp = os.path.join(os.path.dirname(path), '.' + os.path.basename(path) + '.tmp')
    im.save(tmp, format='JPEG' if path.endswith('.jpg') else 'PNG', **kw)
    os.replace(tmp, path)

covers = []
for spec in specs:
    fmt, size = spec.split('=')
    size, *extra = size.split('+')
    w, h = map(int, size.split('x'))
    raw = Image.open(os.path.join(work, 'raw-%s.png' % fmt)).convert('RGB')
    assert raw.size == (2 * w, 2 * h), '%s: raw is %s, expected %dx%d' % (fmt, raw.size, 2 * w, 2 * h)
    im = raw.resize((w, h), Image.LANCZOS)
    png = os.path.join(out, 'cover-%s-%dx%d.png' % (fmt, w, h))
    save(im, png, optimize=True)
    jpg = png[:-4] + '.jpg'
    if os.path.getsize(png) > 2 * 1024 * 1024: save(im, jpg, quality=92, optimize=True, subsampling=0)
    elif os.path.exists(jpg): os.remove(jpg)                       # a stale .jpg from a bigger earlier PNG
    for p in (png, jpg):
        if os.path.exists(p):
            with Image.open(p) as chk:
                assert chk.size == (w, h), p
                print('%s %dx%d %.2f MB' % (p, chk.size[0], chk.size[1], os.path.getsize(p) / 1048576))
    for ex in extra:
        ew, eh = map(int, ex.split('x'))
        assert ew * h == eh * w and ew <= 2 * w, '%s: %s is not the cover\'s aspect or is bigger than the raw' % (fmt, ex)
        save(raw.resize((ew, eh), Image.LANCZOS), os.path.join(work, 'frame0-%s-%s.png' % (fmt, ex)))
        print('video opening frame', os.path.join(work, 'frame0-%s-%s.png' % (fmt, ex)))
    covers.append((fmt, im))

# contact sheet: full size on top, thumbnails at true grid size below, on the site's dark grid colour
pad, top = 24, max(im.height for _, im in covers)
thumbs = [(fmt, im.resize(THUMB[fmt], Image.LANCZOS)) for fmt, im in covers]
sheet = Image.new('RGB', (pad + sum(im.width + pad for _, im in covers), pad * 3 + top + 240), '#14151f')
x = pad
for fmt, im in covers: sheet.paste(im, (x, pad)); x += im.width + pad
x = pad
for fmt, t in thumbs: sheet.paste(t, (x, pad * 2 + top)); x += t.width + pad
save(sheet, os.path.join(work, 'contact.png'))
strip = Image.new('RGB', (pad + sum(t.width + pad for _, t in thumbs), 240 + 2 * pad), '#14151f')
x = pad
for fmt, t in thumbs: strip.paste(t, (x, pad)); x += t.width + pad
save(strip, os.path.join(work, 'thumbs.png'))
print('contact sheet', os.path.join(work, 'contact.png'))
