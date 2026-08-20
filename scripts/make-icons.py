#!/usr/bin/env python3
"""
THE APP ICON — a drawn 'IB', white on the brand teal.

Kept as a script rather than four checked-in binaries with no source, so the
mark can be changed by editing numbers instead of opening a design tool. Pure
standard library: no Pillow, no cairo, nothing to install on a school laptop.

    python3 scripts/make-icons.py

Three things learned the hard way, recorded so they are not un-learned:

  1. ANTI-ALIASING IS NOT OPTIONAL. A hard inside/outside test gives staircased
     curves that look cheap at any size. Everything renders at SS x and box
     downsamples, which costs nothing and is the whole difference.
  2. SEMICIRCULAR BOWLS KILL THE COUNTERS. At a bold stroke weight the hole
     inside a circular bowl is a sliver. Bold type solves this with ELLIPTICAL
     bowls, wider than tall, so the counter stays open.
  3. NO TIE BARS. The top of an annulus IS the horizontal bar and it already
     lands on the stem's right edge; drawing them separately looks blobby.
"""
import zlib, struct

BRAND = (47, 111, 106)   # --brand #2f6f6a
WHITE = (255, 255, 255)
SS = 4                   # supersample factor

# --- letterform proportions, as fractions of cap height ------------------
STROKE   = 0.175   # stem weight. Higher = bolder, but watch the counters.
BOWL_X   = 0.300   # bowls are WIDE — this is what keeps the counter open
BOWL_Y_T = 0.245   # upper bowl smaller than the lower, or the B looks
BOWL_Y_B = 0.275   # top-heavy. The oldest rule in letter drawing.
GAP      = 0.55    # space between I and B, as a fraction of stroke
CAP      = 0.46    # cap height as a fraction of the tile
CORNER   = 0.223   # tile corner radius


def build(size, *, rounded, scale):
    S = size * SS
    rad = S * CORNER if rounded else 0
    px = bytearray(S * S * 4)

    H = S * CAP * scale
    w = H * STROKE
    rx = H * BOWL_X
    ryt, ryb = H * BOWL_Y_T, H * BOWL_Y_B

    gap = w * GAP
    x0 = (S - (w + gap + w + rx)) / 2.0
    bx = x0 + w + gap
    top = (S - H) / 2.0
    bot = top + H
    stem = bx + w

    def ink(x, y):
        if x0 <= x <= x0 + w and top <= y <= bot: return True   # I
        if bx <= x <= stem and top <= y <= bot:   return True   # B stem
        if x >= stem:                                            # B bowls
            for cy, ry in ((top + ryt, ryt), (bot - ryb, ryb)):
                dx, dy = (x - stem) / rx, (y - cy) / ry
                if dx * dx + dy * dy <= 1.0:
                    ix, iy = (x - stem) / (rx - w), (y - cy) / (ry - w)
                    if ix * ix + iy * iy >= 1.0:
                        return True
        return False

    for y in range(S):
        base = y * S * 4
        for x in range(S):
            i = base + x * 4
            if rounded:
                dx = max(rad - x, 0, x - (S - 1 - rad))
                dy = max(rad - y, 0, y - (S - 1 - rad))
                if dx * dx + dy * dy > rad * rad:
                    continue                      # transparent corner
            px[i:i + 3] = bytes(BRAND); px[i + 3] = 255
            if ink(x, y):
                px[i:i + 3] = bytes(WHITE)

    rows, n = [], SS * SS
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            r = g = b = a = 0
            for oy in range(SS):
                o = ((y * SS + oy) * S + x * SS) * 4
                for ox in range(SS):
                    p = o + ox * 4
                    r += px[p]; g += px[p + 1]; b += px[p + 2]; a += px[p + 3]
            row += bytes((r // n, g // n, b // n, a // n))
        rows.append(bytes(row))
    return b''.join(rows)


def write(path, size, raw):
    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data +
                struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))
    out = b'\x89PNG\r\n\x1a\n'
    out += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    out += chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    open(path, 'wb').write(out)
    print(f'  {path}  {size}px  {len(out):,} bytes')


if __name__ == '__main__':
    print('icons →')
    # purpose: any — rounded tile, transparent corners
    write('public/icons/cas-192.png', 192, build(192, rounded=True, scale=1.0))
    write('public/icons/cas-512.png', 512, build(512, rounded=True, scale=1.0))
    # purpose: maskable — full bleed; Android crops to the launcher's shape, so
    # the mark sits inside the 80% safe zone or a circle mask slices it.
    write('public/icons/cas-maskable-512.png', 512,
          build(512, rounded=False, scale=0.68))
    # iOS applies its own rounding and rejects transparency: full square.
    write('public/icons/apple-touch-icon.png', 180,
          build(180, rounded=False, scale=1.0))
