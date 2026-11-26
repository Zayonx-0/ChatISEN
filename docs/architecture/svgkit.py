"""Small SVG drawing kit shared by the presentation board."""

import json
from html import escape
from pathlib import Path

LOGOS = json.loads(Path(__file__).with_name("logos.json").read_text(encoding="utf-8"))

COLORS = {
    "web": "#1f56c9",
    "media": "#0b7a83",
    "data": "#146c43",
    "ops": "#a8470c",
    "admin": "#6d31a3",
    "push": "#a82f63",
}

# Persona badges: who is allowed to reach a block.
BADGES = {"U": "#1c6e8c", "O": "#b42318", "A": "#6d31a3"}

ICONS = {
    "browser": '<rect x="3" y="4" width="18" height="15" rx="2"/><path d="M3 9h18"/>',
    "dns": '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3q8 9 0 18-8-9 0-18Z"/>',
    "user": '<circle cx="12" cy="8" r="4.5"/><path d="M3.5 21c1-5 4.5-7 8.500-7s7.500 2 8.500 7"/>',
    "terminal": '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3m6 0h4"/>',
    "shield": '<path d="M12 2 4 5v6c0 5 3 8 8 11 5-3 8-6 8-11V5l-8-3Z"/><path d="m8 12 3 3 5-6"/>',
    "firewall": '<path d="M3 5h18v14H3zM3 9.700h18M3 14.300h18M9 5v4.700M15 9.700v4.600M9 14.300V19"/>',
    "key": '<circle cx="8" cy="14" r="4.5"/><path d="m11.500 11 8-8m-3 3 3 3m-6 0 2 2"/>',
    "balancer": '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="2" y="16" width="6" height="5" rx="1"/>'
                '<rect x="16" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M5 16v-4h14v4"/>',
    "disk": '<ellipse cx="12" cy="5.500" rx="8.500" ry="3"/><path d="M3.500 5.500v13c0 4 17 4 17 0v-13M3.500 12c0 4 17 4 17 0"/>',
    "server": '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.500h1m-1 9h1"/>',
    "sfu": '<circle cx="12" cy="12" r="3"/><circle cx="4" cy="5" r="2"/><circle cx="20" cy="5" r="2"/>'
           '<circle cx="4" cy="19" r="2"/><circle cx="20" cy="19" r="2"/><path d="m5.500 6.500 4 3.500m9-3.500-4 3.500m-9 7.500 4-3.500m9 3.500-4-3.500"/>',
    "relay": '<path d="M4 8h13m-4-4 4 4-4 4M20 16H7m4-4-4 4 4 4"/>',
    "chart": '<path d="M4 4v16h16M8 16v-5m4 5V8m4 8v-3"/>',
    "nat": '<rect x="3" y="6" width="12" height="12" rx="2"/><path d="M11 12h10m-3.500-3.500L21 12l-3.500 3.500"/>',
    "bell": '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12h4"/>',
}


def rect(x, y, w, h, fill, stroke="none", radius=12, *, width=1.2, dash="", css=""):
    extra = f' stroke-dasharray="{dash}"' if dash else ""
    extra += f' class="{css}"' if css else ""
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{fill}" '
            f'stroke="{stroke}" stroke-width="{width}"{extra}/>')


def text(x, y, value, style="body", anchor="start"):
    keep = ' xml:space="preserve"' if value.startswith(" ") else ""
    return f'<text x="{x}" y="{y}" class="{style}" text-anchor="{anchor}"{keep}>{escape(value)}</text>'


def lines(x, y, values, style="body", step=19):
    return "".join(text(x, y + i * step, value, style) for i, value in enumerate(values) if value)


def icon(name, x, y, color, size=26):
    return (f'<g aria-hidden="true" transform="translate({x} {y}) scale({size / 24})">'
            f'<g fill="none" stroke="{color}" stroke-width="1.700" stroke-linejoin="round" '
            f'stroke-linecap="round">{ICONS[name]}</g></g>')


def logo(name, x, y, size=30):
    return (f'<image x="{x}" y="{y}" width="{size}" height="{size}" '
            f'preserveAspectRatio="xMidYMid meet" href="{LOGOS[name]["data"]}"/>')


def badge(cx, cy, letter):
    return (f'<circle cx="{cx}" cy="{cy}" r="11" fill="{BADGES[letter]}" stroke="#fff" stroke-width="2"/>'
            + text(cx, cy + 4.5, letter, "badge", "middle"))


def badges(right, top, letters):
    return "".join(badge(right - 14 - 25 * i, top, letter) for i, letter in enumerate(reversed(letters)))


def card(x, y, w, h, title, body=(), *, symbol=None, brand=None, kind="web", who="", stroke="#c3d0e0",
         fill="#ffffff", style="small", step=19, dash=""):
    """A block with a brand logo or a pictogram, a title, detail lines and persona badges."""
    parts = [rect(x, y, w, h, fill, stroke, 10, width=1.5 if dash else 1.2, dash=dash)]
    offset = 12
    if brand:
        parts.append(logo(brand, x + 11, y + 9, 30))
        offset = 50
    elif symbol:
        parts.append(icon(symbol, x + 12, y + 11, COLORS[kind]))
        offset = 48
    parts.append(text(x + offset, y + 29, title, "card"))
    parts.append(lines(x + 13, y + 55, body, style, step))
    if who:
        parts.append(badges(x + w, y, who))
    return "".join(parts)


def arrow(path, kind, *, both=False, dashed=False, head=True):
    start = f' marker-start="url(#{kind}-arrow)"' if both else ""
    end = f' marker-end="url(#{kind}-arrow)"' if head else ""
    dash = ' stroke-dasharray="7 5"' if dashed else ""
    return (f'<path class="flow" d="{path}" fill="none" stroke="{COLORS[kind]}" stroke-width="2.300" '
            f'stroke-linecap="round" stroke-linejoin="round"{end}{start}{dash}/>')


def flow(cx, cy, values, kind, width):
    """A named flow label sitting on its arrow. The first line carries the identifier."""
    height = 8 + 15 * len(values)
    top = cy - height / 2
    parts = [rect(cx - width / 2, top, width, height, "#ffffff", COLORS[kind], 6, css="flow-label")]
    for i, value in enumerate(values):
        parts.append(text(cx, top + 16 + 15 * i, value, f"{'id' if i == 0 else 'flowtext'} {kind}", "middle"))
    return "".join(parts)


def markers():
    return "".join(
        f'<marker id="{kind}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" '
        f'orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="{color}"/></marker>'
        for kind, color in COLORS.items()
    )


def stylesheet():
    colors = "".join(f"text.{kind}{{fill:{color}}}" for kind, color in COLORS.items())
    return f"""<style>
text {{ font-family: Arial, Helvetica, "Liberation Sans", sans-serif; fill:#13263c; font-size:14px; }}
.title {{ font-size:36px; font-weight:700; }}
.subtitle {{ font-size:18px; fill:#425971; }}
.zone {{ font-size:16px; font-weight:700; letter-spacing:.3px; }}
.section {{ font-size:13.5px; font-weight:700; }}
.card {{ font-size:15.5px; font-weight:700; }}
.small {{ font-size:13.5px; fill:#27405b; }}
.micro {{ font-size:12.5px; fill:#34506d; }}
.mono {{ font-size:12.5px; fill:#1d3a5c; font-weight:700; }}
.id {{ font-size:13px; font-weight:700; }}
.flowtext {{ font-size:12.5px; }}
.badge {{ font-size:12.5px; font-weight:700; fill:#ffffff; }}
{colors}
</style>"""
