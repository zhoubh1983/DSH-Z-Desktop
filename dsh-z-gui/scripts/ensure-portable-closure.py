#!/usr/bin/env python3
"""补齐 dsh-runtime 顶层 node_modules 的完整实体闭包（hoisted 可分发布局）。

pnpm deploy --prod --node-linker=hoisted 会把依赖扁平到顶层，但会遗漏部分
workspace 包及其第三方依赖。本脚本 BFS 全依赖图，把缺失的包**实体复制**到
顶层（无任何链接），产出可 zip / 可拷贝跨机器运行的 node_modules。

用法: python ensure-portable-closure.py <dsh-d-root>
"""

import json
import os
import shutil
import sys
from collections import deque

SKIP_DIRS = {"src", "tests", "test", "node_modules", ".dsh-build", "dist-src"}


def is_link(path):
    return os.path.islink(path)


def effective_target(path):
    if not is_link(path):
        return path if os.path.isdir(path) else None
    tgt = os.readlink(path)
    if not os.path.isabs(tgt):
        tgt = os.path.normpath(os.path.join(os.path.dirname(path), tgt))
    return tgt if os.path.isdir(tgt) else None


def collect_workspace(root):
    ws = {}
    for base in ["vendor", "apps"]:
        d = os.path.join(root, "deepseek-harness", base)
        if not os.path.isdir(d):
            continue
        for entry in os.listdir(d):
            pj = os.path.join(d, entry, "package.json")
            if os.path.isfile(pj):
                try:
                    name = json.load(open(pj, encoding="utf-8"))["name"]
                except Exception:
                    continue
                if name:
                    ws[name] = os.path.join(d, entry)
    groups = os.path.join(root, "deepseek-harness", "packages")
    if os.path.isdir(groups):
        for g in os.listdir(groups):
            gd = os.path.join(groups, g)
            if not os.path.isdir(gd):
                continue
            for entry in os.listdir(gd):
                pj = os.path.join(gd, entry, "package.json")
                if os.path.isfile(pj):
                    try:
                        name = json.load(open(pj, encoding="utf-8"))["name"]
                    except Exception:
                        continue
                    if name:
                        ws[name] = os.path.join(gd, entry)
    return ws


def get_deps(pkg_json):
    try:
        j = json.load(open(pkg_json, encoding="utf-8"))
    except Exception:
        return []
    keys = list((j.get("dependencies") or {}).keys())
    keys += list((j.get("peerDependencies") or {}).keys())
    return keys


def copy_pkg(src, dest):
    os.makedirs(dest, exist_ok=True)
    for item in os.listdir(src):
        if item in SKIP_DIRS:
            continue
        if item.endswith(".map"):
            continue
        s = os.path.join(src, item)
        d = os.path.join(dest, item)
        if os.path.isdir(s) and not is_link(s):
            if os.path.isdir(d):
                shutil.rmtree(d, ignore_errors=True)
            shutil.copytree(s, d, symlinks=False)
        else:
            if os.path.isdir(d):
                shutil.rmtree(d, ignore_errors=True)
            shutil.copy2(s, d)


def main(root):
    harness = os.path.join(root, "deepseek-harness")
    runtime = os.path.join(root, "dsh-z-gui", "app", "dsh-runtime")
    nm = os.path.join(runtime, "node_modules")
    scope = os.path.join(nm, "@deepseek-ai")
    hvdir = os.path.join(harness, "node_modules", ".pnpm", "node_modules")
    os.makedirs(scope, exist_ok=True)

    ws = collect_workspace(root)

    def ensure_ws(name):
        if name not in ws:
            return False
        short = name.replace("@deepseek-ai/", "")
        top = os.path.join(scope, short)
        if os.path.isdir(top):
            return True
        copy_pkg(ws[name], top)
        return True

    def ensure_third(name):
        dest = os.path.join(nm, name)
        if os.path.isdir(dest):
            return True
        href = os.path.join(hvdir, name)
        if not os.path.exists(href):
            return False
        tgt = effective_target(href) or href
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        if os.path.isdir(tgt):
            shutil.copytree(tgt, dest, symlinks=False)
        else:
            shutil.copy2(tgt, dest)
        return True

    q = deque(ws.keys())
    seen = set()
    added = 0
    while q:
        name = q.popleft()
        if name in seen:
            continue
        seen.add(name)
        if name.startswith("@deepseek-ai/"):
            ok = ensure_ws(name)
            pj = os.path.join(scope, name.replace("@deepseek-ai/", ""), "package.json")
            if not ok or not os.path.isfile(pj):
                continue
        else:
            ok = ensure_third(name)
            pj = os.path.join(nm, name, "package.json")
            if not ok or not os.path.isfile(pj):
                continue
        if os.path.isfile(pj):
            added += 1
        for dep in get_deps(pj):
            if dep.startswith("@deepseek-ai/"):
                target = os.path.join(scope, dep.replace("@deepseek-ai/", ""))
            else:
                target = os.path.join(nm, dep)
            if not os.path.isdir(target):
                q.append(dep)

    print(f"portable closure complete, ensured {added} packages")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "."))
