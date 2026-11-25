"""Export the C4 workspace and render its views locally as SVG."""

import argparse
import json
import re
import subprocess
import textwrap
from pathlib import Path
from tempfile import TemporaryDirectory

from schema import physical_views


def run(*args):
    subprocess.run(args, check=True)


def inventory_tables(document, requested):
    """Embed the named inventory tables in the offline reader."""
    tables = {}
    for section in re.split(r"^## ", document, flags=re.M)[1:]:
        title, _, body = section.partition("\n")
        if title not in requested:
            continue
        rows = [
            [cell.strip() for cell in line.strip("|").split("|")]
            for line in body.splitlines() if line.startswith("|")
        ]
        if len(rows) < 3 or any(len(row) != len(rows[0]) for row in rows):
            raise ValueError(f"Invalid inventory table: {title}")
        tables[title] = [rows[0], *rows[2:]]
    if set(tables) != requested:
        raise ValueError(f"Unknown inventory tables: {requested - set(tables)}")
    return tables


def sequence_source(source, title):
    """Map the Structurizr sequence export to PlantUML participants and steps."""
    participants = {}
    lines = [
        "@startuml",
        "skinparam backgroundColor white",
        "skinparam shadowing false",
        "skinparam defaultFontName SansSerif",
        "skinparam defaultFontColor #10283F",
        "skinparam sequenceParticipantBackgroundColor #E8F1FA",
        "skinparam sequenceParticipantBorderColor #38678E",
        "skinparam sequenceLifeLineBorderColor #8DA6BC",
        "skinparam sequenceArrowColor #37516E",
        "hide footbox",
        "autonumber",
        title,
    ]
    for line in source.splitlines():
        if line.startswith("title "):
            continue
        elif line.startswith("participant "):
            _, _, name = line.rpartition(" as ")
            alias = f"p{len(participants)}"
            participants[name] = alias
            label = r"\n".join(textwrap.wrap(name, width=24))
            lines.append(f'participant "{label}" as {alias}')
        elif line.strip():
            match = re.fullmatch(r"(.+?)(-->|->)(.+?): (.+)", line)
            if match is None:
                raise ValueError(f"Unexpected sequence export line: {line}")
            source, arrow, destination, message = match.groups()
            label = r"\n".join(textwrap.wrap(message, width=62, break_on_hyphens=False))
            lines.append(f"{participants[source]} {arrow} {participants[destination]}: {label}")
    lines.append("@enduml")
    return "\n".join(lines) + "\n"


def check_http_routes(root, details):
    route = re.compile(r"""\bapp\.(get|post|patch|put|delete)\(\s*['"]/api/v1(/[^'"]*)['"]""")
    registered = {
        (method.upper(), re.sub(r":(\w+)", r"{\1}", path))
        for handler in (root / "apps/api/src").rglob("*.ts")
        for method, path in route.findall(handler.read_text(encoding="utf-8"))
    }
    rows = set()
    for file in details.glob("1[45]-http-*.puml"):
        rows.update(re.findall(r"^\s*\| (GET|POST|PATCH|PUT|DELETE) \| (\/\S+) \|",
                               file.read_text(encoding="utf-8"), re.M))
    if rows != registered:
        raise ValueError(f"HTTP views differ from Fastify routes: {sorted(rows ^ registered)}")
    spec = json.loads((root / "packages/contracts/schemas/openapi.json").read_text(encoding="utf-8"))
    planned = {(verb.upper(), path) for path, operations in spec["paths"].items() for verb in operations
               if verb in {"get", "post", "put", "patch", "delete"}}
    return [f"{verb} {path}" for verb, path in sorted(planned - registered)]


def render(cli, plantuml):
    workspace = Path(__file__).with_name("workspace.dsl")
    output = workspace.parent / "svg"
    folder = workspace.parent
    model = folder / "c4.dsl"
    details = folder / "details"
    appendix = details / "vues.dsl"
    contract_gaps = check_http_routes(folder.parent.parent, details)
    migrations = {path.name: path.read_text(encoding="utf-8") for path in
                  sorted((folder.parent.parent / "db" / "migrations").glob("*.sql"))}
    style = (details / "style.iuml").read_text(encoding="utf-8")
    run("bash", str(cli), "validate", "-workspace", str(appendix))
    with TemporaryDirectory(prefix="chatisen-diagrams-") as temp:
        work = Path(temp)
        for fmt in ("plantuml", "websequencediagrams"):
            run("bash", str(cli), "export", "-workspace", str(appendix), "-format", fmt, "-output", str(work))

        sources = []
        for diagram in sorted(work.glob("structurizr-*.puml")):
            if diagram.stem.endswith("-key"):
                continue
            name = diagram.stem.removeprefix("structurizr-")
            source = diagram.with_suffix(".wsd")
            puml = work / f"{name}.puml"
            exported = diagram.read_text(encoding="utf-8")
            if source.exists():
                title = next(line for line in exported.splitlines() if line.startswith("title "))
                content = sequence_source(source.read_text(encoding="utf-8"), re.sub(r"</?size(?::\d+)?>", "", title))
            else:
                content = exported.replace(
                    "@startuml\n",
                    "@startuml\n!pragma layout smetana\nskinparam backgroundColor white\n",
                    1,
                )
            puml.write_text(content, encoding="utf-8")
            sources.append(puml)

        if not sources:
            raise RuntimeError("Structurizr did not export any diagrams")
        implementation = [(path.stem, path.read_text(encoding="utf-8").replace("!include style.iuml", style))
                          for path in sorted(details.glob("*.puml"))]
        for name, content in [*implementation, *physical_views(migrations, style)]:
            puml = work / f"{name}.puml"
            if puml in sources:
                raise ValueError(f"Duplicate view key {name}")
            puml.write_text(content, encoding="utf-8")
            sources.append(puml)
        catalogue = json.loads((folder / "vues.json").read_text(encoding="utf-8"))
        levels = [view["id"] for view in catalogue]
        if len(levels) != 4 or [key[:3] for key in levels] != ["01-", "02-", "03-", "04-"]:
            raise ValueError("The catalogue must have exactly four main C4 levels, in order")
        records = [record for level in catalogue for record in (level, *level["details"])]
        listed = [record["id"] for record in records]
        if len(set(listed)) != len(listed) or set(listed) != {p.stem for p in sources}:
            raise ValueError("The viewer catalogue and the exported view keys must match")
        for view in records:
            for label, link in view["links"]:
                if not link.startswith("https://") and not (folder / link.split("#")[0]).is_file():
                    raise ValueError(f"{view['id']}: missing source {label}: {link}")
        run("java", "-Djava.awt.headless=true", "-jar", str(plantuml), "-failfast2", "-tsvg", "-charset", "UTF-8", *map(str, sources))
        # Check the complete offline workspace with freshly rendered images, even on a clean build.
        (work / "svg").mkdir()
        for source in sources:
            (work / "svg" / source.with_suffix(".svg").name).write_bytes(source.with_suffix(".svg").read_bytes())
        (work / model.name).write_bytes(model.read_bytes())
        (work / workspace.name).write_bytes(workspace.read_bytes())
        run("bash", str(cli), "validate", "-workspace", str(work / workspace.name))
        run("bash", str(cli), "export", "-workspace", str(work / workspace.name), "-format", "json", "-output", str(work))
        exported = json.loads((work / "workspace.json").read_text(encoding="utf-8"))
        native_keys = {view["key"] for kind, group in exported["views"].items() if kind.endswith("Views")
                       for view in group}
        if native_keys != set(levels):
            raise ValueError(f"The Structurizr workspace and the four main levels differ: {native_keys ^ set(levels)}")
        output.mkdir(exist_ok=True)
        for source in sources:
            svg = source.with_suffix(".svg")
            (output / svg.name).write_bytes(svg.read_bytes())
        # A classic script works from file:// in Safari and Chromium, without fetch or a local server.
        requested = {name for record in records for name in record.get("tables", [])}
        tables = inventory_tables((folder / "infrastructure-gcp.md").read_text(encoding="utf-8"), requested)
        viewer_data = {"views": catalogue, "migrations": migrations, "contractGaps": contract_gaps,
                       "inventory": tables}
        (folder / "lecteur.js").write_text("const architecture = " + json.dumps(
            viewer_data, ensure_ascii=False, indent=2) + ";\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("structurizr_cli", type=Path, help="path to structurizr.sh")
    parser.add_argument("plantuml_jar", type=Path, help="path to the PlantUML jar")
    args = parser.parse_args()
    render(args.structurizr_cli.resolve(), args.plantuml_jar.resolve())
