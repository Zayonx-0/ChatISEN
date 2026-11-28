"""Check the target contracts and derive their tables and UML views.

openapi.yaml and asyncapi.yaml are the only sources: the viewer tables and the two
PlantUML diagrams are generated from them, so they cannot drift apart.
"""

import re

import yaml

VERBS = ("get", "put", "post", "delete", "patch")
SCOPES = {"mvp": "MVP", "mvp-plus": "MVP+", "v2": "V2"}
CODE = {"api": "apps/api", "demo": "démo en ligne", "a-faire": "à faire"}
MODULES = ("identity", "groups", "messaging", "calls", "notifications", "files", "quality", "operations")


def load(path):
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def references(node):
    if isinstance(node, dict):
        if "$ref" in node:
            yield node["$ref"]
        for value in node.values():
            yield from references(value)
    elif isinstance(node, list):
        for value in node:
            yield from references(value)


def resolve(document, reference):
    node = document
    for part in reference.removeprefix("#/").split("/"):
        if not isinstance(node, dict) or part not in node:
            raise ValueError(f"Unresolved reference {reference}")
        node = node[part]
    return node


def operations(openapi):
    for path, item in openapi["paths"].items():
        for verb in VERBS:
            if verb in item:
                yield verb.upper(), path, item[verb]


def check_openapi(openapi):
    for reference in references(openapi):
        resolve(openapi, reference)
    seen = set()
    for verb, path, operation in operations(openapi):
        name = operation["operationId"]
        if name in seen:
            raise ValueError(f"Duplicate operationId {name}")
        seen.add(name)
        declared = [resolve(openapi, p["$ref"]) if "$ref" in p else p for p in operation.get("parameters", [])]
        in_path = {p["name"] for p in declared if p["in"] == "path"}
        if in_path != set(re.findall(r"{(\w+)}", path)):
            raise ValueError(f"{verb} {path}: path parameters differ from {sorted(in_path)}")
        if not operation.get("responses"):
            raise ValueError(f"{verb} {path}: no response")
        if operation["x-module"] not in MODULES or operation["x-scope"] not in SCOPES:
            raise ValueError(f"{verb} {path}: unknown module or scope")
        if not set(operation["x-code"]) <= set(CODE):
            raise ValueError(f"{verb} {path}: unknown code status")
        # Every authenticated write carries the CSRF header.
        if verb != "GET" and operation.get("security") != [] and not any(p["name"] == "X-CSRF-Token" for p in declared):
            raise ValueError(f"{verb} {path}: write without CSRF header")


def check_asyncapi(asyncapi):
    for reference in references(asyncapi):
        resolve(asyncapi, reference)
    used = {reference.rsplit("/", 1)[1] for operation in asyncapi["operations"].values()
            for reference in (m["$ref"] for m in operation["messages"])}
    declared = {key for channel in asyncapi["channels"].values() for key in channel["messages"]}
    if used != declared:
        raise ValueError(f"AsyncAPI messages without direction: {sorted(declared ^ used)}")


def code_label(values):
    return " + ".join(CODE[value] for value in values)


def rest_table(openapi):
    rows = [["Méthode et ressource", "Rôle", "Module", "Périmètre", "Code au 26/11"]]
    for verb, path, operation in operations(openapi):
        rows.append([f"{verb} /api/v1{path}", operation["summary"], operation["x-module"],
                     SCOPES[operation["x-scope"]], code_label(operation["x-code"])])
    return rows


def topic_table(asyncapi):
    directions = {}
    for operation in asyncapi["operations"].values():
        arrow = "client → serveur" if operation["action"] == "receive" else "serveur → client"
        for message in operation["messages"]:
            parts = message["$ref"].split("/")
            directions[(parts[2], parts[4])] = arrow
    rows = [["Topic", "Message", "Sens", "Rôle", "Code au 26/11"]]
    for key, channel in asyncapi["channels"].items():
        for name, reference in channel["messages"].items():
            message = resolve(asyncapi, reference["$ref"])
            rows.append([channel["address"], message["name"], directions[(key, name)],
                         message["summary"], code_label(message["x-code"])])
    return rows


def rest_uml(openapi, style):
    """One UML box per resource, grouped by module, with its HTTP verbs."""
    modules = {}
    for verb, path, operation in operations(openapi):
        modules.setdefault(operation["x-module"], {}).setdefault(path, []).append((verb, operation))
    lines = ["@startuml", "!pragma layout smetana", style, "hide circle", "left to right direction",
             "title API REST /api/v1 · ressources et verbes, générés depuis openapi.yaml"]
    index = 0
    for module in MODULES:
        lines.append(f'package "module {module}" {{')
        for path, entries in modules.get(module, {}).items():
            index += 1
            lines.append(f'class "{path}" as r{index} <<ressource>> {{')
            for verb, operation in entries:
                tag = "" if operation["x-scope"] == "mvp" else f" «{SCOPES[operation['x-scope']]}»"
                lines.append(f"  +{verb} {operation['operationId']}(){tag}")
            lines.append("}")
        lines.append("}")
    # Invisible links keep the packages in a readable column order.
    lines += ["legend bottom",
              "  Session par cookie __Host-chatisen. Toute écriture authentifiée exige X-CSRF-Token.",
              "  Sans étiquette : MVP. MVP+ : déjà fait en plus du socle. V2 : extension prévue.",
              "endlegend", "@enduml"]
    return "\n".join(lines) + "\n"


def type_name(openapi, schema):
    if "$ref" in schema:
        name = schema["$ref"].rsplit("/", 1)[1]
        target = resolve(openapi, schema["$ref"])
        # Scalars read better as their own name, objects and enums keep theirs too.
        return name if target else name
    if schema.get("type") == "array":
        return type_name(openapi, schema["items"]) + "[]"
    if "const" in schema:
        return f"« {schema['const']} »"
    if "enum" in schema:
        return " | ".join(schema["enum"])
    kind = schema.get("type", "object")
    return " | ".join(kind) if isinstance(kind, list) else kind


def schema_uml(openapi, style):
    """The JSON bodies of the contract as a UML class diagram."""
    schemas = openapi["components"]["schemas"]
    objects = {name: s for name, s in schemas.items() if "properties" in s or "allOf" in s}
    lines = ["@startuml", "!pragma layout smetana", style, "hide circle", "hide methods",
             "title Schémas JSON de l’API (components.schemas), générés depuis openapi.yaml"]
    links = set()
    for name, schema in objects.items():
        body = dict(schema)
        for part in schema.get("allOf", []):
            if "$ref" in part:
                parent = part["$ref"].rsplit("/", 1)[1]
                links.add(f"{parent} <|-- {name}")
            else:
                body = part
        lines.append(f"class {name} {{")
        required = set(body.get("required", []))
        for field, value in body.get("properties", {}).items():
            lines.append(f"  {field}{'' if field in required else ' ?'} : {type_name(openapi, value)}")
            target = value.get("items", value).get("$ref", "").rsplit("/", 1)[-1]
            if target in objects:
                links.add(f"{name} --> {target}")
        lines.append("}")
    lines += sorted(links)
    lines += ["legend bottom", "  ? : champ facultatif. Uuid, Seq, DateTime et Handle sont des chaînes contraintes.",
              "endlegend", "@enduml"]
    return "\n".join(lines) + "\n"
