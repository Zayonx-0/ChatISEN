"""Conceptual data model in Merise notation: entities, associations and (min,max) cardinalities.

Technical tables (outbox, delivery attempts, media jobs, webhook receipts, idempotency
keys) are left to the logical model: they carry no business concept.
"""

import re
from html import escape

from svgkit import markers, rect, stylesheet, text

WIDTH, HEIGHT = 1980, 1485

TINTS = {"identity": "#dbe7ff", "groups": "#e8defa", "messaging": "#d8efdf", "files": "#fde9c8",
         "calls": "#d3eef0", "quality": "#f8dce8", "notifications": "#f6d9d4"}
LATER = {"files", "quality"}

# name: x, y, width, module, identifier, attributes
ENTITIES = {
    "ABONNEMENT PUSH": (80, 20, 240, "notifications", "id_abonnement",
                        ["adresse (endpoint)", "clé p256dh, secret auth", "créé_le"]),
    "SESSION": (80, 260, 240, "identity", "id_session",
                ["empreinte_jeton (SHA-256)", "expire_le", "révoquée_le"]),
    "UTILISATEUR": (80, 480, 320, "identity", "id_utilisateur",
                    ["identifiant (unique)", "nom_affiché", "hash_mot_de_passe", "rôle_global (V2)", "créé_le"]),
    "ÉVÉNEMENT": (860, 150, 300, "messaging", "numéro_seq (relatif)",
                  ["type", "contenu", "survenu_le"]),
    "MESSAGE": (1520, 150, 320, "messaging", "id_message",
                ["clé_client (anti-doublon)", "texte", "créé_le"]),
    "CONVERSATION": (860, 480, 300, "groups", "id_conversation",
                     ["type : privée ou groupe", "titre", "créée_le", "fermée_le"]),
    "FICHIER": (1520, 490, 320, "files", "id_fichier",
                ["nom, type_mime, taille", "empreinte SHA-256", "clé_objet, état"]),
    "APPEL": (860, 860, 300, "calls", "id_appel",
              ["mode : audio ou vidéo", "topologie : p2p ou sfu", "état", "créé_le, terminé_le"]),
    "MESURE QUALITÉ": (1520, 940, 320, "quality", "id_mesure",
                       ["début_de_fenêtre", "paquets reçus et perdus", "gigue_ms, rtt_ms",
                        "débit_kbps", "type_de_candidat"]),
}

# name: centre x, centre y, width, attributes carried by the association
ASSOCIATIONS = [
    ("RATTACHER", 200, 207, 150, []),
    ("OUVRIR", 200, 442, 130, []),
    ("ÊTRE MEMBRE", 630, 560, 210, ["rôle", "rejoint_le, quitté_le"]),
    ("ENVOYER", 940, 70, 140, []),
    ("JOURNALISER", 1010, 378, 170, []),
    ("MATÉRIALISER", 1340, 205, 180, []),
    ("CONTENIR", 1340, 330, 150, []),
    ("JOINDRE", 1680, 420, 140, []),
    ("PARTAGER", 1340, 560, 150, []),
    ("DÉPOSER", 940, 1300, 140, []),
    ("CONCERNER", 1010, 745, 160, []),
    ("LANCER", 630, 900, 130, []),
    ("PARTICIPER", 630, 1030, 190, ["état, rejoint_le, quitté_le"]),
    ("MESURER", 940, 1180, 140, []),
    ("PRODUIRE", 1340, 1010, 150, []),
]

# Orthogonal legs; every association is drawn over the junction of its two legs.
LINKS = [
    "M200 150V260", "M200 392V480",                                   # push - session - user
    "M400 560H860",                                                   # membership
    "M370 480V70H1680V150",                                           # send
    "M1010 480V280", "M1160 205H1520", "M1120 480V330H1520",          # journal, materialise, contain
    "M1680 350V490", "M1160 560H1520",                                # attach, share
    "M80 600H40V1300H1920V560H1840",                                  # upload
    "M1010 640V860",                                                  # concern
    "M330 660V900H860", "M240 660V1030H860",                          # start, take part
    "M150 660V1180H1520",                                             # measure
    "M1160 1010H1520",                                                # produce
]

# x, y, (min,max) next to the entity it qualifies
CARDINALITIES = [
    (212, 170, "1,1"), (212, 254, "0,n"),       # RATTACHER : abonnement, session
    (212, 414, "1,1"), (212, 474, "0,n"),       # OUVRIR : session, utilisateur
    (410, 550, "0,n"), (822, 550, "1,n"),       # ÊTRE MEMBRE
    (380, 466, "0,n"), (1692, 140, "1,1"),      # ENVOYER
    (1022, 474, "0,n"), (1022, 304, "(1,1) R"),  # JOURNALISER (identifiant relatif)
    (1170, 195, "0,1"), (1482, 195, "1,1"),     # MATÉRIALISER
    (1132, 456, "0,n"), (1482, 320, "1,1"),     # CONTENIR
    (1692, 370, "0,1"), (1692, 482, "0,1"),     # JOINDRE
    (1170, 550, "0,n"), (1482, 550, "1,1"),     # PARTAGER
    (44, 590, "0,n"), (1852, 550, "1,1"),       # DÉPOSER
    (1022, 664, "0,n"), (1022, 852, "1,1"),     # CONCERNER
    (342, 678, "0,n"), (822, 890, "1,1"),       # LANCER
    (252, 678, "0,n"), (822, 1020, "1,n"),      # PARTICIPER
    (162, 678, "0,n"), (1482, 1170, "1,1"),     # MESURER
    (1170, 1000, "0,n"), (1482, 1000, "1,1"),   # PRODUIRE
]


# Boxes are tall enough for every association leg to reach their border.
HEIGHTS = {"ABONNEMENT PUSH": 130, "SESSION": 132, "UTILISATEUR": 180, "ÉVÉNEMENT": 130, "MESSAGE": 200,
           "CONVERSATION": 160, "FICHIER": 150, "APPEL": 200, "MESURE QUALITÉ": 270}


def check_geometry():
    """Every leg must start and end on the border of an entity."""
    boxes = [(x, y, x + w, y + HEIGHTS[name]) for name, (x, y, w, *_) in ENTITIES.items()]
    for path in LINKS:
        points, px, py = [], 0, 0
        for command, values in re.findall(r"([MHV])([\d ]+)", path):
            numbers = [int(value) for value in values.split()]
            px, py = numbers if command == "M" else (numbers[0], py) if command == "H" else (px, numbers[0])
            points.append((px, py))
        for x, y in (points[0], points[-1]):
            if not any(left <= x <= right and top <= y <= bottom
                       and (x in (left, right) or y in (top, bottom))
                       for left, top, right, bottom in boxes):
                raise ValueError(f"MCD: {path} does not touch an entity at {(x, y)}")


def entity(name):
    x, y, w, module, identifier, attributes = ENTITIES[name]
    h = HEIGHTS[name]
    later = module in LATER
    out = [rect(x, y, w, h, "#ffffff", "#27405b", 6, width=1.6, dash="8 5" if later else ""),
           rect(x + 1, y + 1, w - 2, 32, TINTS[module], radius=5),
           text(x + w / 2, y + 23, name, "card", "middle"),
           f'<text x="{x + 14}" y="{y + 55}" class="small" text-decoration="underline" '
           f'font-weight="700">{escape(identifier)}</text>']
    out += [text(x + 14, y + 55 + 21 * (i + 1), value, "small") for i, value in enumerate(attributes)]
    return out


def association(name, cx, cy, width, attributes):
    height = 44 + 18 * len(attributes)
    top = cy - height / 2
    out = [rect(cx - width / 2, top, width, height, "#fffdf3", "#8a6d1d", 22, width=1.6, css="flow-label"),
           text(cx, top + 27, name, "section", "middle")]
    out += [text(cx, top + 46 + 18 * i, value, "micro", "middle") for i, value in enumerate(attributes)]
    return out


def cardinality(x, y, value):
    label = value if value.startswith("(") else f"{value}"
    width = 8 * len(label) + 8
    return [rect(x - 4, y - 14, width, 19, "#f6f8fc", radius=3), text(x, y, label, "mono")]


def render_mcd_view():
    check_geometry()
    body = [f'<path class="relation" d="{path}" fill="none" stroke="#3b556f" stroke-width="1.700"/>'
            for path in LINKS]
    for name in ENTITIES:
        body += entity(name)
    for spec in ASSOCIATIONS:
        body += association(*spec)
    for spec in CARDINALITIES:
        body += cardinality(*spec)
    legend = []
    x = 40
    for module, tint in TINTS.items():
        legend += [rect(x, 1450, 20, 16, tint, "#27405b", 3), text(x + 28, 1463, f"module {module}", "small")]
        x += 205
    page = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" '
        f'viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-labelledby="title">',
        '<title id="title">ChatISEN · Modèle conceptuel de données (Merise)</title>',
        f"<defs>{markers()}</defs>", stylesheet(),
        rect(0, 0, WIDTH, HEIGHT, "#f6f8fc", radius=0),
        text(40, 56, "MCD · Modèle conceptuel de données (Merise)", "title"),
        text(42, 86, "Entités, associations et cardinalités (min,max). Identifiant souligné. "
                     "(1,1) R : identifiant relatif à la conversation. Cadre pointillé : V2.", "subtitle"),
        '<g transform="translate(0 110)">', *body, "</g>",
        *legend,
        text(1520, 1463, "Tables techniques : voir le MLD (vue 4).", "small"),
        "</svg>",
    ]
    return "\n".join(page) + "\n"
