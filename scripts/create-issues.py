#!/usr/bin/env python3
"""
Create all neithly-monitor-sdk v0.1 issues on GitHub.

Strategy:
  1. Build each Epic, capture its issue number/node_id.
  2. For each Feature under it, create + parent (sub-issue) to the Epic.
  3. For each Task under the Feature, create + parent to the Feature.
  4. Every issue lands on Project #2 with Status=Todo + Priority/Effort/Impact.
  5. Output a JSON map { plan_path → issue_number } so the plan file
     can be rewritten with real numbers.

Run with `python scripts/create-issues.py`. Idempotent enough to recover
mid-run: every state-mutating call surfaces errors and stops.
"""

import io
import json
import os
import subprocess
import sys
import time

# Windows cp1252 stdout chokes on Unicode arrows etc. Force UTF-8 + add a
# safe-print that strips on encode error so a Unicode glyph never aborts
# the whole run mid-loop.
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace", line_buffering=True)


def safe_print(*args):
    text = " ".join(str(a) for a in args)
    try:
        print(text)
    except UnicodeEncodeError:
        print(text.encode("ascii", "replace").decode("ascii"))

REPO = "neithly-com/neithly-monitor-sdk"
MILESTONE_NUMBER = 1

# Native issue type GraphQL node IDs (from `gh api graphql organization.issueTypes`)
TYPE_EPIC = "IT_kwDOEISxFM4B9Yxl"
TYPE_FEATURE = "IT_kwDOEISxFM4B9Yk_"
TYPE_TASK = "IT_kwDOEISxFM4B9Yk9"

# Project #2 ("Roadmap") field + option IDs
PROJECT_ID = "PVT_kwDOEISxFM4BU8nS"
FIELD_STATUS = "PVTSSF_lADOEISxFM4BU8nSzhMRYiY"
OPT_TODO = "f75ad846"
FIELD_PRIORITY = "PVTSSF_lADOEISxFM4BU8nSzhQjy7s"
OPT_PRIORITY = {"P0": "75c76dc5", "P1": "526cfb34", "P2": "b6630af4"}
FIELD_EFFORT = "PVTSSF_lADOEISxFM4BU8nSzhQjzFM"
OPT_EFFORT = {"XS": "6be26b51", "S": "a6cff346", "M": "60bb9697", "L": "0c60aa40", "XL": "b019b24a"}
FIELD_IMPACT = "PVTSSF_lADOEISxFM4BU8nSzhQjzOQ"
OPT_IMPACT = {"none": "8d92903f", "low": "49c09f3b", "medium": "6c4b43dd", "high": "1fb03b33"}


def gh(args, stdin=None, check=True):
    """Wrapper around `gh` CLI with error surfacing."""
    res = subprocess.run(
        ["gh"] + args,
        capture_output=True,
        text=True,
        input=stdin,
        encoding="utf-8",
    )
    if check and res.returncode != 0:
        print("FAIL:", " ".join(args), file=sys.stderr)
        print(res.stderr, file=sys.stderr)
        sys.exit(1)
    return res.stdout.strip()


def create_issue(title, body, type_id):
    """Create an issue + set its native issue type + return (number, node_id)."""
    # Step 1 — create
    out = gh([
        "api", f"repos/{REPO}/issues",
        "-f", f"title={title}",
        "-f", f"body={body}",
        "-F", f"milestone={MILESTONE_NUMBER}",
    ])
    j = json.loads(out)
    number = j["number"]
    node_id = j["node_id"]
    # Step 2 — set issue type
    gh([
        "api", "graphql",
        "-f", "query=mutation($id:ID!,$type:ID!){updateIssue(input:{id:$id,issueTypeId:$type}){issue{id}}}",
        "-f", f"id={node_id}",
        "-f", f"type={type_id}",
    ])
    return number, node_id


def add_to_project(issue_node_id, priority, effort, impact):
    """Add issue to Project #2 + set Status/Priority/Effort/Impact."""
    out = gh([
        "api", "graphql",
        "-f", "query=mutation($pid:ID!,$cid:ID!){addProjectV2ItemById(input:{projectId:$pid,contentId:$cid}){item{id}}}",
        "-f", f"pid={PROJECT_ID}",
        "-f", f"cid={issue_node_id}",
    ])
    item_id = json.loads(out)["data"]["addProjectV2ItemById"]["item"]["id"]

    def set_single_select(field_id, option_id):
        gh([
            "api", "graphql",
            "-f", "query=mutation($p:ID!,$i:ID!,$f:ID!,$v:String!){updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:{singleSelectOptionId:$v}}){projectV2Item{id}}}",
            "-f", f"p={PROJECT_ID}",
            "-f", f"i={item_id}",
            "-f", f"f={field_id}",
            "-f", f"v={option_id}",
        ])

    set_single_select(FIELD_STATUS, OPT_TODO)
    set_single_select(FIELD_PRIORITY, OPT_PRIORITY[priority])
    set_single_select(FIELD_EFFORT, OPT_EFFORT[effort])
    set_single_select(FIELD_IMPACT, OPT_IMPACT[impact])


def add_sub_issue(parent_number, child_node_id):
    """Use the sub_issues REST API to parent a child to its Epic/Feature."""
    # The sub_issues endpoint expects the CHILD's integer id (not node_id).
    # Resolve via the issue node — node_id is fine but the API wants
    # numeric id; the create response gave us the numeric `id` too.
    pass  # placeholder, see set_parent below.


def set_parent(parent_number, child_id_numeric):
    """sub_issues API on REST surfaces."""
    gh([
        "api", "-X", "POST", f"/repos/{REPO}/issues/{parent_number}/sub_issues",
        "-F", f"sub_issue_id={child_id_numeric}",
    ])


def get_issue_id(node_id):
    """Resolve the numeric `id` of an issue from its node_id (for sub-issue API)."""
    out = gh([
        "api", "graphql",
        "-f", f"query=query($id:ID!){{node(id:$id){{... on Issue{{databaseId}}}}}}",
        "-f", f"id={node_id}",
    ])
    return json.loads(out)["data"]["node"]["databaseId"]


# Convenience wrapper: create + project fields + (optional) parent link.
def make(title, body, type_id, priority, effort, impact, parent_number=None):
    number, node_id = create_issue(title, body, type_id)
    add_to_project(node_id, priority, effort, impact)
    if parent_number:
        numeric = get_issue_id(node_id)
        set_parent(parent_number, numeric)
    safe_print(f"#{number}  {title[:80]}")
    return number, node_id


def load_existing_titles():
    """Map { title → number } for issues already on the repo (any state).

    Lets the script resume after a crash without creating duplicates.
    """
    out = gh([
        "api", f"repos/{REPO}/issues?state=all&per_page=100",
        "--paginate",
    ])
    # gh --paginate concatenates JSON arrays with [] separators — parse line by line
    items = []
    for chunk in out.split("\n"):
        chunk = chunk.strip()
        if not chunk:
            continue
        try:
            parsed = json.loads(chunk)
            if isinstance(parsed, list):
                items.extend(parsed)
            else:
                items.append(parsed)
        except json.JSONDecodeError:
            continue
    # If the above produced nothing (single JSON object), re-parse as a whole
    if not items:
        try:
            items = json.loads(out)
        except json.JSONDecodeError:
            items = []
    return {item["title"]: item["number"] for item in items if "title" in item}


if __name__ == "__main__":
    # Plan data: imported from a sibling file so this file stays scannable.
    from plan_data import PLAN

    existing = load_existing_titles()
    safe_print(f"resume: {len(existing)} titles already on the repo")
    created = dict(existing)  # carry over

    def ensure(title, body, type_id, priority, effort, impact, parent_number=None):
        """Create if not already present; otherwise return the existing number."""
        if title in existing:
            safe_print(f"#{existing[title]}  [skip] {title[:80]}")
            return existing[title], None
        return make(title, body, type_id, priority, effort, impact, parent_number)

    for epic in PLAN:
        epic_n, _ = ensure(
            epic["title"], epic["body"], TYPE_EPIC,
            epic["priority"], epic["effort"], epic["impact"],
        )
        created[epic["title"]] = epic_n

        for feature in epic["features"]:
            f_body = feature["body"].replace("{parent}", f"Epic #{epic_n}")
            feat_n, _ = ensure(
                feature["title"], f_body, TYPE_FEATURE,
                feature["priority"], feature["effort"], feature["impact"],
                parent_number=epic_n,
            )
            created[feature["title"]] = feat_n

            for task in feature["tasks"]:
                t_body = task["body"].replace("{parent}", f"Feature #{feat_n}")
                task_n, _ = ensure(
                    task["title"], t_body, TYPE_TASK,
                    task["priority"], task["effort"], task["impact"],
                    parent_number=feat_n,
                )
                created[task["title"]] = task_n

                # Incremental snapshot every 5 issues so a crash doesn't
                # lose progress on the next resume.
                if len(created) % 5 == 0:
                    with open("scripts/created.json", "w", encoding="utf-8") as f:
                        json.dump(created, f, indent=2)

    with open("scripts/created.json", "w", encoding="utf-8") as f:
        json.dump(created, f, indent=2)
    safe_print(f"Created/resumed {len(created)} issues. Map written to scripts/created.json")
