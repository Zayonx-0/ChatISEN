"""Deployment view only: network, machines, containers, managed services and TLS chain."""

from svgkit import arrow, card, flow, lines, logo, markers, rect, stylesheet, text

WIDTH, HEIGHT = 2200, 1460
LATER = {"stroke": "#c08a2e", "fill": "#fff9ee", "dash": "8 5"}


def outside():
    return [
        card(30, 170, 300, 100, "DNS · zone de l’ISEN",
             ["nom web → IP du load balancer", "2e nom TURN → IP de coturn"], symbol="dns", step=19, style="micro"),
        card(30, 376, 300, 214, "Navigateurs A et B", [
            "SPA React + service worker /sw.js",
            "REST et WSS vers le load balancer",
            "WebRTC : à deux, en direct",
            "entre A et B (DTLS-SRTP)",
            "ICE : STUN puis TURN maison",
            "si le direct est impossible",
        ], brand="react", step=20, style="micro"),
        card(30, 636, 300, 188, "Services tiers Web Push", [
            "Google FCM (Chrome)",
            "Mozilla Push (Firefox)",
            "Apple Push (Safari)",
            "Windows WNS (Edge)",
            "appelés par l’API via Cloud NAT",
        ], symbol="bell", kind="push", step=21, style="micro"),
        card(30, 936, 300, 204, "GitHub (hors GCP)", [
            "dépôt, pull requests, main protégé",
            "Actions CI : types, build, tests,",
            "analyse de sécurité, images",
            "Actions CD : après approbation,",
            "migration puis déploiement",
            "OIDC : aucune clé JSON stockée",
        ], brand="github", step=21, style="micro"),
    ]


def edge():
    return [
        card(400, 386, 250, 170, "Load balancer HTTPS", [
            "External Application LB",
            "certificat public géré",
            "443 ; 80 redirigé",
            "backends en HTTPS 8443",
            "sondes /healthz-edge",
        ], symbol="balancer", step=19, style="micro"),
        card(400, 596, 250, 112, "IAP + OS Login", [
            "SSH et Grafana par",
            "tunnel authentifié IAM",
            "aucun accès public",
        ], symbol="shield", kind="ops", step=19, style="micro"),
    ]


def app_vm(x, letter, zone):
    out = [rect(x, 262, 478, 408, "#ffffff", "#6f78b8", 10, width=1.5),
           logo("debian", x + 12, 270, 22),
           text(x + 42, 287, f"VM APP-{letter} · zone {zone} · Debian 13", "section"),
           text(x + 14, 308, "Docker Compose · aucune IP publique", "micro"),
           card(x + 14, 318, 450, 108, "conteneur nginx · :8443", [
               "TLS interne · sert le build React et /sw.js",
               "auth_request, limite de débit, en-têtes",
               "relaie /api/v1 et la WebSocket vers api:3000",
           ], brand="nginx", step=19, style="micro"),
           card(x + 14, 434, 450, 108, "conteneur api · Fastify :3000", [
               "monolithe modulaire (vue 7), 1 seule image",
               "réseau Docker privé : port non publié",
               "/metrics sur :9091 pour Prometheus",
           ], brand="fastify", step=19, style="micro"),
           card(x + 14, 550, 450, 52, "cloud-sql-proxy · mTLS vers Cloud SQL", symbol="shield", kind="data"),
           card(x + 14, 610, 450, 52, "node-exporter :9100 · Ops Agent (journaux)", symbol="chart", kind="ops")]
    return out


def vpc():
    out = [rect(690, 170, 1030, 975, "#e4e9fb", "#7b8fd6", 16, width=1.8),
           text(708, 198, "VPC chatisen-cible · europe-west4 · entrée refusée par défaut", "zone"),
           rect(705, 212, 1000, 473, "#f1effd", "#8d79c9", 12),
           text(720, 236, "SOUS-RÉSEAU APP 10.40.10.0/24 · groupe d’instances (MIG) : 2 VM, autoréparation",
                "section")]
    out += app_vm(720, "A", "a") + app_vm(1212, "B", "b")
    out += [rect(705, 700, 650, 282, "#e6f4f5", "#4f9ea5", 12),
            text(720, 724, "SOUS-RÉSEAU MÉDIA 10.40.20.0/24 · IPv4 publiques", "section"),
            card(720, 740, 300, 226, "VM coturn · zone a", [
                "STUN et TURN auto-hébergés",
                "UDP 3478 · TLS 5349",
                "relais UDP 49160–49200",
                "certificat public (ACME)",
                "identifiants courts, quotas",
                "relais vers IP privées interdit",
                "exporteur de métriques :9641",
            ], symbol="relay", kind="media", step=21, style="micro")]
    for x, letter, zone in ((1032, "A", "a"), (1190, "B", "b")):
        out.append(card(x, 740, 150, 226, f"SFU {letter} · V2", [
            f"VM · zone {zone}", "LiveKit", "conférences", "UDP 7882", "TCP 7881", "API 7880", "métr. 6789",
        ], symbol="sfu", kind="media", step=21, style="micro", **LATER))
    out += [rect(1370, 700, 335, 282, "#fbefe6", "#c9936b", 12),
            text(1384, 724, "SOUS-RÉSEAU OPS 10.40.30.0/24", "section"),
            card(1384, 740, 307, 226, "VM supervision", [
                "Docker Compose",
                "Prometheus : collecte les VM",
                "  toutes les 15 s",
                "Grafana :3000, via IAP seul",
                "tableaux et alertes",
                "(déjà configurés dans le",
                "Compose du dépôt)",
            ], symbol="chart", kind="ops", step=21, style="micro"),
            card(720, 1010, 300, 108, "Cloud NAT", [
                "sortie Internet des VM sans IP", "publique : Web Push, mises à jour",
            ], symbol="nat", kind="ops", step=21, style="micro"),
            card(1032, 1010, 323, 108, "Private Service Access", [
                "plage réservée 10.40.32.0/20", "Cloud SQL et Redis en IP privée",
            ], symbol="key", kind="data", step=21, style="micro")]
    return out


def managed():
    x, w = 1760, 390
    return [
        text(x, 198, "SERVICES MANAGÉS GCP", "zone"),
        card(x, 212, w, 146, "Cloud SQL · PostgreSQL 17 HA", [
            "primaire + secours dans 2 zones", "IP privée seulement",
            "1 schéma par module (vue 4)", "chiffrement au repos et en transit",
        ], brand="postgresql", step=20, style="micro"),
        card(x, 368, w, 62, "Sauvegardes + PITR · région eu", ["restauration testée (RPO et RTO mesurés)"],
             symbol="disk", kind="data", step=18, style="micro"),
        card(x, 440, w, 80, "Memorystore Redis · V2", ["coordination des 2 SFU LiveKit",
                                                       "inutile pour le MVP"],
             brand="redis", step=19, style="micro", **LATER),
        card(x, 530, w, 100, "Cloud Storage · V2", [
            "bucket privé europe-west4 (Object Storage)", "URL signées : envoi direct du navigateur",
            "cycle de vie et quotas",
        ], symbol="disk", kind="data", step=19, style="micro", **LATER),
        card(x, 640, w, 66, "Secret Manager", ["VAPID, CSRF, secret TURN, clés LiveKit"],
             symbol="key", kind="ops", step=18, style="micro"),
        card(x, 716, w, 80, "Cloud Logging", ["journaux centralisés des VM et du LB",
                                             "(rôle d’un serveur Syslog central)"],
             symbol="chart", kind="ops", step=19, style="micro"),
        card(x, 806, w, 84, "Artifact Registry", ["images Docker, désignées par digest",
                                                 "lecture seule pour les VM"],
             brand="gcp", step=19, style="micro"),
        card(x, 900, w, 84, "Cloud Run Job · migration", ["SQL versionné, rôle dédié",
                                                         "échec = déploiement arrêté"],
             brand="gcp", step=19, style="micro"),
        card(x, 994, w, 84, "IAM", ["MFA, moindre privilège,",
                                   "identités séparées CI, CD et VM"],
             symbol="key", kind="admin", step=19, style="micro"),
    ]


def connections():
    return [
        arrow("M180 376V270", "web", dashed=True),
        arrow("M330 470H400", "web", both=True),
        arrow("M650 420H678V372H734", "web"),
        arrow("M650 400H664V252H1450V318", "web"),
        arrow("M330 560H358V855H720", "media", both=True),
        arrow("M650 652H705", "ops"),
        arrow("M1676 576H1732V290H1760", "data", both=True),
        arrow("M1660 740V692H960V670", "ops", dashed=True),
        arrow("M1600 692V670", "ops", dashed=True),
        arrow("M1384 852H1340", "ops", dashed=True),
        arrow("M330 1106H352V1156H1744V848H1760", "ops"),
        arrow("M1744 942H1760", "ops"),
        arrow("M1760 826H1738V636H1676", "ops", dashed=True),
        flow(365, 470, ["443"], "web", 34),
        flow(365, 800, ["STUN", "TURN"], "media", 44),
        flow(1060, 252, ["HTTPS 8443"], "web", 82),
        flow(1732, 420, ["SQL"], "data", 34),
        flow(1180, 692, ["collecte des métriques"], "ops", 160),
        flow(900, 1156, ["images (CI) · migration et mise à jour du MIG (CD)"], "ops", 340),
        flow(1738, 720, ["pull"], "ops", 34),
    ]


def firewall():
    rows = [
        ("FW1", "proxys et sondes GCP 35.191.0.0/16, 130.211.0.0/22 → VM app", "TCP 8443"),
        ("FW2", "IAP 35.235.240.0/20 → toutes les VM ; → supervision pour Grafana", "TCP 22 · 3000"),
        ("FW3", "VM supervision → VM app et média", "TCP 9091, 9100, 9641, 6789"),
        ("FW4", "Internet → coturn : STUN et TURN", "UDP 3478 · TCP 5349"),
        ("FW5", "Internet → coturn : relais vers les navigateurs", "UDP 49160–49200"),
        ("FW6 · V2", "Internet → SFU (média) ; sous-réseau app → SFU (API)", "UDP 7882 · TCP 7881, 7880"),
        ("refus", "tout autre entrant : ni SSH public, ni 5432, ni 3000 de l’API, ni 9090", "bloqué"),
    ]
    out = [rect(30, 1190, 1060, 250, "#ffffff", "#b42318", 12, width=1.6),
           text(48, 1218, "PARE-FEU DU VPC", "zone")]
    for i, (rule, source, ports) in enumerate(rows):
        y = 1248 + i * 28
        out += [text(48, y, rule, "mono"), text(140, y, source, "small"), text(852, y, ports, "small")]
    return out


def tls():
    rows = [
        ("Navigateur → LB", "certificat X.509 signé par une AC publique, géré par GCP"),
        ("LB → Nginx", "TLS rétabli, certificat interne auto-signé (non vérifié par le LB)"),
        ("Nginx → API", "réseau Docker de la même VM, rien ne sort de la machine"),
        ("API → Cloud SQL", "mTLS établi par cloud-sql-proxy"),
        ("Navigateur → coturn", "TURN/TLS : certificat public obtenu par ACME (CSR PKCS#10)"),
        ("Média WebRTC", "DTLS-SRTP, de bout en bout à deux ; le relais TURN ne déchiffre pas"),
        ("Démo en ligne", "Caddy + Let’s Encrypt (ACME) : certificat déjà signé par une AC"),
    ]
    out = [rect(1110, 1190, 1060, 250, "#ffffff", "#146c43", 12, width=1.6),
           text(1128, 1218, "CHAÎNE TLS ET PKI", "zone")]
    for i, (link, value) in enumerate(rows):
        y = 1248 + i * 28
        out += [text(1128, y, link, "mono"), text(1310, y, value, "small")]
    return out


def render_infra_view():
    page = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" '
        f'viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-labelledby="title">',
        '<title id="title">ChatISEN · Infrastructure et déploiement</title>',
        f"<defs>{markers()}</defs>", stylesheet(),
        rect(0, 0, WIDTH, HEIGHT, "#f6f8fc", radius=0),
        text(30, 56, "Infrastructure et déploiement · cible GCP", "title"),
        text(32, 86, "Machines, conteneurs, réseau, services managés et chaîne TLS. "
                     "Orange pointillé : brique prévue en V2.", "subtitle"),
        rect(374, 120, 1798, 1050, "#f1ecfb", "#9a7fd1", 18, width=1.8),
        logo("gcp", 392, 130, 28),
        text(428, 151, "GOOGLE CLOUD · PROJET CHATISEN", "zone"),
    ]
    for part in (outside, edge, vpc, managed, connections, firewall, tls):
        page.extend(part())
    page.append("</svg>")
    return "\n".join(page) + "\n"
