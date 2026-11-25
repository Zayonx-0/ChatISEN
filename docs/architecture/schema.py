"""Draw the two physical ER views from the CREATE TABLEs in the ChatISEN migrations."""

import re
from collections import defaultdict


VIEWS = {
    "12-donnees-chat": ("Identité et messagerie", (
        "users", "sessions", "conversations", "conversation_members", "conversation_events",
        "messages", "group_creation_commands", "_chatisen_migrations",
    )),
    "13-donnees-media": ("Appels, fichiers et mesures", (
        "calls", "call_participants", "media_jobs", "quality_samples", "attachments", "webhook_receipts",
    )),
}


def identifiers(value):
    return tuple(column.strip() for column in value.split(","))


def parse_table(body):
    keys = re.search(r"PRIMARY KEY\s*\(([^)]+)\)", body)
    primary = set(identifiers(keys[1])) if keys else set()
    unique = [identifiers(keys) for keys in re.findall(r"UNIQUE\s*\(([^)]+)\)", body)]
    refs = []
    columns = {}
    for name, kind, options in re.findall(r"^  ([a-z_]\w*) ([a-z]\w*(?:\([\d,]+\))?)([^\n]*)", body, re.M):
        if "PRIMARY KEY" in options:
            primary.add(name)
        if "UNIQUE" in options:
            unique.append((name,))
        reference = re.search(r"REFERENCES (\w+)\((\w+)\)", options)
        if reference:
            refs.append(((name,), reference[1], (reference[2],)))
        columns[name] = (kind, "NOT NULL" in options or name in primary)
    for source, parent, target in re.findall(r"FOREIGN KEY\s*\(([^)]+)\) REFERENCES (\w+)\(([^)]+)\)", body):
        refs.append((identifiers(source), parent, identifiers(target)))
    if not primary or not primary.issubset(columns):
        raise ValueError(f"Unrecognised primary key in {body}")
    return columns, primary, unique, refs


def physical_views(migrations, style):
    ddl = "\n".join(migrations.values())
    tables = {name: parse_table(body) for name, body in re.findall(
        r"CREATE TABLE (?:IF NOT EXISTS )?(\w+) \(\n(.*?)\n\);", ddl, re.S
    )}
    covered = {table for _, group in VIEWS.values() for table in group}
    if covered != tables.keys():
        raise ValueError(f"Assign the changed tables to an ER view: {covered ^ tables.keys()}")

    for view, (title, group) in VIEWS.items():
        lines = ["@startuml", "!pragma layout smetana", style, "hide circle", "hide empty methods",
                 f"title {view[:2]} · PostgreSQL 17 — {title}"]
        if "messages" in group:
            lines.append("left to right direction")
        references = defaultdict(list)
        external = set()
        for table in group:
            columns, primary, unique, refs = tables[table]
            links = {column for source, _, _ in refs for column in source}
            lines.append(f'entity "{table}" as {table} #E6F2FA {{')
            for name, (kind, required) in columns.items():
                markers = [label for label, flag in (
                    ("PK", name in primary), ("FK", name in links), ("UQ", (name,) in unique)
                ) if flag]
                suffix = f"  [{', '.join(markers)}]" if markers else ""
                lines.append(f"  {{field}} {'* ' if required else '  '}{name} : {kind}{suffix}")
            for key in unique:
                if len(key) > 1:
                    lines.append(f"  {{field}} UQ ({', '.join(key)})")
            lines.append("}")
            for source, parent, target in refs:
                if parent not in group:
                    external.add(parent)
                references[table, parent].append((source, target))
        for name in sorted(external):
            lines.append(f'entity "{name} · vue 12" as {name} #F0F2F5 {{\n  * id : uuid [PK]\n}}')
        for (table, parent), links in references.items():
            columns, _, unique, _ = tables[table]
            optional = any(not columns[column][1] for source, _ in links for column in source)
            one = len(links) == 1 and links[0][0] in unique
            label = r"\n".join(", ".join(source) for source, _ in links)
            lines.append(f'{parent} {"|o" if optional else "||"}--{"o|" if one else "o{"} {table} : {label}')
        lines.extend(["legend bottom",
                      "  * champ obligatoire     PK clé primaire (plusieurs PK = clé composée)",
                      "  FK référence     UQ unicité     Cercle = zéro admis · patte d’oie = plusieurs",
                      "  La fiche SQL du lecteur fournit DEFAULT, CHECK, énumérations, ON DELETE, index et trigger exacts.",
                      "endlegend", "@enduml"])
        yield view, "\n".join(lines) + "\n"
