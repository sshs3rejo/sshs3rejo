#!/usr/bin/env python3
"""Preenche os campos dinâmicos do banner do perfil.

Lê assets/banner.svg, busca os números atuais na API GraphQL do GitHub e
substitui os marcadores {{...}} que estão no arquivo. O resultado vai para
output/banner.svg, que é o arquivo versionado e exibido no README.

Os números são consultados dentro do workflow, por isso o SVG commitado
não depende de nenhum serviço externo no ar.
"""

import json
import os
import subprocess
import sys
from datetime import datetime, timezone

QUERY = """
query($login: String!) {
  user(login: $login) {
    login
    repositories(privacy: PUBLIC, ownerAffiliations: OWNER) { totalCount }
    followers { totalCount }
    contributionsCollection {
      contributionCalendar { totalContributions }
    }
  }
}
"""

SOURCE = "assets/banner.svg"
TARGET = "output/banner.svg"


def fetch(login):
    out = subprocess.run(
        ["gh", "api", "graphql", "-f", f"query={QUERY}", "-f", f"login={login}"],
        capture_output=True, text=True, check=True,
    )
    data = json.loads(out.stdout)
    if "errors" in data:
        sys.exit(f"erro da API GraphQL: {data['errors']}")
    return data["data"]["user"]


def build_values(user):
    contributions = user["contributionsCollection"]["contributionCalendar"]["totalContributions"]
    return {
        "PUBLIC_REPOS": str(user["repositories"]["totalCount"]),
        "FOLLOWERS": str(user["followers"]["totalCount"]),
        "CONTRIBUTIONS": str(contributions),
        "UPDATED_AT": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
    }


def main():
    login = os.environ.get("GITHUB_LOGIN", "sshs3rejo")
    os.makedirs("output", exist_ok=True)

    with open(SOURCE, encoding="utf-8") as fh:
        svg = fh.read()

    for key, value in build_values(fetch(login)).items():
        svg = svg.replace(f"{{{{{key}}}}}", value)

    left = [k for k in ("PUBLIC_REPOS", "FOLLOWERS",
                        "CONTRIBUTIONS", "UPDATED_AT") if f"{{{{{k}}}}}" in svg]
    if left:
        sys.exit(f"marcadores não substituídos: {left}")

    with open(TARGET, "w", encoding="utf-8") as fh:
        fh.write(svg)
    print(f"{TARGET}: {os.path.getsize(TARGET)} bytes")


if __name__ == "__main__":
    main()
