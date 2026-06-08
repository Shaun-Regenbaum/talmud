#!/usr/bin/env python3
"""
Generate simplified region outlines for the GeographyMap component.

Reads two source SVGs, parses the main landmass path (converting all
Bezier/Arc segments to their endpoints), applies the Ramer-Douglas-Peucker
simplification, normalizes each shape to a target bbox, and emits
`src/client/geoShapes.ts` with the resulting path data as inline TS
constants. Run when you want to swap the source SVG or adjust the
simplification epsilon.

Usage:
    python3 scripts/gen-geo-shapes.py \
        --israel path/to/israel-source.svg \
        --bavel  path/to/bavel-source.svg
"""

import argparse
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def parse_path_endpoints(d: str):
    """Parse an SVG path `d` string into a list of (x, y, is_move) tuples.
    Bezier/Arc curves are collapsed to their endpoints. None sentinels mark
    the end of a sub-path (Z/z)."""
    d = re.sub(r'([MmLlHhVvCcSsQqTtAaZz])', r' \1 ', d)
    tokens = re.findall(
        r'[MmLlHhVvCcSsQqTtAaZz]|[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?', d
    )
    pts, x, y, sx, sy, cmd, i = [], 0.0, 0.0, 0.0, 0.0, None, 0
    while i < len(tokens):
        t = tokens[i]
        if t in 'MmLlHhVvCcSsQqTtAaZz':
            cmd = t
            i += 1
            if cmd in 'Zz':
                pts.append(None)
                x, y = sx, sy
                cmd = None
            continue
        try:
            if cmd == 'M':
                x, y = float(tokens[i]), float(tokens[i + 1]); i += 2
                sx, sy = x, y; pts.append((x, y, True)); cmd = 'L'
            elif cmd == 'm':
                x += float(tokens[i]); y += float(tokens[i + 1]); i += 2
                sx, sy = x, y; pts.append((x, y, True)); cmd = 'l'
            elif cmd == 'L':
                x, y = float(tokens[i]), float(tokens[i + 1]); i += 2
                pts.append((x, y, False))
            elif cmd == 'l':
                x += float(tokens[i]); y += float(tokens[i + 1]); i += 2
                pts.append((x, y, False))
            elif cmd == 'H':
                x = float(tokens[i]); i += 1; pts.append((x, y, False))
            elif cmd == 'h':
                x += float(tokens[i]); i += 1; pts.append((x, y, False))
            elif cmd == 'V':
                y = float(tokens[i]); i += 1; pts.append((x, y, False))
            elif cmd == 'v':
                y += float(tokens[i]); i += 1; pts.append((x, y, False))
            elif cmd == 'C':
                x, y = float(tokens[i + 4]), float(tokens[i + 5]); i += 6
                pts.append((x, y, False))
            elif cmd == 'c':
                x += float(tokens[i + 4]); y += float(tokens[i + 5]); i += 6
                pts.append((x, y, False))
            elif cmd in 'Ss':
                dx, dy = float(tokens[i + 2]), float(tokens[i + 3]); i += 4
                if cmd == 's': x += dx; y += dy
                else: x, y = dx, dy
                pts.append((x, y, False))
            elif cmd in 'Qq':
                dx, dy = float(tokens[i + 2]), float(tokens[i + 3]); i += 4
                if cmd == 'q': x += dx; y += dy
                else: x, y = dx, dy
                pts.append((x, y, False))
            elif cmd in 'Tt':
                dx, dy = float(tokens[i]), float(tokens[i + 1]); i += 2
                if cmd == 't': x += dx; y += dy
                else: x, y = dx, dy
                pts.append((x, y, False))
            elif cmd in 'Aa':
                dx, dy = float(tokens[i + 5]), float(tokens[i + 6]); i += 7
                if cmd == 'a': x += dx; y += dy
                else: x, y = dx, dy
                pts.append((x, y, False))
            else:
                i += 1
        except (IndexError, ValueError):
            break
    return pts


def perp_dist(pt, a, b):
    if a == b:
        return ((pt[0] - a[0]) ** 2 + (pt[1] - a[1]) ** 2) ** 0.5
    dx, dy = b[0] - a[0], b[1] - a[1]
    num = abs(dy * pt[0] - dx * pt[1] + b[0] * a[1] - b[1] * a[0])
    return num / (dx * dx + dy * dy) ** 0.5


def rdp(pts, eps):
    if len(pts) < 3:
        return pts
    dmax, idx = 0, 0
    for i in range(1, len(pts) - 1):
        d = perp_dist(pts[i], pts[0], pts[-1])
        if d > dmax:
            dmax, idx = d, i
    if dmax > eps:
        return rdp(pts[:idx + 1], eps)[:-1] + rdp(pts[idx:], eps)
    return [pts[0], pts[-1]]


def split_subpaths(pts):
    subs, cur = [], []
    for p in pts:
        if p is None:
            if cur:
                subs.append(cur); cur = []
            continue
        cx, cy, mv = p
        if mv and cur:
            subs.append(cur); cur = []
        cur.append((cx, cy))
    if cur:
        subs.append(cur)
    return subs


def extract_all_paths(svg_text):
    """All <path d="..."> strings in the SVG, multiline-safe."""
    return re.findall(r'<path[^>]*?\bd="([^"]*)"', svg_text, re.DOTALL)


def pick_main_subpath(svg_text, path_index=None, transform=None):
    """Extract the largest sub-path from the chosen path element."""
    paths = extract_all_paths(svg_text)
    if path_index is None:
        d = max(paths, key=len)
    else:
        d = paths[path_index]
    pts = parse_path_endpoints(d)
    if transform:
        pts = [transform(p) for p in pts]
    subs = split_subpaths(pts)
    return max(subs, key=len)


def extract_all_subpaths(svg_text, transform=None):
    """Union of all sub-paths across every <path> in the SVG, as a list of
    point-lists. Useful when the country outline is split across multiple
    <path> elements (territories, islands, etc.)."""
    all_subs = []
    for d in extract_all_paths(svg_text):
        pts = parse_path_endpoints(d)
        if transform:
            pts = [transform(p) for p in pts]
        all_subs.extend(split_subpaths(pts))
    return all_subs


def normalize(pts, target_w, target_h):
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    x0, y0, x1, y1 = min(xs), min(ys), max(xs), max(ys)
    w, h = x1 - x0, y1 - y0
    scale = min(target_w / w, target_h / h)
    out = [((p[0] - x0) * scale, (p[1] - y0) * scale) for p in pts]
    return out, w * scale, h * scale


def to_d(pts):
    out = f'M{pts[0][0]:.1f},{pts[0][1]:.1f}'
    for p in pts[1:]:
        out += f'L{p[0]:.1f},{p[1]:.1f}'
    return out + 'Z'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--israel', required=True)
    ap.add_argument('--bavel', required=True)
    ap.add_argument('--israel-eps', type=float, default=0.8)
    ap.add_argument('--bavel-eps', type=float, default=4.0)
    ap.add_argument('--israel-mode', choices=('union', 'largest', 'path'), default='union',
                    help='union = every sub-path, largest = biggest sub-path, path = explicit --israel-path-index')
    ap.add_argument('--israel-path-index', type=int, default=None,
                    help='With --israel-mode=path, use this <path> index from the source SVG')
    args = ap.parse_args()

    israel_raw = Path(args.israel).read_text()
    if args.israel_mode == 'union':
        israel_subs = [rdp(s, args.israel_eps) for s in extract_all_subpaths(israel_raw) if len(s) >= 5]
    elif args.israel_mode == 'path' and args.israel_path_index is not None:
        israel_subs = [rdp(pick_main_subpath(israel_raw, path_index=args.israel_path_index), args.israel_eps)]
    else:
        israel_subs = [rdp(pick_main_subpath(israel_raw), args.israel_eps)]

    # Bavel source has a group transform translate(0, 468) scale(0.1, -0.1);
    # apply it so path coords end up in the 0..600 x 0..468 viewport.
    def bavel_xform(p):
        if p is None:
            return None
        return (0.1 * p[0], 468 - 0.1 * p[1], p[2])
    bavel_sub = pick_main_subpath(
        Path(args.bavel).read_text(), transform=bavel_xform
    )
    bavel_simpl = rdp(bavel_sub, args.bavel_eps)

    # Normalize union of all Israel sub-paths to a common target box, keeping
    # their relative positions. Compute the combined bbox first, then
    # rescale every sub-path with the same scale + offset.
    all_israel_pts = [p for s in israel_subs for p in s]
    israel_n_all, iw, ih = normalize(all_israel_pts, 90, 180)
    # Re-associate normalized points back into sub-paths (same order).
    israel_n_subs = []
    cursor = 0
    for s in israel_subs:
        n = len(s)
        israel_n_subs.append(israel_n_all[cursor:cursor + n])
        cursor += n

    bavel_n, bw, bh = normalize(bavel_simpl, 200, 180)

    israel_d = ''.join(to_d(s) for s in israel_n_subs)
    out = f'''// Auto-generated region outlines for the GeographyMap.
// Regenerate via: python3 scripts/gen-geo-shapes.py --israel <...> --bavel <...>
export const ISRAEL_SHAPE = {{
  width: {iw:.1f},
  height: {ih:.1f},
  d: "{israel_d}",
}};

export const BAVEL_SHAPE = {{
  width: {bw:.1f},
  height: {bh:.1f},
  d: "{to_d(bavel_n)}",
}};
'''

    dest = REPO_ROOT / 'src' / 'client' / 'geoShapes.ts'
    dest.write_text(out)
    ipts = sum(len(s) for s in israel_n_subs)
    print(f'Israel: {iw:.1f} x {ih:.1f}, {ipts} points across {len(israel_n_subs)} sub-paths')
    print(f'Bavel:  {bw:.1f} x {bh:.1f}, {len(bavel_simpl)} points')
    print(f'Wrote {dest.relative_to(REPO_ROOT)} ({dest.stat().st_size} bytes)')


if __name__ == '__main__':
    main()
