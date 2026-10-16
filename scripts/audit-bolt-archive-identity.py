#!/usr/bin/env python3
"""Read-only identity audit for the seven Aghbari Bolt project snapshots in the public RAR."""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path, PurePosixPath

ARCHIVE_URL = (
    "https://raw.githubusercontent.com/adnanabderab2016-sys/-7-/main/"
    "%D8%A7%D8%B3%D8%AA%D8%AE%D8%B1%D8%AC%20%D9%85%D9%86%20%D9%83%D9%84%20"
    "%D8%A7%D9%84%D9%85%D8%B4%D8%A7%D8%B1%D9%8A%D8%B9%20%D9%85%D8%A7%20%D9%8A%D9%86%D8%AA%D8%AC%20"
    "%D9%85%D8%B4%D8%B1%D9%88%D8%B9%20%D9%85%D9%83%D8%AA%D9%85%D9%84%20"
    "%D9%84%D9%84%D9%85%D8%AA%D8%AC%D8%B1%20%D8%A7%D9%84%D8%A7%D9%84%D9%83%D8%AA%D8%B1%D9%88%D9%86%D9%8A%20.rar"
)
EXPECTED_BYTES = 25_811_682
PROJECTS = [
    "project-bolt-github-7wyze9ut (2)",
    "project-bolt-github-7wyze9ut (3)",
    "project-bolt-github-myh797q4 (3)",
    "project-bolt-github-myh797q4 (4)",
    "project-bolt-github-xgpah6kz",
    "project-bolt-github-xgpah6kz (1)",
    "project-bolt-sb1-b5g7dtki (1)",
]
REPOSITORIES = [
    "Aghbari-Technologies/aghbari-commerce-evolved",
    "Aghbari-Technologies/aghbari-commerce-evolved-algaradi",
    "Report-Engainall/aghbari-commerce",
    "Report-Engainall/aghbari-store",
    "Report-Engainall/Nasr1",
    "Report-Engainall/nasr2026",
    "adnanabderab2016-sys/aghbari-commerce-evolved-algaradi1",
    "adnanabderab2016-sys/aghbari-commerce-evolved-algaradi",
    "adnanabderab2016-sys/aladnan-electronics",
    "adnanabderab2016-sys/aghbari-store",
]
NOISE_DIRS = {
    ".git", "node_modules", "dist", "build", "coverage", ".next", ".nuxt",
    ".vercel", ".cache", "vendor", "playwright-report", "test-results",
    ".turbo", ".vite", "__pycache__",
}
NOISE_FILES = {".ds_store", "thumbs.db"}
SECRET_FILES = {".env", ".env.local", ".env.production", ".env.development"}


def say(msg: str) -> None:
    print(msg, flush=True)


def run(args: list[str], *, check: bool = True, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    p = subprocess.run(args, cwd=cwd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if check and p.returncode:
        tail = (p.stderr or p.stdout)[-2000:]
        raise RuntimeError(f"command failed ({p.returncode}): {' '.join(args[:5])}\n{tail}")
    return p


def ignored(rel: str) -> bool:
    p = PurePosixPath(rel)
    if any(part.lower() in NOISE_DIRS for part in p.parts):
        return True
    if p.name.lower() in NOISE_FILES or p.name.lower() in SECRET_FILES:
        return True
    if p.name.endswith(":Zone.Identifier"):
        return True
    return False


def git_blob_sha(data: bytes) -> str:
    # Same SHA-1 object id algorithm used by GitHub's Git blob API.
    header = f"blob {len(data)}\0".encode("ascii")
    return hashlib.sha1(header + data).hexdigest()


def file_map(root: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        try:
            rel = path.relative_to(root).as_posix()
        except ValueError:
            continue
        if ignored(rel):
            continue
        try:
            result[rel] = git_blob_sha(path.read_bytes())
        except (OSError, PermissionError):
            continue
    return result


def root_score(path: Path) -> tuple[int, int, int]:
    score = 0
    markers = [
        ("src", 4), ("supabase", 3), (".bolt", 3), ("vite.config.ts", 3),
        ("vite.config.js", 3), ("package-lock.json", 1), ("bun.lock", 1),
        ("pnpm-lock.yaml", 1), ("index.html", 1), ("public", 1),
        ("tsconfig.json", 1), (".github", 1),
    ]
    for marker, points in markers:
        if (path / marker).exists():
            score += points
    if (path / "src" / "App.tsx").exists() or (path / "src" / "App.jsx").exists():
        score += 2
    count = len(file_map(path))
    return (score, count, -len(path.parts))


def choose_root(project_dir: Path) -> Path:
    candidates: set[Path] = set()
    if (project_dir / "package.json").is_file():
        candidates.add(project_dir)
    for manifest in project_dir.rglob("package.json"):
        try:
            rel = manifest.relative_to(project_dir)
        except ValueError:
            continue
        if any(part.lower() in NOISE_DIRS for part in rel.parts):
            continue
        candidates.add(manifest.parent)
    if not candidates:
        return project_dir
    ranked = sorted(candidates, key=root_score, reverse=True)
    return ranked[0]


def ref_tree(repo_dir: Path, ref: str) -> dict[str, str]:
    p = run(["git", f"--git-dir={repo_dir}", "ls-tree", "-r", "-z", "--full-tree", ref], check=False)
    if p.returncode:
        return {}
    # stdout is text-mode but git paths are UTF-8 in these repositories.
    result: dict[str, str] = {}
    for record in p.stdout.split("\0"):
        if not record or "\t" not in record:
            continue
        meta, rel = record.split("\t", 1)
        bits = meta.split()
        if len(bits) != 3 or bits[1] != "blob" or ignored(rel):
            continue
        result[rel] = bits[2]
    return result


def compare(local: dict[str, str], remote: dict[str, str]) -> dict[str, int | float]:
    local_paths, remote_paths = set(local), set(remote)
    shared = local_paths & remote_paths
    exact = sum(1 for p in shared if local[p] == remote[p])
    denominator = max(len(local_paths), len(remote_paths), 1)
    return {
        "local_files": len(local_paths),
        "github_files": len(remote_paths),
        "same_paths": len(shared),
        "exact_path_and_blob_matches": exact,
        "different_blobs_on_same_path": len(shared) - exact,
        "archive_only_paths": len(local_paths - remote_paths),
        "github_only_paths": len(remote_paths - local_paths),
        "exact_match_pct_of_larger_tree": round(100 * exact / denominator, 2),
        "archive_files_exact_pct": round(100 * exact / max(len(local_paths), 1), 2),
    }


def main() -> int:
    work = Path(os.environ.get("RUNNER_TEMP", "/tmp")) / "bolt-xgpah6kz-identity-audit"
    if work.exists():
        shutil.rmtree(work)
    archive = work / "input" / "commerce-projects.rar"
    extract_root = work / "extracted"
    mirrors_root = work / "mirrors"
    archive.parent.mkdir(parents=True, exist_ok=True)
    extract_root.mkdir(parents=True, exist_ok=True)
    mirrors_root.mkdir(parents=True, exist_ok=True)

    say("STEP 1/5 — Download the exact GitHub-hosted RAR")
    run(["curl", "-fL", "--retry", "3", "--connect-timeout", "30", "--max-time", "300",
         ARCHIVE_URL, "-o", str(archive)])
    raw = archive.read_bytes()
    archive_sha256 = hashlib.sha256(raw).hexdigest()
    say(f"RAR_BYTES={len(raw)} EXPECTED_BYTES={EXPECTED_BYTES} SIZE_MATCH={len(raw) == EXPECTED_BYTES}")
    say(f"RAR_SHA256={archive_sha256}")
    if len(raw) != EXPECTED_BYTES:
        say("ERROR: downloaded archive size differs from GitHub's recorded byte count.")
        return 2

    say("STEP 2/5 — Test/extract with RAR-capable tools; keep extraction diagnostics")
    extract_attempts: list[dict[str, str | int]] = []
    unar_out = extract_root / "unar"
    unar_out.mkdir()
    p = run(["unar", "-q", "-o", str(unar_out), str(archive)], check=False)
    extract_attempts.append({"tool": "unar", "exit_code": p.returncode, "stderr_tail": (p.stderr or "")[-800:]})
    found = any((unar_out / name).exists() for name in PROJECTS)
    if not found:
        seven = extract_root / "7z"
        seven.mkdir()
        p7 = run(["7z", "x", "-y", f"-o{seven}", str(archive)], check=False)
        extract_attempts.append({"tool": "7z", "exit_code": p7.returncode, "stderr_tail": (p7.stderr or "")[-800:]})
        if any((seven / name).exists() for name in PROJECTS):
            extract_root = seven
    discovered = {}
    for name in PROJECTS:
        matches = [p for p in extract_root.rglob(name) if p.is_dir() and p.name == name]
        if matches:
            root = choose_root(matches[0])
            discovered[name] = {
                "container_dir": str(matches[0].relative_to(extract_root)),
                "source_root": str(root.relative_to(extract_root)),
                "root_score": root_score(root),
                "files": file_map(root),
            }
    say(f"EXTRACT_ATTEMPTS={json.dumps(extract_attempts, ensure_ascii=False)}")
    say(f"PROJECT_FOLDERS_FOUND={len(discovered)}/7")
    for name in PROJECTS:
        item = discovered.get(name)
        say(f"ARCHIVE_PROJECT={name!r} FOUND={bool(item)} SOURCE_ROOT={item['source_root'] if item else 'NOT_FOUND'} FILES={len(item['files']) if item else 0}")
    if not discovered:
        say("ERROR: target project folders were not discovered; stop without asserting identity.")
        return 3

    say("STEP 3/5 — Mirror current GitHub source repositories and branch/PR refs")
    repos: dict[str, Path] = {}
    for repo in REPOSITORIES:
        target = mirrors_root / (repo.replace("/", "__") + ".git")
        p = run(["git", "clone", "--mirror", f"https://github.com/{repo}.git", str(target)], check=False)
        if p.returncode:
            say(f"REPO_CLONE_FAILED={repo!r} STDERR={(p.stderr or '')[-350:]}")
            continue
        # Also inspect open/historical PR head refs, not only branches.
        fetch = run(["git", f"--git-dir={target}", "fetch", "origin",
                     "+refs/pull/*/head:refs/pull/*/head"], check=False)
        if fetch.returncode:
            say(f"PR_REFS_FETCH_NOTE={repo!r} {(fetch.stderr or '')[-180:]}")
        repos[repo] = target
        refs = run(["git", f"--git-dir={target}", "for-each-ref",
                    "--format=%(refname)", "refs/heads", "refs/tags", "refs/pull"], check=False)
        say(f"REPO_READY={repo!r} REF_COUNT={len([x for x in refs.stdout.splitlines() if x.strip()])}")

    say("STEP 4/5 — Compare each extracted project against every available ref")
    all_results: dict[str, list[dict[str, object]]] = {}
    for project_name, info in discovered.items():
        local_files = info["files"]
        rows: list[dict[str, object]] = []
        for repo, repo_dir in repos.items():
            refs_out = run(["git", f"--git-dir={repo_dir}", "for-each-ref",
                            "--format=%(refname)%09%(objectname)", "refs/heads", "refs/tags", "refs/pull"], check=False)
            seen_commits: dict[str, list[str]] = {}
            for line in refs_out.stdout.splitlines():
                bits = line.split("\t", 1)
                if len(bits) != 2:
                    continue
                ref, _obj = bits
                commit = run(["git", f"--git-dir={repo_dir}", "rev-parse", "--verify", f"{ref}^{{commit}}"], check=False)
                if commit.returncode:
                    continue
                commit_sha = commit.stdout.strip()
                seen_commits.setdefault(commit_sha, []).append(ref)
            for commit_sha, refnames in seen_commits.items():
                tree = ref_tree(repo_dir, commit_sha)
                if not tree:
                    continue
                metrics = compare(local_files, tree)
                # Preserve exact trees and the most informative partial matches; rank below.
                rows.append({
                    "repository": repo, "ref": refnames[0], "same_commit_refs": refnames[:4],
                    "commit": commit_sha, **metrics,
                })
        rows.sort(key=lambda x: (
            int(x["exact_path_and_blob_matches"]),
            float(x["exact_match_pct_of_larger_tree"]),
            int(x["same_paths"]),
            -int(x["different_blobs_on_same_path"]),
        ), reverse=True)
        all_results[project_name] = rows
        say(f"TOP_MATCHES_FOR={project_name!r}")
        for row in rows[:5]:
            say("MATCH=" + json.dumps(row, ensure_ascii=False, separators=(",", ":")))
        exact = [r for r in rows if r["exact_path_and_blob_matches"] == r["local_files"] == r["github_files"]]
        say(f"EXACT_TREE_MATCHES_FOR={project_name!r} COUNT={len(exact)}")
        for row in exact[:10]:
            say("EXACT=" + json.dumps(row, ensure_ascii=False, separators=(",", ":")))

    say("STEP 5/5 — Final identity verdict")
    for target_name in ("project-bolt-github-xgpah6kz", "project-bolt-github-xgpah6kz (1)"):
        rows = all_results.get(target_name, [])
        exact = [r for r in rows if r["exact_path_and_blob_matches"] == r["local_files"] == r["github_files"]]
        best = rows[0] if rows else None
        say("VERDICT=" + json.dumps({
            "archive_project": target_name,
            "found": target_name in discovered,
            "archive_source_root": discovered.get(target_name, {}).get("source_root"),
            "archive_files_after_noise_exclusions": len(discovered.get(target_name, {}).get("files", {})),
            "exact_tree_match": bool(exact),
            "exact_matches": [{"repository": r["repository"], "refs": r["same_commit_refs"], "commit": r["commit"]} for r in exact[:10]],
            "best_partial_match": best,
            "archive_sha256": archive_sha256,
            "extractor_exit_codes": {x["tool"]: x["exit_code"] for x in extract_attempts},
            "note": "Exact identity means matching relative paths and Git blob IDs after excluding generated dependencies/build output and secret files. Partial match is not proof of full identity.",
        }, ensure_ascii=False, separators=(",", ":")))
    say("AUDIT_COMPLETE=YES")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        say(f"AUDIT_ERROR={type(exc).__name__}: {exc}")
        sys.exit(1)
