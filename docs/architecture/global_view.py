"""Render the landscape presentation of the observed Compute Engine deployment."""

from html import escape

WIDTH, HEIGHT = 1600, 900

COLORS = {
    'web': '#225ad3',
    'media': '#087e86',
    'data': '#14734e',
    'ops': '#a64b13',
    'admin': '#7438a8',
    'push': '#a43768',
}
LOGOS = {
    'app': 'M12 2c1.8 5.5 4.5 8.2 10 10-5.5 1.8-8.2 4.5-10 10C10.2 16.5 7.5 13.8 2 12c5.5-1.8 8.2-4.5 10-10Z',
    'googlecloud': 'M12.19 2.38a9.344 9.344 0 0 0-9.234 6.893c.053-.02-.055.013 0 0-3.875 2.551-3.922 8.11-.247 10.941l.006-.007-.007.03a6.717 6.717 0 0 0 4.077 1.356h5.173l.03.03h5.192c6.687.053 9.376-8.605 3.835-12.35a9.365 9.365 0 0 0-2.821-4.552l-.043.043.006-.05A9.344 9.344 0 0 0 12.19 2.38zm-.358 4.146c1.244-.04 2.518.368 3.486 1.15a5.186 5.186 0 0 1 1.862 4.078v.518c3.53-.07 3.53 5.262 0 5.193h-5.193l-.008.009v-.04H6.785a2.59 2.59 0 0 1-1.067-.23h.001a2.597 2.597 0 1 1 3.437-3.437l3.013-3.012A6.747 6.747 0 0 0 8.11 8.24c.018-.01.04-.026.054-.023a5.186 5.186 0 0 1 3.67-1.69z',
    'nodedotjs': 'M11.998,24c-0.321,0-0.641-0.084-0.922-0.247l-2.936-1.737c-0.438-0.245-0.224-0.332-0.08-0.383 c0.585-0.203,0.703-0.25,1.328-0.604c0.065-0.037,0.151-0.023,0.218,0.017l2.256,1.339c0.082,0.045,0.197,0.045,0.272,0l8.795-5.076 c0.082-0.047,0.134-0.141,0.134-0.238V6.921c0-0.099-0.053-0.192-0.137-0.242l-8.791-5.072c-0.081-0.047-0.189-0.047-0.271,0 L3.075,6.68C2.99,6.729,2.936,6.825,2.936,6.921v10.15c0,0.097,0.054,0.189,0.139,0.235l2.409,1.392 c1.307,0.654,2.108-0.116,2.108-0.89V7.787c0-0.142,0.114-0.253,0.256-0.253h1.115c0.139,0,0.255,0.112,0.255,0.253v10.021 c0,1.745-0.95,2.745-2.604,2.745c-0.508,0-0.909,0-2.026-0.551L2.28,18.675c-0.57-0.329-0.922-0.945-0.922-1.604V6.921 c0-0.659,0.353-1.275,0.922-1.603l8.795-5.082c0.557-0.315,1.296-0.315,1.848,0l8.794,5.082c0.57,0.329,0.924,0.944,0.924,1.603 v10.15c0,0.659-0.354,1.273-0.924,1.604l-8.794,5.078C12.643,23.916,12.324,24,11.998,24z M19.099,13.993 c0-1.9-1.284-2.406-3.987-2.763c-2.731-0.361-3.009-0.548-3.009-1.187c0-0.528,0.235-1.233,2.258-1.233 c1.807,0,2.473,0.389,2.747,1.607c0.024,0.115,0.129,0.199,0.247,0.199h1.141c0.071,0,0.138-0.031,0.186-0.081 c0.048-0.054,0.074-0.123,0.067-0.196c-0.177-2.098-1.571-3.076-4.388-3.076c-2.508,0-4.004,1.058-4.004,2.833 c0,1.925,1.488,2.457,3.895,2.695c2.88,0.282,3.103,0.703,3.103,1.269c0,0.983-0.789,1.402-2.642,1.402 c-2.327,0-2.839-0.584-3.011-1.742c-0.02-0.124-0.126-0.215-0.253-0.215h-1.137c-0.141,0-0.254,0.112-0.254,0.253 c0,1.482,0.806,3.248,4.655,3.248C17.501,17.007,19.099,15.91,19.099,13.993z',
    'github': 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12',
    'caddy': 'M11.094.47c-.842 0-1.696.092-2.552.288a11.37 11.37 0 0 0-4.87 2.423 10.632 10.632 0 0 0-2.36 2.826A10.132 10.132 0 0 0 .305 8.582c-.398 1.62-.4 3.336-.043 5.048.085.405.183.809.31 1.212a11.85 11.85 0 0 0 1.662 3.729 3.273 3.273 0 0 0-.086.427 3.323 3.323 0 0 0 2.848 3.71 3.279 3.279 0 0 0 1.947-.346c1.045.51 2.17.864 3.339 1.04a11.66 11.66 0 0 0 4.285-.155 11.566 11.566 0 0 0 4.936-2.485 10.643 10.643 0 0 0 2.352-2.894 11.164 11.164 0 0 0 1.356-4.424 11.214 11.214 0 0 0-.498-4.335c.175-.077.338-.175.486-.293a.444.444 89.992 0 0 .001 0c.402-.322.693-.794.777-1.342a2.146 2.146 0 0 0-1.79-2.434 2.115 2.115 0 0 0-1.205.171c-.038-.043-.078-.086-.113-.13a11.693 11.693 0 0 0-3.476-2.93 13.348 13.348 0 0 0-1.76-.81 13.55 13.55 0 0 0-2.06-.613A12.121 12.121 0 0 0 11.093.47Zm.714.328c.345-.004.688.01 1.028.042a9.892 9.892 0 0 1 2.743.639c.984.39 1.89.958 2.707 1.632.803.662 1.502 1.45 2.091 2.328.026.039.048.08.07.12a2.12 2.12 0 0 0-.435 2.646c-.158.114-.97.692-1.634 1.183-.414.308-.733.557-.733.557l.581.68s.296-.276.665-.638c.572-.562 1.229-1.233 1.395-1.403a2.122 2.122 0 0 0 1.907.677 11.229 11.229 0 0 1-.013 4.046 11.41 11.41 0 0 1-1.475 3.897 12.343 12.343 0 0 1-2.079 2.587c-1.19 1.125-2.633 2.022-4.306 2.531a10.826 10.826 0 0 1-3.973.484 11.04 11.04 0 0 1-3.057-.652 3.304 3.304 0 0 0 1.417-2.294 3.275 3.275 0 0 0-.294-1.842c.18-.162.403-.363.656-.6 1.015-.955 2.353-2.303 2.353-2.303l-.47-.599s-1.63.972-2.801 1.728c-.307.198-.573.378-.777.517a3.273 3.273 0 0 0-1.516-.611c-1.507-.198-2.927.672-3.487 2.017a10.323 10.323 0 0 1-.695-1.078A10.92 10.92 0 0 1 .728 14.8a10.35 10.35 0 0 1-.2-1.212c-.164-1.653.103-3.258.629-4.754a12.95 12.95 0 0 1 1.087-2.288c.57-.968 1.248-1.872 2.069-2.656A11.013 11.013 0 0 1 11.808.797Zm-.147 3.257a3.838 3.838 0 0 0-3.82 3.82v2.36h-.94c-.751 0-1.377.625-1.377 1.377v3.8h1.46v-3.718h9.354v6.264H10.02v1.46h6.4c.751 0 1.377-.625 1.377-1.377v-6.43c0-.751-.626-1.377-1.377-1.377h-.94v-2.36a3.838 3.838 0 0 0-3.82-3.819zm0 1.46a2.371 2.371 0 0 1 2.36 2.36v2.36H9.3v-2.36a2.372 2.372 0 0 1 2.36-2.36zm10.141.392a1.253 1.253 0 0 1 1.296 1.434c-.049.319-.217.59-.453.78-.266.213-.61.318-.968.264a1.253 1.253 0 0 1-1.045-1.42 1.255 1.255 0 0 1 1.17-1.058zM5.384 17.425a2.02 2.02 0 0 1 1.917 1.298c.116.3.159.628.114.967a2.015 2.015 0 0 1-2.249 1.728 2.016 2.016 0 0 1-1.727-2.25 2.017 2.017 0 0 1 1.945-1.743z',
}
ICONS = {
    'browser': '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M3 8h18m-13 13h8m-4-3v3"/>',
    'dns': '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3q8 9 0 18-8-9 0-18Z"/>',
    'terminal': '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3m6 0h4"/>',
    'shield': '<path d="M12 2 4 5v6c0 5 3 8 8 11 5-3 8-6 8-11V5l-8-3Z"/><path d="m8 12 3 3 5-6"/>',
    'disk': '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 4 18 4 18 0V5M3 12c0 4 18 4 18 0"/>',
    'bell': '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12h4"/>',
    'server': '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h1m-1 9h1"/>',
    'signal': '<path d="M5 17v3m5-7v7m5-12v12m5-16v16"/>',
}


def rectangle(x, y, width, height, fill, stroke='none', radius=12):
    return (f'<rect x="{x}" y="{y}" width="{width}" height="{height}" rx="{radius}" '
            f'fill="{fill}" stroke="{stroke}"/>')


def label(x, y, value, style='body', anchor='start'):
    return f'<text x="{x}" y="{y}" class="{style}" text-anchor="{anchor}">{escape(value)}</text>'


def icon(name, x, y, color, size=25):
    scale = size / 24
    if name in LOGOS:
        body = f'<path d="{LOGOS[name]}" fill="{color}"/>'
    else:
        body = f'<g fill="none" stroke="{color}" stroke-width="1.65" stroke-linejoin="round" stroke-linecap="round">{ICONS[name]}</g>'
    return f'<g aria-hidden="true" transform="translate({x} {y}) scale({scale})">{body}</g>'


def arrow(path, kind, *, both=False, dashed=False):
    start = f' marker-start="url(#{kind}-arrow)"' if both else ''
    dash = ' stroke-dasharray="6 5"' if dashed else ''
    return (f'<path d="{path}" fill="none" stroke="{COLORS[kind]}" stroke-width="2.15" '
            f'stroke-linecap="round" stroke-linejoin="round" marker-end="url(#{kind}-arrow)"{start}{dash}/>')


def tag(x, y, ids, kind):
    width = 13 + 7.6 * len(ids)
    return (rectangle(x, y, width, 21, '#ffffff', COLORS[kind], 5)
            + label(x + width / 2, y + 15, ids, f'id {kind}', 'middle'))


def card(x, y, width, height, title, lines, symbol, kind):
    return ''.join([
        rectangle(x, y, width, height, '#ffffff', '#cdd9e7', 11),
        icon(symbol, x + 13, y + 13, COLORS[kind]),
        label(x + 48, y + 25, title, 'card'),
        *(label(x + 14, y + 50 + i * 19, line, 'small') for i, line in enumerate(lines)),
    ])


def render_global_view():
    markers = ''.join(
        f'<marker id="{kind}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" '
        f'orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="{color}"/></marker>'
        for kind, color in COLORS.items()
    )
    colors = ''.join(f'.{kind}{{fill:{color}}}' for kind, color in COLORS.items())
    page = [f'''<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-labelledby="title description">
<title id="title">ChatISEN · Architecture globale</title>
<desc id="description">Déploiement observé sur une VM Compute Engine. À gauche, les deux navigateurs et les acteurs Ops et Admin. Au centre, le VPC, le pare-feu, Caddy, Node et le disque. Les services Push, CI et snapshots se trouvent à droite. Les flux F01 à F17 sont décrits dans la légende et dans le lecteur.</desc>
<defs>{markers}</defs>
<style>
text {{ font-family: Inter, "DejaVu Sans", Arial, sans-serif; fill:#162940; font-size:15px; }}
.title {{ font-size:37px; font-weight:750; letter-spacing:-.6px; }}
.subtitle {{ font-size:17px; fill:#465b72; }}
.section {{ font-size:14px; font-weight:750; letter-spacing:.9px; }}
.card {{ font-size:17px; font-weight:750; }}
.small {{ font-size:14px; fill:#344c66; }}
.micro {{ font-size:12.5px; fill:#3d536c; }}
.id {{ font-size:13px; font-weight:750; }}
{colors}
</style>''']
    add = page.append
    add(rectangle(0, 0, WIDTH, HEIGHT, '#f5f7fc', radius=0))
    add(rectangle(30, 25, 52, 52, '#2458cf', radius=15))
    add(icon('app', 41, 36, '#ffffff', 30))
    add(label(98, 53, 'ChatISEN · Architecture globale', 'title'))
    add(label(100, 81, 'Déploiement du jury · ia-pple.isen.fedyna.fr', 'subtitle'))
    add(rectangle(1167, 29, 402, 51, '#e7eefb', '#d4e1f5'))
    add(label(1368, 50, '1 VM Compute Engine · 1 IPv4 publique', 'section', 'middle'))
    add(label(1368, 69, 'Inventaire du 25 novembre 2026 · SHA app 9b08996', 'micro', 'middle'))

    # Boundaries distinguish clients, the cloud project, its zone and supporting services.
    add(rectangle(31, 108, 278, 633, '#ebf2ff', '#b7ccee', 17))
    add(rectangle(399, 108, 875, 633, '#f0ebfb', '#c8b6e9', 17))
    add(rectangle(416, 157, 841, 483, '#e9edfc', '#b8c3e8', 14))
    add(rectangle(630, 207, 611, 414, '#f5f2ff', '#bfb0e4', 14))
    add(rectangle(1308, 108, 261, 633, '#eef3f8', '#c7d5e2', 17))
    add(label(48, 137, 'ACTEURS ET NAVIGATEURS', 'section'))
    add(icon('googlecloud', 419, 118, '#2869d9', 27))
    add(label(455, 137, 'GOOGLE CLOUD · PROJET CHATISEN', 'section'))
    add(label(1229, 137, 'Compute Engine · Debian 13', 'small', 'end'))
    add(label(432, 183, 'VPC default → sous-réseau default · europe-west4 (Pays-Bas)', 'card'))
    add(label(1231, 183, '10.164.0.0/20 · passerelle 10.164.0.1', 'small', 'end'))
    add(label(647, 228, 'europe-west4-a · VM de démonstration', 'section'))
    add(label(647, 247, 'e2-custom-4-6144 · 4 vCPU / 6 Gio · IP privée 10.164.0.2', 'micro'))
    add(label(1325, 137, 'SERVICES ASSOCIÉS', 'section'))

    # Users and direct media.
    add(label(51, 174, 'User · membre ou enseignant', 'card'))
    add(label(51, 195, 'Compte ChatISEN et session locale', 'small'))
    add(card(48, 222, 244, 78, 'Navigateur A', ['Client JavaScript · WebRTC'], 'browser', 'web'))
    add(card(48, 355, 244, 78, 'Navigateur B', ['Même site · session indépendante'], 'browser', 'web'))
    add(arrow('M85 303V352', 'media', both=True))
    add(tag(103, 311, 'F09', 'media'))
    add(label(145, 326, 'Média P2P direct', 'small'))
    add(label(104, 345, 'ICE · DTLS-SRTP', 'micro'))
    add(card(48, 471, 244, 90, 'Ops · exploitation', ['Clé SSH · systemd et journaux', 'Consulte les contrôles F14'], 'terminal', 'ops'))
    add(card(48, 583, 244, 82, 'Admin · infrastructure', ['Console / API GCP · identité IAM'], 'shield', 'admin'))
    add(label(49, 698, 'User : le rôle owner est limité au groupe.', 'micro'))
    add(label(49, 719, 'L’accès IAM administre le projet GCP.', 'micro'))

    # DNS and STUN are outside the project. Place them near their source.
    add(rectangle(320, 153, 66, 56, '#ffffff', '#b7ccee', 8))
    add(icon('dns', 342, 159, COLORS['web'], 22))
    add(label(353, 196, 'DNS ISEN', 'micro', 'middle'))
    add(arrow('M326 260V213', 'web'))
    add(tag(338, 218, 'F01', 'web'))
    add(rectangle(320, 420, 66, 52, '#ffffff', '#acccd2', 8))
    add(icon('signal', 342, 425, COLORS['media'], 22))
    add(label(353, 459, 'STUN', 'micro', 'middle'))
    add(arrow('M326 395V416', 'media'))
    add(tag(340, 393, 'F08', 'media'))
    add(arrow('M292 260H326V286H429', 'web', both=True))
    add(arrow('M326 286V395H292', 'web'))
    add(tag(343, 265, 'F02', 'web'))

    # VPC, application and storage.
    add(rectangle(432, 258, 175, 317, '#ffffff', '#b8c3e8', 11))
    add(icon('shield', 449, 271, COLORS['admin']))
    add(label(482, 288, 'Pare-feu VPC', 'card'))
    add(label(447, 319, 'Entrée via nic0', 'small'))
    add(label(447, 340, 'IPv4 publique (valeur expurgée)', 'card'))
    add(label(447, 359, 'IPv4 réservée · Standard', 'micro'))
    add(label(447, 388, 'TCP 443 → HTTPS/WSS', 'small'))
    add(label(447, 409, 'TCP 80 → redirection', 'small'))
    add(label(447, 430, 'Règles web · P1000', 'micro'))
    add(label(447, 457, 'TCP 27028 autorisé', 'small'))
    add(label(447, 476, 'Aucune écoute VM', 'micro'))
    add(label(447, 509, 'TCP 22 → sshd', 'small'))
    add(label(447, 529, 'Règle SSH · P65534', 'micro'))
    add(label(447, 553, '8 règles VPC visibles', 'micro'))

    add(card(647, 268, 181, 108, 'Caddy 2.6.2', ['Terminaison TLS', 'Proxy HTTP / WSS', 'Sert /architecture/'], 'caddy', 'web'))
    add(arrow('M607 306H644', 'web', both=True))
    add(arrow('M828 306H913', 'web', both=True))
    add(tag(847, 279, 'F03', 'web'))
    add(label(871, 328, 'Loopback', 'micro', 'middle'))
    add(label(871, 345, ':3000', 'micro', 'middle'))

    add(rectangle(916, 268, 307, 177, '#ffffff', '#bdcee2', 11))
    add(icon('nodedotjs', 932, 281, COLORS['data']))
    add(label(967, 299, 'Node.js 24 · chatisen.service', 'card'))
    add(label(932, 324, '127.0.0.1:3000 · apps/standalone/server.mjs', 'micro'))
    add(label(932, 350, 'F03   Front statique · apps/web/public', 'small'))
    add(label(932, 371, 'F04   Session, cookie, CSRF, droits', 'small'))
    add(label(932, 392, 'F05   Direct, groupes et historique', 'small'))
    add(label(932, 413, 'F07 / F08   WS/SSE et signalisation SDP/ICE', 'small'))
    add(label(932, 433, 'F10   Notifications via push.mjs', 'small'))

    add(rectangle(647, 390, 181, 59, '#fff9f3', '#ead1ba', 9))
    add(label(661, 412, 'F14 · Sondes HTTPS', 'id ops'))
    add(label(661, 433, '/healthz · /readyz · /metrics', 'micro'))
    add(arrow('M737 390V378', 'ops'))

    add(card(647, 468, 181, 112, 'systemd / SSH', ['sshd · caddy · chatisen', 'Journaux et Ops Agent', 'Gestion des services'], 'terminal', 'ops'))
    add(arrow('M292 514H429', 'ops'))
    add(arrow('M607 514H644', 'ops'))
    add(tag(343, 487, 'F12', 'ops'))

    add(card(916, 489, 307, 110, 'Stockage JSON', ['/var/lib/chatisen/chatisen.json', 'Comptes, liens, messages, sessions, appels', 'ext4 · pd-balanced zonal · 10 Go'], 'disk', 'data'))
    add(arrow('M1059 445V486', 'data'))
    add(tag(1070, 454, 'F06', 'data'))

    # Admin control plane and external dependencies.
    add(card(737, 652, 501, 72, 'Console et API Google Cloud', ['IAM · VM · VPC · règles · stockage · consultation des coûts'], 'googlecloud', 'admin'))
    add(arrow('M292 625H361V686H734', 'admin'))
    add(tag(426, 659, 'F13', 'admin'))
    add(label(480, 674, 'HTTPS 443 · plan de contrôle', 'small'))

    add(card(1324, 161, 228, 67, 'F08 · STUN Google', ['stun.l.google.com:19302'], 'signal', 'media'))
    add(card(1324, 268, 228, 68, 'Web Push', ['HTTPS 443 · VAPID · chiffré'], 'bell', 'push'))
    add(arrow('M1223 314H1321', 'push'))
    add(tag(1249, 286, 'F10', 'push'))
    add(card(1324, 368, 228, 68, 'Service worker A ou B', ['Notification sur le poste'], 'browser', 'push'))
    add(arrow('M1438 336V365', 'push'))
    add(tag(1452, 341, 'F11', 'push'))

    add(card(1324, 489, 228, 109, 'Snapshots GCE', ['Multi-région eu', 'default-schedule-1 · quotidien', 'Deux copies observées'], 'disk', 'data'))
    add(arrow('M1223 534H1321', 'data'))
    add(tag(1249, 507, 'F15', 'data'))

    add(card(1324, 625, 228, 99, 'GitHub et Actions', ['F16 · PR → CI, build et tests', 'F17 · Déploie un SHA de main', 'Livraison manuelle par Ops'], 'github', 'ops'))
    add(arrow('M1241 601H1287V662H1321', 'ops'))
    add(tag(1248, 612, 'F17', 'ops'))

    # The legend is also useful when the SVG is exported to a slide.
    add(rectangle(31, 758, 1538, 114, '#ffffff', '#cdd9e7', 16))
    add(label(50, 784, 'LÉGENDE DES FLUX', 'section'))
    for (kind, title), x in zip([
        ('web', 'Web et signalisation'), ('media', 'Média / ICE'), ('data', 'Données / copies'),
        ('ops', 'Exploitation / Git'), ('admin', 'Administration IAM'), ('push', 'Notifications'),
    ], (50, 288, 480, 714, 965, 1234)):
        add(arrow(f'M{x} 809h25', kind))
        add(label(x + 35, 814, title, 'small'))
    add(label(50, 844, 'À présenter : entrée Web F01–F03  →  message F04–F07  →  appel F08–F09  →  exploitation et données F12–F17.', 'small'))
    add(label(50, 862, 'Entrée directe sur la VM. Caddy relaie vers un seul backend. Le lecteur détaille les flux, les sources des règles VPC et leur portée.', 'micro'))
    return '\n'.join([*page, '</svg>', ''])
