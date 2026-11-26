"""Component and package view of the modular monolith.

Modules are stacked by dependency depth: every import arrow points downwards, so the
drawing itself shows that the graph has no cycle. DEPENDENCIES is the single source of
those arrows and is checked for cycles at render time.
"""

from graphlib import TopologicalSorter

from svgkit import COLORS, arrow, lines, logo, markers, rect, stylesheet, text

WIDTH, HEIGHT = 2300, 1330

DEPENDENCIES = {
    "identity": (),
    "groups": ("identity",),
    "files": ("groups",),
    "calls": ("groups",),
    "messaging": ("groups", "files"),
    "quality": ("calls",),
    "notifications": ("groups", "identity"),
}

# name: x, y, width, height, scope, French title, responsibility, public port, schema, code today
MODULES = {
    "messaging": (90, 372, 430, 190, "MVP", "Messagerie",
                  ["Messages, ordre, historique, rattrapage", "Port public : MessageTimeline",
                   "Schéma SQL : messaging", "Code : apps/api (chat/) et démo"]),
    "quality": (720, 372, 430, 190, "V2 · étude", "Qualité d’appel",
                ["Mesures getStats(), indicateurs, export", "Port public : QualityReport",
                 "Schéma SQL : quality", "Code : table seule, aucune route"]),
    "notifications": (1250, 372, 400, 190, "MVP+", "Notifications",
                      ["Abonnements et envoi Web Push (VAPID)", "Consomme message.created et",
                       "call.invitation depuis l’outbox", "Schéma SQL : notifications",
                       "Code : démo (push.mjs), pas apps/api"]),
    "files": (90, 628, 430, 164, "V2", "Fichiers",
              ["Métadonnées, droits, URL signées", "Port public : FileCatalog",
               "Schéma SQL : files", "Code : à faire (Object Storage)"]),
    "calls": (720, 628, 430, 164, "MVP · conf. V2", "Appels",
              ["Cycle d’appel, signaux, identifiants ICE", "Port public : CallRegistry",
               "Schéma SQL : calls", "Code : démo (P2P), apps/api (jeton SFU)"]),
    "groups": (360, 858, 800, 160, "MVP", "Gestion de groupes et contrôle d’accès",
               ["Conversations privées et de groupe, membres, rôles owner / member (moderator en V2)",
                "Port public : AccessPolicy.assertMember() · assertRole()",
                "Schéma SQL : groups        Code : apps/api (chat/group-operations.ts) ; démo : création et retrait"]),
    "identity": (360, 1084, 800, 142, "MVP", "Identité et utilisateurs",
                 ["Comptes, profils, mots de passe Argon2id, sessions, rôle global (admin en V2)",
                  "Port public : SessionVerifier · UserDirectory",
                  "Schéma SQL : identity        Code : apps/api (identity/) et démo (scrypt)"]),
}


def module(name):
    x, y, w, h, scope, title, body = MODULES[name]
    later = scope.startswith("V2")
    parts = [rect(x, y, w, h, "#fff9ee" if later else "#ffffff", "#c08a2e" if later else "#3f68c4", 12,
                  width=1.8, dash="8 5" if later else ""),
             logo("fastify", x + 12, y + 10, 24),
             text(x + 44, y + 28, title, "card"),
             text(x + w - 12, y + 28, scope, "section", "end"),
             text(x + 14, y + 52, f"modules/{name}/", "mono"),
             lines(x + 14, y + 76, body, "micro", 20)]
    return "".join(parts)


def gateway():
    out = [rect(40, 130, 1680, 196, "#eef2fb", "#8d9ad0", 14),
           text(58, 158, "ADAPTATEURS ENTRANTS DE LA PLATEFORME · ils appellent les modules, jamais l’inverse", "zone")]
    boxes = [
        (58, "nginx", "Passerelle Nginx", ["TLS, limite de débit, taille des requêtes",
                                          "auth_request → /internal/auth/verify",
                                          "transmet X-User-Id, efface la valeur client"]),
        (470, "fastify", "REST /api/v1", ["Contrat openapi.yaml", "validation des corps JSON",
                                          "CSRF et origine sur les écritures"]),
        (882, "fastify", "WebSocket /api/v1/ws", ["Contrat asyncapi.yaml", "topics conversation:{id} et user:{id}",
                                                  "heartbeat 30 s · reprise afterSeq"]),
        (1294, "fastify", "Distributeur d’outbox", ["LISTEN / NOTIFY PostgreSQL",
                                                    "relit après commit, réessaie",
                                                    "réveille les 2 réplicas"]),
    ]
    for x, brand, title, body in boxes:
        out += [rect(x, 176, 396, 132, "#ffffff", "#8d9ad0", 10), logo(brand, x + 12, 186, 24),
                text(x + 44, 204, title, "card"), lines(x + 14, 232, body, "micro", 21)]
    out += [arrow("M454 242H470", "web")]
    return out


def arrows():
    return [
        arrow("M300 562V628", "web"),                    # messaging -> files
        arrow("M520 480H620V858", "web"),                # messaging -> groups
        arrow("M935 562V628", "web"),                    # quality -> calls
        arrow("M440 792V858", "web"),                    # files -> groups
        arrow("M935 792V858", "web"),                    # calls -> groups
        arrow("M1380 562V920H1160", "web"),              # notifications -> groups
        arrow("M1560 562V1150H1160", "web"),             # notifications -> identity
        arrow("M760 1018V1084", "web"),                  # groups -> identity
    ]


def platform():
    return [rect(40, 1246, 1680, 66, "#eef6f0", "#8bbd9f", 12),
            text(58, 1272, "NOYAU PARTAGÉ platform/ · aucune règle métier, chaque module peut l’utiliser", "zone"),
            text(58, 1296, "journal d’événements numérotés + outbox (schéma realtime) · pool PostgreSQL · "
                           "types des événements · configuration · logs JSON · métriques Prometheus", "micro")]


def hexagon():
    out = [rect(1750, 130, 520, 700, "#ffffff", "#7b8fd6", 14),
           text(1768, 160, "ANATOMIE D’UN MODULE · hexagonale", "zone")]
    layers = [
        ("#e9effd", "adapters/in", ["routes REST, handlers WebSocket,", "consommateurs d’événements"]),
        ("#f4f3fe", "application", ["cas d’usage : EnvoyerMessage,", "RetirerMembre, LancerAppel"]),
        ("#fff9e8", "domain", ["règles et objets métier,", "aucun import Fastify ni SQL"]),
        ("#f4f3fe", "ports/out", ["interfaces : Repository, PushSender,", "MediaServer, ObjectStore"]),
        ("#e9f6ee", "adapters/out", ["SQL du schéma du module, web-push,", "API LiveKit, Cloud Storage"]),
    ]
    for i, (tint, name, body) in enumerate(layers):
        y = 184 + i * 122
        out += [rect(1778, y, 464, 92, tint, "#8d9ad0", 10), text(1794, y + 27, name, "mono"),
                lines(1794, y + 53, body, "small", 21)]
    out += [arrow("M2010 276V306", "web"), arrow("M2010 398V428", "web"),
            arrow("M2010 520V550", "web"), arrow("M2010 672V642", "data", dashed=True),
            text(2022, 662, "implémente", "micro")]
    return out


def rules():
    return [rect(1750, 852, 520, 460, "#ffffff", "#9db0c4", 14),
            text(1768, 882, "RÈGLES DE DÉPENDANCE", "zone"),
            lines(1768, 912, [
                "1. Un module n’importe que la façade publique",
                "    (index.ts) d’un module placé plus bas.",
                "2. Aucune requête SQL sur le schéma d’un autre",
                "    module : on passe par son port.",
                "3. Pour « remonter », un module publie un",
                "    événement dans l’outbox.",
                "4. Aucune clé étrangère entre deux schémas.",
                "5. Contrôle en CI à ajouter : dépendances",
                "    (cycles interdits) et schémas SQL touchés.",
                "",
                "ÉCART AVEC LE CODE ACTUEL (à refactorer)",
                "• un seul PostgresRepository pour identité et chat",
                "• calls/ lit directement les tables des",
                "    conversations, membres et sessions",
                "• l’authentification est importée depuis identity/",
                "• tables et clés étrangères dans un seul schéma",
                "",
                "Évolution V3 : un module devient un service",
                "en gardant son schéma et son contrat.",
            ], "small", 21)]


def render_modules_view():
    TopologicalSorter(DEPENDENCIES).prepare()  # raises CycleError if a cycle is introduced
    for name, targets in DEPENDENCIES.items():
        for target in targets:
            if MODULES[target][1] <= MODULES[name][1]:
                raise ValueError(f"{name} -> {target} does not point downwards")
    page = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" '
        f'viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-labelledby="title">',
        '<title id="title">ChatISEN · Modules du monolithe et leurs dépendances</title>',
        f"<defs>{markers()}</defs>", stylesheet(),
        rect(0, 0, WIDTH, HEIGHT, "#f6f8fc", radius=0),
        text(40, 56, "Composants et packages · monolithe modulaire Fastify", "title"),
        text(42, 86, "Une seule application déployée, des modules isolés. Toutes les flèches d’import "
                     "descendent : le graphe n’a aucun cycle.", "subtitle"),
        arrow("M1750 76H1800", "web"), text(1812, 81, "A → B : A importe le port public de B", "small"),
        rect(1750, 96, 50, 18, "#fff9ee", "#c08a2e", 4, width=1.6, dash="6 4"),
        text(1812, 110, "module prévu en V2", "small"),
        text(58, 356, "MODULES MÉTIER modules/ · du plus dépendant (haut) au plus stable (bas)", "zone"),
    ]
    page += gateway()
    page += [module(name) for name in MODULES]
    page += arrows() + platform() + hexagon() + rules()
    page.append("</svg>")
    return "\n".join(page) + "\n"
