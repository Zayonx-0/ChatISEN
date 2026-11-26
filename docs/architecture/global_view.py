"""Render the presentation board of the target GCP architecture.

The board reads left to right: personas, browsers, Google Cloud, third parties.
Delivery sits under it, then the relational model, the key points and the legend.
Every Txx label matches one row of the "Flux de la cible" table in architecture-cible.md.
"""

from svgkit import (BADGES, COLORS, arrow, badge, badges, card, flow, icon, lines, logo, markers,
                    rect, stylesheet, text)

WIDTH, HEIGHT = 2760, 1760


def header():
    return [
        rect(24, 18, 62, 62, "#2458cf", radius=15),
        '<path transform="translate(37 31) scale(1.5)" fill="#fff" d="M12 2c1.8 5.5 4.5 8.2 10 10-5.5 1.8-8.2 4.5-10 '
        '10C10.2 16.5 7.5 13.8 2 12c5.5-1.8 8.2-4.5 10-10Z"/>',
        text(102, 52, "ChatISEN · Architecture cible GCP", "title"),
        text(104, 80, "React · Nginx · 4 microservices Fastify · PostgreSQL · LiveKit · coturn", "subtitle"),
        card(960, 14, 700, 86, "DNS public · zone isen.fedyna.fr (hébergé par l’ISEN)",
             ["ia-pple.isen.fedyna.fr → IP unique du load balancer",
              "2e nom à demander à l’ISEN pour TURN → IPv4 de coturn"], symbol="dns", step=18),
        rect(2140, 20, 596, 62, "#e8eefc", "#c3d2f3"),
        text(2438, 46, "ARCHITECTURE CIBLE · 26 novembre 2026", "zone", "middle"),
        text(2438, 68, "À mettre en œuvre · la démo du 25/11 reste consultable en annexe", "micro", "middle"),
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
        ("Appeler : audio, vidéo, écran", "T10 admet · T11 média · T12 relais"),
        ("Être prévenu, onglet fermé", "T14 → T15 → service worker"),
    ]
    for i, (what, how) in enumerate(journeys):
        out += [text(50, 246 + i * 49, what, "section"), text(50, 265 + i * 49, how, "small")]
    out += [rect(46, 488, 306, 264, "#ffffff", "#1c6e8c", 10),
            icon("key", 56, 496, "#1c6e8c", 22),
            text(86, 513, "AUTHENTIFICATION D’UN USER", "section"),
            lines(58, 538, [
                "1  POST /api/v1/auth/login en HTTPS",
                "2  svc-identity compare avec Argon2id",
                "3  crée un jeton aléatoire, valable 24 h",
                "    en base : uniquement son SHA-256",
                "4  renvoie le cookie __Host-chatisen",
                "    Secure · HttpOnly · SameSite=Lax",
                "    + jeton CSRF pour chaque écriture",
                "5  chaque service relit la session,",
                "    puis le droit sur la conversation",
                "6  logout : session révoquée en base",
            ], "micro", 21)]
    out += persona(780, 215, "A", "ADMIN · projet GCP", "Infrastructure, pas les conversations", [
        "Console et API en HTTPS + MFA", "T16 · IAM, VPC, pare-feu", "Budgets et rôles",
        "Moindre privilège par identité",
    ], "#f1e9fa")
    out += persona(1013, 249, "O", "OPS · équipe d’exploitation", "Livre, observe, restaure", [
        "git push et pull request → CI", "T19 · approuve le déploiement", "T16 · SSH par IAP + OS Login",
        "T17 · logs, métriques, alertes", "T21 · teste la restauration", "Aucun port SSH public",
    ], "#fbeae7")
    return out


def browser(y, letter, brand, product, provider):
    out = [rect(468, y, 296, 392, "#ffffff", "#7f9fe0", 12, width=1.6),
           logo(brand, 480, y + 10, 32),
           text(520, y + 25, f"Navigateur {letter}", "card"),
           text(520, y + 43, f"exemple : {product}", "micro"),
           logo("react", 482, y + 56, 22), text(512, y + 72, "SPA React (build Vite)", "small"),
           logo("webrtc", 482, y + 82, 22), text(512, y + 98, "livekit-client · WebRTC", "small"),
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
    out += [rect(468, 576, 296, 54, "#ffffff", "#b4c5ee", 8),
            text(616, 598, "A et B : même build, même origine,", "micro", "middle"),
            text(616, 617, "mais 2 sessions et 2 abonnements", "micro", "middle")]
    out += browser(642, "B", "firefox", "Firefox", "Mozilla")
    out.append(card(468, 1048, 296, 214, "ICE · WebRTC de A et B", [
        "Le navigateur teste les chemins :",
        "1. host : adresse locale",
        "2. srflx : vue par STUN (coturn)",
        "3. relay : via TURN si l’UDP direct",
        "    vers la SFU est bloqué",
        "Média chiffré DTLS-SRTP",
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
            "80 → redirigé en 443",
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
                "FW1  LB et sondes → VM app : TCP 8080",
                "         sources 35.191.0.0/16 · 130.211.0.0/22",
                "FW2  IAP 35.235.240.0/20 → VM : TCP 22",
                "FW3  sous-réseau app → SFU : TCP 7880",
                "FW4  Internet → SFU : UDP 7882 · TCP 7881",
            ], "small", 21),
            lines(1668, 273, [
                "FW5  Internet → coturn : UDP 3478 · TCP 5349",
                "FW6  IP des SFU → coturn : UDP 49160–49200",
                "Cloud SQL et Redis : IP privées seulement",
                "Fermés : SSH public, 3389, 5432, 3001–3004",
                "443 et 80 : frontal géré du LB, hors VPC",
            ], "small", 21)]
    return out


def app_subnet():
    out = [rect(1243, 405, 834, 590, "#cfd6f3", "#8d9ad0", 12),
           rect(1236, 398, 834, 590, "#f4f3fe", "#8d79c9", 12, width=1.5),
           logo("debian", 1246, 405, 24),
           text(1276, 421, "SOUS-RÉSEAU APP 10.40.10.0/24 · 2 VM Compute Engine Debian 13 identiques", "section"),
           text(1276, 439, "APP-A (zone a) + APP-B (zone b) · MIG · Docker Compose · sans IP publique", "micro"),
           badges(2066, 398, "O"),
           card(1248, 451, 396, 94, "Nginx · front statique + reverse proxy", [
               ":8080 · sert /, les assets et /sw.js",
               "/api/v1/* → service selon le chemin · /livekit/ → SFU",
           ], brand="nginx", who="U", step=19, style="micro"),
           card(1690, 451, 368, 94, "Build React + Vite (dist/)", [
               "HTML · CSS · JS · sw.js",
               "copié dans l’image Nginx (pas un processus)",
           ], brand="react", step=19, style="micro"),
           arrow("M1644 498H1690", "web", dashed=True, head=False),
           # Routing bus towards the four services
           arrow("M1446 545V561H1860V576", "web"),
           arrow("M1446 561V576", "web"),
           arrow("M1653 561V750H1446V765", "web"),
           arrow("M1653 750H1860V765", "web"),
           flow(1750, 561, ["T05 · REST /api/v1"], "web", 134)]
    services = [
        (1248, 576, "svc-identity · Fastify :3001", "U", [
            "/auth/register · /auth/login · /auth/logout · /me",
            "T06 · mot de passe vérifié par Argon2id",
            "session opaque 24 h · SHA-256 du jeton en base",
            "cookie __Host-chatisen Secure HttpOnly Lax",
            "écritures protégées par jeton CSRF (HMAC)",
            "écrit : identity.users, identity.sessions",
        ]),
        (1660, 576, "svc-chat · Fastify :3002", "U", [
            "REST /conversations, /messages, /members",
            "WSS /api/v1/ws · /events?afterSeq · fichiers",
            "T07 · 1 transaction : n° + message + outbox",
            "T08 · LISTEN/NOTIFY puis envoi sur la socket",
            "contrôle session + membre actif du fil",
            "écrit : schéma chat",
        ]),
        (1248, 765, "svc-calls · Fastify :3003", "U", [
            "/conversations/{id}/calls",
            "/calls/{id}/join · /calls/{id}/end",
            "T10 · jeton LiveKit court (1 salle, 1 membre)",
            "identifiants TURN temporaires",
            "webhooks SFU · expulsion si droit retiré",
            "écrit : schéma media",
        ]),
        (1660, 765, "svc-notify · Fastify + worker :3004", "U", [
            "/push/config · /push/subscriptions",
            "worker : lit chat.outbox, réessaie, dédoublonne",
            "librairie web-push 3.6.7 · signature VAPID",
            "T14 · payload chiffré · TTL 120 s",
            "réponse 404 / 410 → abonnement supprimé",
            "écrit : schéma notify",
        ]),
    ]
    for x, y, title, who, body in services:
        out.append(card(x, y, 398, 172, title, body, brand="fastify", who=who, step=19, style="micro"))
    out += [rect(1248, 948, 400, 32, "#ffffff", "#8bbd9f", 8),
            icon("disk", 1256, 953, COLORS["data"], 21),
            text(1284, 969, "Cloud SQL Auth Proxy sur chaque VM · TLS 3307", "micro")]
    return out


def media_subnet():
    out = [rect(1236, 1000, 834, 258, "#e6f4f5", "#4f9ea5", 12, width=1.5),
           text(1250, 1022, "SOUS-RÉSEAU MÉDIA 10.40.20.0/24 · IPv4 publiques (ICE)", "section"),
           card(1250, 1034, 322, 186, "coturn · STUN + TURN", [
               "VM Compute Engine dédiée, zone a",
               "T12 · STUN Binding : UDP 3478",
               "TURN : UDP 3478 · TURN/TLS : TCP 5349",
               "certificat TLS public (ACME)",
               "relais UDP 49160–49200 vers les SFU",
               "identifiants courts + quotas",
               "auto-hébergé : remplace STUN Google",
           ], symbol="relay", kind="media", who="U", step=19, style="micro")]
    for x, letter, zone in ((1640, "A", "a"), (1857, "B", "b")):
        out.append(card(x, 1034, 205, 186, f"LiveKit SFU {letter}", [
            f"VM · zone {zone}",
            "T11 · UDP 7882 (mux)",
            "secours : TCP 7881",
            "signal 7880 privé",
            "reçoit et redistribue",
            "les pistes des membres",
            "1 salle = 1 seul nœud",
        ], symbol="sfu", kind="media", who="U", step=19, style="micro"))
    return out


def managed_column():
    return [
        text(2140, 205, "SERVICES MANAGÉS GCP", "zone"),
        text(2140, 224, "hors sous-réseaux · accès privé", "micro"),
        card(2140, 470, 316, 252, "Cloud SQL · PostgreSQL 17", [
            "HA régionale : primaire + secours",
            "IP privée (Private Service Access)",
            "4 schémas, 1 rôle d’écriture chacun",
            "identity : users, sessions",
            "chat : conversations, members,",
            "    events, messages, attachments,",
            "    outbox",
            "media : calls, participants, jobs",
            "notify : subscriptions, deliveries",
            "clés étrangères + transactions",
        ], brand="postgresql", who="O", step=19, style="micro"),
        card(2140, 750, 316, 66, "Cloud SQL Backups + PITR", [
            "automatiques · stockage multi-région eu",
        ], symbol="disk", kind="data", step=18, style="micro"),
        card(2140, 876, 316, 78, "Cloud Logging + Monitoring", [
            "logs expurgés · métriques · alertes",
            "sondes de disponibilité",
        ], symbol="chart", kind="ops", who="O", step=18, style="micro"),
        card(2140, 966, 316, 62, "Secret Manager", [
            "VAPID, CSRF, clés LiveKit et TURN",
        ], symbol="key", kind="ops", step=18, style="micro"),
        card(2140, 1040, 316, 62, "Cloud NAT", [
            "seule sortie Internet des VM app",
        ], symbol="nat", kind="ops", step=18, style="micro"),
        card(2140, 1124, 316, 96, "Memorystore Redis Standard", [
            "IP privée · TLS + AUTH",
            "annuaire des nœuds et des salles LiveKit",
        ], brand="redis", step=19, style="micro"),
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
               "construit les images Docker",
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


def entity(x, y, name, keys, tint):
    return [rect(x, y, 262, 54, tint, "#6e8fae", 7),
            text(x + 10, y + 21, name, "mono"), text(x + 10, y + 42, keys, "micro")]


def relation(path, cardinality, x, y):
    return [f'<path class="relation" d="{path}" fill="none" stroke="#3d6486" stroke-width="1.800"/>',
            text(x, y, cardinality, "mono", "middle")]


def data_model():
    out = [rect(24, 1478, 1650, 262, "#ffffff", "#8bbd9f", 14),
           logo("postgresql", 40, 1486, 26),
           text(76, 1505, "MODÈLE RELATIONNEL PostgreSQL 17 · les traits sont des clés étrangères (FK)", "zone")]
    identity, chat, media, notify = "#eaf1ff", "#e9f6ee", "#e6f4f5", "#fbeef4"
    columns = [40, 370, 700, 1030, 1360]
    rows = [1522, 1600, 1678]
    cells = [
        (0, 0, "identity.users", "PK id · handle UNIQUE · hash", identity),
        (1, 0, "identity.sessions", "FK user_id · token_hash UNIQUE", identity),
        (2, 0, "notify.push_subscriptions", "FK session_id · endpoint · clés", notify),
        (3, 0, "notify.push_deliveries", "PK (event_id, subscription_id)", notify),
        (4, 0, "chat.outbox", "PK event_id · FK (conv_id, seq)", chat),
        (0, 1, "chat.conversation_members", "PK (conv_id, user_id) · role", chat),
        (1, 1, "chat.conversations", "PK id · type · last_seq", chat),
        (2, 1, "chat.conversation_events", "PK (conv_id, seq) · payload", chat),
        (3, 1, "chat.messages", "FK sender_id · UNIQUE client_id", chat),
        (4, 1, "chat.attachments", "FK message_id · bytea · sha256", chat),
        (0, 2, "media.call_participants", "PK (call_id, user_id)", media),
        (1, 2, "media.calls", "FK conv_id · room_name UNIQUE", media),
    ]
    for column, row, name, keys, tint in cells:
        out += entity(columns[column], rows[row], name, keys, tint)
    out += relation("M302 1549H370", "1 — N", 336, 1542)
    out += relation("M632 1549H700", "1 — N", 666, 1542)
    out += relation("M962 1549H1030", "1 — N", 996, 1542)
    out += relation("M1360 1549H1292", "N — 1", 1326, 1542)
    out += relation("M171 1576V1600", "1 — N", 200, 1593)
    out += relation("M302 1627H370", "N — 1", 336, 1620)
    out += relation("M632 1627H700", "1 — N", 666, 1620)
    out += relation("M962 1627H1030", "1 — 0..1", 996, 1620)
    out += relation("M1292 1627H1360", "1 — 0..1", 1326, 1620)
    out += relation("M831 1600V1588H1491V1576", "1 — 0..1", 1180, 1584)
    out += relation("M501 1654V1678", "1 — N", 530, 1671)
    out += relation("M370 1705H302", "N — 1", 336, 1698)
    out += [rect(700, 1678, 592, 54, "#f4f6f9", "#9db0c4", 7),
            text(710, 1699, "media.media_jobs · webhook_receipts · quality_samples", "mono"),
            text(710, 1720, "travaux idempotents, anti-rejeu des webhooks, mesures de qualité", "micro"),
            rect(1306, 1662, 354, 70, "#fff9e8", "#d9b45c", 7),
            text(1316, 1683, "T07 · une seule transaction SQL", "mono"),
            text(1316, 1703, "verrou du fil → last_seq + 1 → event", "micro"),
            text(1316, 1722, "→ message → outbox → COMMIT", "micro")]
    return out


def key_points():
    return [rect(1690, 1478, 766, 262, "#ffffff", "#9db0c4", 14),
            text(1706, 1505, "POINTS CLÉS À DÉFENDRE", "zone"),
            lines(1706, 1533, [
                "• Surface publique : 1 IP web (LB) + IP média (2 SFU, coturn). VM app privées.",
                "• PostgreSQL : transactions, contraintes FK, écritures concurrentes sans course.",
                "• Microservices : 4 images, 1 base, des droits d’écriture séparés par schéma.",
                "• API sans état local durable : on ajoute des VM derrière le load balancer.",
                "• LiveKit : Redis répartit les salles ; si un SFU tombe, ses membres se reconnectent.",
                "• Limite assumée : coturn unique = point de panne du relais TURN.",
                "• STUN maison : VM + IPv4 + trafic à payer, mais région et données maîtrisées.",
                "• RGPD : VM, SQL, Redis, images en europe-west4, sauvegardes en « eu ».",
                "   À documenter : LB global, DNS, GitHub et fournisseurs Push.",
                "• Budget : cible HA à chiffrer. Repli : 1 VM app, 1 SFU, SQL zonal, sans Redis.",
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
    out.append(lines(2488, 1656, [
        "Txx = flux nommé. Protocole,",
        "port, données et test dans",
        "le tableau sous la planche.",
        "Cadre = frontière réseau",
        "ou de responsabilité.",
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
        # Media
        arrow("M764 1126H1250", "media", both=True),
        arrow("M764 1240H1960V1220", "media", both=True),
        arrow("M1742 1240V1220", "media"),
        arrow("M1572 1126H1640", "media", both=True),
        # Admission, data, operations
        arrow("M1742 988V1034", "media"),
        arrow("M2058 662H2140", "data", both=True),
        arrow("M2298 722V750", "data"),
        arrow("M2058 851H2512", "push"),
        arrow("M2070 915H2140", "ops"),
        arrow("M2062 1176H2140", "media", both=True),
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
        flow(1202, 470, ["T03", ":8080"], "web", 50),
        flow(1590, 116, ["T15 · Web Push : le fournisseur réveille le service worker A ou B"], "push", 440),
        flow(1010, 1100, ["T12 · STUN / TURN", "UDP 3478 · TLS 5349"], "media", 150),
        flow(1010, 1212, ["T11 · média direct vers la SFU", "UDP 7882 · secours TCP 7881"], "media", 200),
        flow(1606, 1100, ["T12", "relais"], "media", 52),
        flow(1887, 1000, ["T10 · signalisation WSS → TCP 7880", "via Nginx · admin et webhooks"], "media", 258),
        flow(2111, 634, ["T09", "SQL"], "data", 44),
        flow(2388, 736, ["T21 · sauvegarde"], "data", 126),
        flow(2300, 851, ["T14 · HTTPS 443 via Cloud NAT · VAPID"], "push", 270),
        flow(2111, 915, ["T17"], "ops", 40),
        flow(2108, 1176, ["T13", "TLS"], "media", 44),
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
        '<desc id="description">Personas User, Admin et Ops, deux navigateurs React avec leur service worker, '
        'load balancer, VPC et pare-feu, Nginx et quatre microservices Fastify sur deux zones, PostgreSQL, '
        'LiveKit, coturn, fournisseurs Web Push et livraison par GitHub Actions.</desc>',
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
                 third_parties, delivery, data_model, key_points, legend, connections):
        page.extend(part())
    page.append("</svg>")
    return "\n".join(page) + "\n"
