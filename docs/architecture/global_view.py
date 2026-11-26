"""Render the all-in-one presentation board of the target GCP architecture.

The board reads left to right: personas, browsers, Google Cloud, third parties.
Delivery sits under it, then the subject coverage, the key points and the legend.
Dedicated views (infrastructure, modules, MCD, contracts) detail each topic.
Every Txx label matches one row of the "Flux de la cible" table in dossier-architecture.md.
"""

from svgkit import (BADGES, COLORS, arrow, badge, badges, card, flow, icon, lines, logo, markers,
                    rect, stylesheet, text)

WIDTH, HEIGHT = 2760, 1760
LATER = {"stroke": "#c08a2e", "fill": "#fff9ee", "dash": "8 5"}  # planned for V2


def header():
    return [
        rect(24, 18, 62, 62, "#2458cf", radius=15),
        '<path transform="translate(37 31) scale(1.5)" fill="#fff" d="M12 2c1.8 5.5 4.5 8.2 10 10-5.5 1.8-8.2 4.5-10 '
        '10C10.2 16.5 7.5 13.8 2 12c5.5-1.8 8.2-4.5 10-10Z"/>',
        text(102, 52, "ChatISEN · Architecture cible GCP", "title"),
        text(104, 80, "React · Nginx · monolithe modulaire Fastify · PostgreSQL · coturn · LiveKit (V2)", "subtitle"),
        card(960, 14, 700, 86, "DNS public · zone isen.fedyna.fr (hébergé par l’ISEN)",
             ["ia-pple.isen.fedyna.fr → IP unique du load balancer",
              "2e nom à demander à l’ISEN pour TURN → IPv4 de coturn"], symbol="dns", step=18),
        rect(2140, 20, 596, 62, "#e8eefc", "#c3d2f3"),
        text(2438, 46, "CIBLE v2 · après la 2e revue (26/11)", "zone", "middle"),
        text(2438, 68, "Plein : MVP · orange pointillé : V2 · v1 et démo en annexe", "micro", "middle"),
    ]


def personas():
    out = [rect(24, 130, 350, 1145, "#eef2f8", "#c6d1e2", 16),
           icon("user", 40, 138, "#24415f", 24), text(72, 157, "PERSONAS", "zone")]

    def persona(y, h, letter, title, subtitle, body, tint):
        return [rect(36, y, 326, h, tint, BADGES[letter], 12, width=1.6),
                badge(342, y + 22, letter),
                text(50, y + 27, title, "card"),
                text(50, y + 47, subtitle, "micro"),
                lines(50, y + 74, body, "small", 20)]

    out += persona(172, 590, "U", "USER · membre ChatISEN ou jury", "Compte local ChatISEN · aucun SSO tiers", [], "#e6f2f6")
    journeys = [
        ("Ouvrir le site", "T01 → T02 → T03 → T04"),
        ("Se connecter", "T06 · détail ci-dessous"),
        ("Écrire en privé ou en groupe", "T05 → T07 écrit · T08 reçoit"),
        ("Appeler à deux : audio, vidéo", "T10 signal · T11 direct · T12 relais"),
        ("Être prévenu, onglet fermé", "T14 → T15 → service worker"),
        ("V2 : conférence, écran, fichiers", "T13 conférence · T22 fichiers"),
    ]
    for i, (what, how) in enumerate(journeys):
        out += [text(50, 245 + i * 43, what, "section"), text(50, 263 + i * 43, how, "small")]
    out += [rect(46, 498, 306, 256, "#ffffff", "#1c6e8c", 10),
            icon("key", 56, 505, "#1c6e8c", 22),
            text(86, 522, "AUTHENTIFICATION D’UN USER", "section"),
            lines(58, 546, [
                "1  POST /api/v1/sessions en HTTPS",
                "2  module identity vérifie Argon2id",
                "3  crée un jeton aléatoire, valable 24 h",
                "    en base : uniquement son SHA-256",
                "4  renvoie le cookie __Host-chatisen",
                "    Secure · HttpOnly · SameSite=Lax",
                "    + jeton CSRF pour chaque écriture",
                "5  Nginx fait vérifier la session",
                "    (auth_request) · groups : les droits",
                "6  logout : session révoquée en base",
            ], "micro", 21)]
    out += persona(780, 215, "A", "ADMIN · projet GCP", "Infrastructure, pas les conversations", [
        "Console et API en HTTPS + MFA", "T16 · IAM, VPC, pare-feu", "Budgets et rôles",
        "Moindre privilège par identité",
    ], "#f1e9fa")
    out += persona(1013, 249, "O", "OPS · équipe d’exploitation", "Livre, observe, restaure", [
        "git push et pull request → CI", "T19 · approuve le déploiement", "T16 · SSH et Grafana par IAP",
        "T17 · logs, métriques, alertes", "T21 · teste la restauration", "Aucun port SSH public",
    ], "#fbeae7")
    return out


def browser(y, letter, brand, product, provider):
    out = [rect(468, y, 296, 392, "#ffffff", "#7f9fe0", 12, width=1.6),
           logo(brand, 480, y + 10, 32),
           text(520, y + 25, f"Navigateur {letter}", "card"),
           text(520, y + 43, f"exemple : {product}", "micro"),
           logo("react", 482, y + 56, 22), text(512, y + 72, "SPA React (build Vite)", "small"),
           logo("webrtc", 482, y + 82, 22), text(512, y + 98, "API WebRTC du navigateur", "small"),
           icon("key", 482, y + 108, COLORS["web"], 21),
           text(512, y + 124, f"cookie de session {letter}", "small"),
           rect(480, y + 140, 272, 240, "#fbeef4", "#d98cae", 10),
           icon("bell", 490, y + 149, COLORS["push"], 22),
           text(520, y + 166, f"Service Worker {letter} · /sw.js", "card"),
           lines(492, y + 191, [
               "APIs : Service Worker, Push,",
               "Notifications",
               f"PushSubscription {letter} propre :",
               "   endpoint + clés p256dh / auth",
               "   créée avec la clé publique VAPID",
               "push → showNotification()",
               "   (muet si le chat est visible)",
               "notificationclick → ouvre le fil",
               "pushsubscriptionchange → réabonne",
               f"Fournisseur ici : {provider}",
           ], "micro", 19),
           badges(764, y, "U")]
    return out


def clients():
    out = [rect(456, 130, 320, 1145, "#e9effd", "#b4c5ee", 16),
           icon("browser", 470, 138, COLORS["web"], 24), text(502, 157, "CLIENTS", "zone")]
    out += browser(172, "A", "chrome", "Chrome", "FCM")
    out += browser(642, "B", "firefox", "Firefox", "Mozilla")
    out.append(card(468, 1048, 296, 214, "ICE · trouver un chemin", [
        "1. host : adresse locale",
        "2. srflx : vue par STUN (coturn)",
        "3. relay : TURN (coturn), seulement",
        "    si le direct est impossible",
        "ICE est la méthode suivie par les",
        "navigateurs, ce n’est pas un serveur",
        "Aucun STUN Google dans la cible",
    ], brand="webrtc", step=20, style="micro"))
    return out


def edge_column():
    return [
        card(990, 440, 190, 252, "Load balancer", [
            "External Application",
            "Load Balancer global",
            "1 seule IP publique web",
            "HTTPS / WSS : 443",
            "certificat géré GCP",
            "→ Nginx HTTPS 8443",
            "sondes /healthz-edge",
            "répartit zones a et b",
            "stateless : pas de",
            "session collante requise",
        ], symbol="balancer", who="UO", step=19, style="micro"),
        card(990, 718, 190, 112, "IAP + OS Login", [
            "tunnel TCP vers SSH 22",
            "identité Google + IAM",
            "aucune IP SSH publique",
        ], symbol="shield", kind="ops", who="O", step=18, style="micro"),
        card(990, 858, 190, 112, "IAM · API GCP", [
            "console et API en 443",
            "MFA, rôles séparés",
            "journaux d’audit",
        ], symbol="key", kind="admin", who="A", step=18, style="micro"),
    ]


def vpc():
    out = [rect(1222, 180, 862, 1090, "#e4e9fb", "#7b8fd6", 16, width=1.8),
           text(1240, 205, "VPC chatisen-cible · réseau global, sous-réseaux régionaux europe-west4", "zone")]
    # Firewall
    out += [rect(1236, 216, 834, 170, "#ffffff", "#b42318", 10, width=1.6),
            icon("firewall", 1248, 225, "#b42318", 24),
            text(1282, 243, "Pare-feu VPC · entrée refusée par défaut, seules ces ouvertures existent", "card"),
            lines(1250, 273, [
                "FW1  LB et sondes → VM app : TCP 8443",
                "         sources 35.191.0.0/16 · 130.211.0.0/22",
                "FW2  IAP → VM : TCP 22 · Grafana 3000",
                "FW3  supervision → VM : métriques",
                "FW4  Internet → coturn : UDP 3478 · TCP 5349",
            ], "small", 21),
            lines(1668, 273, [
                "FW5  Internet → coturn : UDP 49160–49200",
                "FW6 (V2)  SFU : UDP 7882 · TCP 7881, 7880",
                "Cloud SQL et Redis : IP privées seulement",
                "Fermés : SSH public, 5432, API 3000, 9090",
                "443 et 80 : frontal géré du LB, hors VPC",
            ], "small", 21)]
    return out


def module_tile(x, y, h, title, body, *, later=False):
    style = LATER if later else {"stroke": "#8d9ad0", "fill": "#ffffff", "dash": ""}
    return [rect(x, y, 196, h, style["fill"], style["stroke"], 8, width=1.5, dash=style["dash"]),
            text(x + 10, y + 22, title, "section"),
            lines(x + 10, y + 43, body, "micro", 18)]


def app_subnet():
    out = [rect(1243, 405, 834, 590, "#cfd6f3", "#8d9ad0", 12),
           rect(1236, 398, 834, 590, "#f4f3fe", "#8d79c9", 12, width=1.5),
           logo("debian", 1246, 405, 24),
           text(1276, 421, "SOUS-RÉSEAU APP 10.40.10.0/24 · 2 VM Compute Engine Debian 13 identiques", "section"),
           text(1276, 439, "APP-A (zone a) + APP-B (zone b) · MIG autoréparant · Docker Compose · sans IP publique",
                "micro"),
           badges(2066, 398, "O"),
           card(1248, 451, 396, 94, "Nginx · :8443 · passerelle", [
               "TLS · build React · auth_request · limite de débit",
               "relaie /api/v1 et la WebSocket → api:3000",
           ], brand="nginx", who="U", step=19, style="micro"),
           card(1690, 451, 368, 94, "Build React + Vite (dist/)", [
               "HTML · CSS · JS · sw.js",
               "copié dans l’image Nginx (pas un processus)",
           ], brand="react", step=19, style="micro"),
           arrow("M1644 498H1690", "web", dashed=True, head=False),
           rect(1246, 574, 814, 366, "#e9effd", "#3f68c4", 10, width=1.8),
           logo("fastify", 1256, 581, 24),
           text(1288, 599, "API ChatISEN · monolithe modulaire Fastify :3000 · 1 image, 1 processus par VM",
                "card"),
           badges(2052, 574, "U"),
           arrow("M1446 545V574", "web"),
           flow(1530, 560, ["T05 · REST + WSS"], "web", 130)]
    for x, title, body in (
        (1254, "identity · comptes", ["utilisateurs, sessions", "T06 · Argon2id",
                                       "jeton 24 h (SHA-256)", "cookie Secure HttpOnly",
                                       "CSRF sur les écritures", "schéma identity"]),
        (1455, "groups · groupes", ["gestion de groupes", "conversations, membres",
                                     "rôles owner · member", "V2 : moderator, audit",
                                     "contrôle d’accès", "schéma groups"]),
        (1656, "messaging", ["T07 · n° + message", "+ outbox : 1 transaction",
                             "historique, rattrapage", "anti-doublon clientId",
                             "privé et groupe", "schéma messaging"]),
        (1857, "calls · appels", ["à deux : audio, vidéo", "T10 · relaie SDP et ICE",
                                  "REST ↑ · WebSocket ↓", "identifiants TURN courts",
                                  "V2 : jeton de salle", "schéma calls"]),
    ):
        out += module_tile(x, 612, 150, title, body)
    out += module_tile(1254, 770, 108, "notifications", ["T14 · Web Push VAPID", "web-push 3.6.7",
                                                        "lit l’outbox · TTL 120 s"])
    out += module_tile(1455, 770, 108, "files · V2", ["partage de fichiers", "Object Storage",
                                                     "URL signées"], later=True)
    out += module_tile(1656, 770, 108, "quality · V2", ["indicateurs getStats()", "export pour l’étude",
                                                       "schéma quality"], later=True)
    out += module_tile(1857, 770, 108, "Temps réel", ["T08 · 1 WebSocket", "topics · heartbeat 30 s",
                                                     "reprise par afterSeq"])
    out += [rect(1254, 886, 799, 48, "#eef6f0", "#8bbd9f", 8),
            text(1264, 906, "Noyau partagé : journal d’événements + outbox · LISTEN/NOTIFY · pool SQL · "
                            "logs · /metrics :9091", "micro"),
            text(1264, 925, "Imports du haut vers le bas, sans cycle (vue 7) · aucune requête SQL sur le "
                            "schéma d’un autre module", "micro")]
    out += [rect(1248, 948, 400, 32, "#ffffff", "#8bbd9f", 8),
            icon("disk", 1256, 953, COLORS["data"], 21),
            text(1284, 969, "Cloud SQL Auth Proxy sur chaque VM · mTLS", "micro")]
    return out


def media_subnet():
    out = [rect(1236, 1000, 614, 258, "#e6f4f5", "#4f9ea5", 12, width=1.5),
           text(1250, 1022, "SOUS-RÉSEAU MÉDIA 10.40.20.0/24 · IPv4 publiques", "section"),
           card(1248, 1034, 290, 186, "coturn · STUN + TURN", [
               "VM dédiée, zone a · MVP",
               "T12 · STUN : UDP 3478",
               "TURN : UDP 3478 · TLS 5349",
               "certificat public (ACME)",
               "relais UDP 49160–49200",
               "identifiants courts, quotas",
               "remplace le STUN Google",
           ], symbol="relay", kind="media", who="U", step=19, style="micro")]
    for x, letter, zone in ((1546, "A", "a"), (1696, "B", "b")):
        out.append(card(x, 1034, 146, 186, f"SFU {letter} · V2", [
            f"LiveKit, zone {zone}",
            "T13 · conférence",
            "UDP 7882",
            "secours TCP 7881",
            "API 7880 privée",
            "1 salle = 1 nœud",
            "E2EE en option",
        ], symbol="sfu", kind="media", step=19, style="micro", **LATER))
    out += [rect(1860, 1000, 210, 258, "#fbefe6", "#c9936b", 12, width=1.5),
            text(1872, 1022, "OPS 10.40.30.0/24", "section"),
            card(1868, 1034, 194, 186, "Supervision", [
                "Prometheus + Grafana",
                "T17 · métriques des",
                "VM toutes les 15 s",
                "Grafana via IAP seul",
                "journaux : Cloud",
                "Logging",
            ], symbol="chart", kind="ops", who="O", step=19, style="micro")]
    return out


def managed_column():
    return [
        text(2140, 205, "SERVICES MANAGÉS GCP", "zone"),
        text(2140, 224, "hors sous-réseaux · accès privé", "micro"),
        card(2140, 262, 316, 124, "Cloud Storage · V2", [
            "Object Storage privé, europe-west4",
            "T22 · le navigateur envoie et lit",
            "les fichiers par URL signée,",
            "sans passer par les VM",
        ], symbol="disk", kind="data", step=19, style="micro", **LATER),
        card(2140, 470, 316, 252, "Cloud SQL · PostgreSQL 17", [
            "HA régionale : primaire + secours",
            "IP privée (Private Service Access)",
            "1 schéma par module :",
            "identity, groups, messaging,",
            "calls, notifications, realtime",
            "(files et quality en V2)",
            "aucune FK entre deux schémas",
            "MCD et MLD : vues 8 et 4",
        ], brand="postgresql", who="O", step=19, style="micro"),
        card(2140, 750, 316, 66, "Cloud SQL Backups + PITR", [
            "automatiques · stockage multi-région eu",
        ], symbol="disk", kind="data", step=18, style="micro"),
        card(2140, 876, 316, 78, "Cloud Logging", [
            "journaux centralisés des VM et du LB", "alertes sur les erreurs",
        ], symbol="chart", kind="ops", who="O", step=18, style="micro"),
        card(2140, 966, 316, 62, "Secret Manager", [
            "VAPID, CSRF, secret TURN, clés LiveKit",
        ], symbol="key", kind="ops", step=18, style="micro"),
        card(2140, 1040, 316, 62, "Cloud NAT", [
            "seule sortie Internet des VM app",
        ], symbol="nat", kind="ops", step=18, style="micro"),
        card(2140, 1124, 316, 96, "Memorystore Redis · V2", [
            "coordonne les 2 SFU LiveKit", "inutile pour le MVP",
        ], brand="redis", step=19, style="micro", **LATER),
    ]


def third_parties():
    out = [rect(2512, 130, 224, 1090, "#f9edf3", "#d98cae", 14),
           text(2526, 156, "SERVICES TIERS", "zone"),
           text(2526, 178, "Web Push, hors GCP", "micro")]
    providers = [
        ("firebase", "Google FCM", ["Chrome, Android", "fcm.googleapis.com"]),
        ("mozilla", "Mozilla Push", ["Firefox", "updates.push.services", ".mozilla.com"]),
        ("apple", "Apple Push", ["Safari macOS / iOS", "web.push.apple.com"]),
        ("windows", "Windows WNS", ["Edge sur Windows", "*.notify.windows.com"]),
    ]
    for i, (brand, title, body) in enumerate(providers):
        out.append(card(2522, 430 + i * 116, 204, 106, title, body, brand=brand, step=18, style="micro"))
    out.append(lines(2526, 926, [
        "Le navigateur impose son",
        "fournisseur : l’adresse est",
        "dans sa PushSubscription.",
        "Le fournisseur voit l’adresse",
        "et l’horaire, pas le contenu.",
    ], "micro", 19))
    return out


def delivery():
    out = [rect(24, 1312, 922, 148, "#fff4ea", "#e0b48c", 15),
           logo("github", 372, 1320, 26), text(408, 1339, "CI / CD · GITHUB (tiers, hors GCP)", "zone"),
           card(40, 1352, 250, 96, "Dépôt GitHub", [
               "pull request → main protégé",
               "versions taguées",
           ], brand="github", who="O", step=18, style="micro"),
           card(346, 1352, 262, 96, "GitHub Actions · CI", [
               "types · build · tests · Playwright",
               "audit · Trivy · images Docker",
           ], brand="actions", step=18, style="micro"),
           card(664, 1352, 268, 96, "GitHub Actions · CD", [
               "environnement protégé + approbation",
               "OIDC / WIF : aucune clé JSON",
           ], brand="actions", who="O", step=18, style="micro"),
           arrow("M290 1400H346", "ops"), arrow("M608 1400H664", "ops"),
           card(1092, 1340, 300, 92, "Artifact Registry", [
               "images Docker · europe-west4",
               "immuables, désignées par digest",
           ], brand="gcp", step=18, style="micro"),
           card(1560, 1340, 330, 92, "Cloud Run Job · migration", [
               "relié au VPC → Cloud SQL privé",
               "rôle dédié · échec = CD arrêté",
           ], brand="gcp", step=18, style="micro"),
           card(2060, 1340, 394, 92, "Déploiement Compute Engine (MIG)", [
               "nouveau modèle d’instance avec le digest",
               "canari APP-A → santé OK → APP-B · rollback",
           ], brand="gcp", step=18, style="micro"),
           text(2092, 1328, "LIVRAISON DANS GCP : GitHub pousse, GCP applique", "section")]
    return out








COVERAGE = (
    ("SOCLE OBLIGATOIRE · MVP", (
        ("Authentification et utilisateurs", "démo", "data"),
        ("Messagerie privée et de groupe", "démo", "data"),
        ("Temps réel et historique", "démo", "data"),
        ("Appel audio à deux", "démo (STUN Google)", "data"),
        ("Appel vidéo à deux", "démo (STUN Google)", "data"),
        ("Déploiement et supervision", "démo en CD · Grafana local", "ops"),
    )),
    ("EXTENSIONS", (
        ("Conférences vidéo à plusieurs", "V2 · SFU LiveKit", "ops"),
        ("Partage de fichiers", "V2 · Object Storage", "ops"),
        ("Partage d’écran", "V2 · getDisplayMedia", "ops"),
        ("Reprise de connexion", "WS : codée · ICE : V2", "web"),
        ("Indicateurs de qualité", "V2 · getStats()", "ops"),
        ("Contrôle d’accès avancé", "rôles codés · admin V2", "web"),
        ("Scalabilité et disponibilité", "cible : 2 VM, SQL HA", "ops"),
    )),
    ("TRAVAIL D’INVESTIGATION", (
        ("Tests de charge et performance", "à faire · k6", "ops"),
        ("Analyse de la qualité des appels", "à faire · getStats()", "ops"),
        ("Optimisation des ressources", "à faire · CPU et coût", "ops"),
        ("Tests de sécurité", "partiel · ZAP à faire", "web"),
        ("Analyse de données", "amorce · study.py", "web"),
        ("Preuve de concept IA", "proposée · anomalies", "ops"),
    )),
)


def coverage():
    out = [rect(24, 1478, 1650, 262, "#ffffff", "#8bbd9f", 14),
           text(40, 1505, "COUVERTURE DU SUJET · « Expected Project Scope »", "zone"),
           text(1658, 1505, "vert : en ligne · bleu : codé en tout ou partie, non déployé · orange : à faire",
                "micro", "end")]
    for column, (title, rows) in enumerate(COVERAGE):
        x = 40 + column * 546
        out.append(rect(x - 4, 1517, 534, 26, "#eef2f8", radius=5))
        out.append(text(x + 4, 1535, title, "section"))
        for i, (what, state, kind) in enumerate(rows):
            y = 1566 + i * 26
            out += [text(x + 4, y, what, "small"), text(x + 522, y, state, f"id {kind}", "end")]
    return out


def key_points():
    return [rect(1690, 1478, 766, 262, "#ffffff", "#9db0c4", 14),
            text(1706, 1505, "POINTS CLÉS À DÉFENDRE", "zone"),
            lines(1706, 1533, [
                "• Monolithe modulaire : 1 image à livrer en 3 semaines, modules isolés et sans cycle.",
                "• 1 schéma par module : un module pourra devenir un service avec sa base (V3).",
                "• Appel à deux en pair-à-pair : le média ne charge pas les VM. SFU en conférence.",
                "• SPOF restant : coturn unique (et DNS ISEN). API sur 2 zones, SQL en HA.",
                "• Le MIG remplace une VM en panne. Kubernetes (GKE) reste une évolution.",
                "• TLS dès que le trafic sort d’une VM. Certificats publics : GCP et ACME.",
                "• Contrats écrits avant le code : OpenAPI (REST) et AsyncAPI (WebSocket).",
                "• STUN/TURN maison : région et données maîtrisées ; coût VM + IP + trafic.",
                "• RGPD : données en europe-west4. DNS, LB, GitHub et Push à documenter.",
                "• Budget à chiffrer. Repli : 1 VM app, SQL zonal, ni SFU ni Redis.",
            ], "small", 21)]


def legend():
    out = [rect(2472, 1262, 264, 478, "#ffffff", "#9db0c4", 14),
           text(2488, 1290, "LÉGENDE", "zone")]
    entries = [("web", "Web · REST · WSS"), ("media", "Média · ICE"), ("data", "Données"),
               ("ops", "Ops et livraison"), ("admin", "Administration"), ("push", "Web Push")]
    for i, (kind, title) in enumerate(entries):
        y = 1318 + i * 30
        out += [arrow(f"M2488 {y}H2530", kind), text(2542, y + 5, title, "small")]
    out += [arrow("M2488 1506H2530", "web", dashed=True), text(2542, 1511, "retour ou asynchrone", "small")]
    for i, (letter, title) in enumerate((("U", "chemin utilisé par User"), ("O", "accès Ops"),
                                         ("A", "accès Admin"))):
        y = 1548 + i * 32
        out += [badge(2500, y, letter), text(2542, y + 5, title, "small")]
    out += [rect(2488, 1634, 42, 18, LATER["fill"], LATER["stroke"], 4, width=1.5, dash="6 4"),
            text(2542, 1648, "prévu en V2", "small")]
    out.append(lines(2488, 1674, [
        "Txx = flux nommé. Protocole,",
        "port, données et test dans",
        "le tableau sous la planche.",
    ], "micro", 18))
    return out


def connections():
    """Arrows between zones, drawn above the blocks, followed by their names."""
    paths = [
        # Personas
        arrow("M362 268H468", "web"), arrow("M362 738H468", "web"),
        arrow("M362 880H414V1286H964V914H990", "admin"),
        arrow("M362 1100H396V1298H946V774H990", "ops"),
        arrow("M165 1262V1352", "ops"),
        # DNS and web entry
        arrow("M752 130V57H960", "web", dashed=True),
        arrow("M764 244H864V516H990", "web", both=True),
        arrow("M764 690H864V516", "web", head=False),
        arrow("M990 622H900V286H764", "web", dashed=True),
        arrow("M900 622V752H764", "web", dashed=True),
        arrow("M1180 498H1248", "web"),
        # Push wake-up
        arrow("M2512 592H2494V116H806V456H764", "push", dashed=True),
        arrow("M806 456V926H764", "push", dashed=True),
        # Media: direct between A and B, relayed by coturn, or through the SFU in V2
        arrow("M520 564V642", "media", both=True),
        arrow("M764 1126H1248", "media", both=True),
        arrow("M764 1240H1769V1220", "media", both=True, dashed=True),
        arrow("M1619 1240V1220", "media", dashed=True),
        # Admission, data, operations
        arrow("M1769 940V1034", "media", dashed=True),
        arrow("M2040 1000V988", "ops", dashed=True),
        arrow("M2058 662H2140", "data", both=True),
        arrow("M2298 722V750", "data"),
        arrow("M2058 851H2512", "push"),
        arrow("M2070 915H2140", "ops"),
        arrow("M1180 774H1236", "ops"),
        # Delivery
        arrow("M932 1382H1092", "ops"),
        arrow("M932 1424H1020V1448H1725V1432", "ops"),
        arrow("M1890 1386H2060", "ops"),
        arrow("M1300 1340V1270", "ops", dashed=True),
        arrow("M2074 1340V1300H2010V1270", "ops"),
    ]
    labels = [
        flow(856, 57, ["T01 · DNS"], "web", 84),
        flow(864, 392, ["T02 ⇄", "HTTPS · WSS", "REST · 443"], "web", 100),
        flow(888, 718, ["T04", "build React", "+ /sw.js"], "web", 92),
        flow(1202, 470, ["T03", ":8443"], "web", 50),
        flow(640, 603, ["T11 · média direct A ⇄ B", "appel à deux · DTLS-SRTP"], "media", 196),
        flow(1590, 116, ["T15 · Web Push : le fournisseur réveille le service worker A ou B"], "push", 440),
        flow(1010, 1100, ["T12 · STUN / TURN", "UDP 3478 · TLS 5349"], "media", 150),
        flow(1010, 1212, ["T13 · V2 · conférence via SFU", "UDP 7882 · secours TCP 7881"], "media", 200),
        flow(1862, 982, ["T13 · jeton de salle (V2)"], "media", 168),
        flow(2111, 634, ["T09", "SQL"], "data", 44),
        flow(2388, 736, ["T21 · sauvegarde"], "data", 126),
        flow(2300, 851, ["T14 · HTTPS 443 via Cloud NAT · VAPID"], "push", 270),
        flow(2111, 915, ["T17"], "ops", 40),
        flow(1208, 748, ["T16", "SSH"], "ops", 42),
        flow(964, 1040, ["T16", "IAM"], "admin", 36),
        flow(928, 950, ["T16", "SSH"], "ops", 36),
        flow(1020, 1382, ["T18", "push images"], "ops", 92),
        flow(1475, 1448, ["T19 · lance la migration"], "ops", 170),
        flow(1975, 1386, ["T19 · puis"], "ops", 82),
        flow(1386, 1296, ["T20 · pull par digest"], "ops", 142),
        flow(1892, 1296, ["T19 · met à jour APP-A puis APP-B"], "ops", 224),
    ]
    return paths + labels


def render_global_view():
    page = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" '
        f'viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-labelledby="title description">',
        '<title id="title">ChatISEN · Architecture cible GCP</title>',
        '<desc id="description">Personas User, Admin et Ops, deux navigateurs React avec leur service worker et '
        'leur média direct, load balancer, VPC et pare-feu, Nginx et un monolithe modulaire Fastify sur deux '
        'zones, PostgreSQL, coturn, supervision, extensions V2, fournisseurs Web Push, livraison par GitHub '
        'Actions et couverture du sujet.</desc>',
        f"<defs>{markers()}</defs>",
        stylesheet(),
        rect(0, 0, WIDTH, HEIGHT, "#f6f8fc", radius=0),
        # Google Cloud frame, below everything it contains
        rect(976, 130, 1496, 1332, "#f1ecfb", "#9a7fd1", 20, width=1.8),
        logo("gcp", 992, 140, 30),
        text(1030, 162, "GOOGLE CLOUD · PROJET CHATISEN", "zone"),
        rect(1752, 138, 322, 32, "#ffffff", "#9a7fd1", 7),
        text(1913, 159, "europe-west4 (Pays-Bas) · zones a et b", "section", "middle"),
    ]
    for part in (header, personas, clients, edge_column, vpc, app_subnet, media_subnet, managed_column,
                 third_parties, delivery, coverage, key_points, legend, connections):
        page.extend(part())
    page.append("</svg>")
    return "\n".join(page) + "\n"
