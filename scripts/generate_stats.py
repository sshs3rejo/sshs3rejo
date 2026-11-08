#!/usr/bin/env python3
"""Gera um SVG com estatísticas do perfil GitHub.

Escreve output/stats.svg e output/stats-dark.svg com os mesmos dados.
Os números vêm da API GraphQL do GitHub, consultada dentro do workflow —
por isso o SVG é versionado no repositório e não depende de serviço externo.
"""

import json
import os
import subprocess
import sys
from datetime import datetime, timezone

QUERY = """
query($login: String!) {
  user(login: $login) {
    name
    login
    createdAt
    repositories(privacy: PUBLIC) { totalCount }
    contributionsCollection {
      totalCommitContributions
      totalPullRequestContributions
      totalIssueContributions
      restrictedContributionsCount
    }
    followers { totalCount }
  }
}
"""

THEMES = {
    "light": {
        "bg": "#ffffff",
        "border": "#d0d7de",
        "label": "#57606a",
        "value": "#1f2328",
        "accent": "#0969da",
    },
    "dark": {
        "bg": "#0d1117",
        "border": "#30363d",
        "label": "#8b949e",
        "value": "#e6edf3",
        "accent": "#58a6ff",
    },
}

FONT = ("ui-monospace, SFMono-Regular, 'SF Mono', Menlo, "
        "Consolas, 'Liberation Mono', monospace")


def fetch(login):
    out = subprocess.run(
        ["gh", "api", "graphql", "-f", f"query={QUERY}", "-f", f"login={login}"],
        capture_output=True, text=True, check=True,
    )
    data = json.loads(out.stdout)
    if "errors" in data:
        sys.exit(f"erro da API GraphQL: {data['errors']}")
    return data["data"]["user"]


def build_svg(user, theme):
    t = THEMES[theme]
    c = user["contributionsCollection"]
    contributions = (
        c["totalCommitContributions"]
        + c["totalPullRequestContributions"]
        + c["totalIssueContributions"]
        + c["restrictedContributionsCount"]
    )
    years = max(1, (datetime.now(timezone.utc)
                    - datetime.strptime(user["createdAt"], "%Y-%m-%dT%H:%M:%SZ")
                    .replace(tzinfo=timezone.utc)).days // 365)

    stats = [
        ("contribuições no último ano", contributions),
        ("repositórios públicos", user["repositories"]["totalCount"]),
        ("seguidores", user["followers"]["totalCount"]),
        ("anos no GitHub", years),
    ]

    width, row_h, top = 860, 62, 92
    height = top + row_h * len(stats) + 24

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}" role="img" '
        f'aria-label="Estatísticas de {user["login"]} no GitHub">',
        f'<rect width="{width}" height="{height}" rx="12" fill="{t["bg"]}" '
        f'stroke="{t["border"]}"/>',
        f'<text x="28" y="44" font-family="{FONT}" font-size="18" '
        f'fill="{t["value"]}">'
        f'<tspan fill="{t["accent"]}">{user["login"]}</tspan>'
        f'<tspan fill="{t["label"]}">@github:~$ </tspan>'
        f'<tspan>stats</tspan></text>',
        f'<line x1="28" y1="62" x2="{width - 28}" y2="62" '
        f'stroke="{t["border"]}"/>',
    ]

    for i, (label, value) in enumerate(stats):
        y = top + i * row_h
        parts.append(
            f'<text x="28" y="{y}" font-family="{FONT}" font-size="22" '
            f'fill="{t["accent"]}">{value}</text>'
            f'<text x="96" y="{y}" font-family="{FONT}" font-size="15" '
            f'fill="{t["label"]}">{label}</text>'
        )

    parts.append("</svg>")
    return "".join(parts)


def main():
    login = os.environ.get("GITHUB_LOGIN", "sshs3rejo")
    os.makedirs("output", exist_ok=True)
    user = fetch(login)
    for theme in THEMES:
        name = "stats.svg" if theme == "light" else "stats-dark.svg"
        path = os.path.join("output", name)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(build_svg(user, theme))
        print(f"{path}: {os.path.getsize(path)} bytes")


if __name__ == "__main__":
    main()
