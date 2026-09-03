#!/usr/bin/env python3
"""把内置插件的运行时第三方依赖（非 @deepseek-ai/*）实体化复制到目标 node_modules 顶层。

用途：dsh-gui 集成的插件（如 dsh-skills-mcp-manager 依赖 schemastery/cosmokit）在
profile node_modules 里需要自己的依赖闭包。本脚本从插件构建目录的 node_modules
（含 .pnpm 虚拟存储）BFS 解析依赖，把缺失的第三方包实体化复制到目标顶层。
@deepseek-ai/* 依赖由 dsh-runtime 提供（heal/闭包），不在此处理。

用法: python ensure-plugin-deps.py <plugin-build-dir> <target-node-modules>
"""

import json
import os
import shutil
import sys
from collections import deque

SKIP_DIRS = {"src", "tests", "test", "node_modules", ".dsh-build", "dist-src"}


def is_link(p):
    return os.path.islink(p)


def effective_target(p):
    if is_link(p):
        t = os.readlink(p)
        if not os.path.isabs(t):
            t = os.path.normpath(os.path.join(os.path.dirname(p), t))
        return t if os.path.isdir(t) else None
    # Windows junction is not detected by islink; realpath resolves it to the
    # physical entity so we can copy real content, not the link itself.
    rp = os.path.realpath(p)
    return rp if os.path.isdir(rp) else None


def get_deps(pkg_json):
    try:
        j = json.load(open(pkg_json, encoding="utf-8"))
    except Exception:
        return []
    out = []
    for key in ("dependencies", "peerDependencies", "bundleDependencies"):
        v = j.get(key)
        if isinstance(v, dict):
            out += list(v.keys())
        elif isinstance(v, list):
            out += v
    # optionalDependencies 也纳入（运行时可能用到）
    opt = j.get("optionalDependencies") or {}
    out += list(opt.keys())
    return out


def find_in_plugin(plugin_nm, name):
    """在插件 node_modules 中定位包实体：顶层、.pnpm/node_modules、或 .pnpm/<pkg>@<ver>/node_modules。"""
    top = os.path.join(plugin_nm, *name.split("/"))
    tgt = effective_target(top)
    if tgt:
        return tgt
    if os.path.isdir(top):
        return top
    # 在 .pnpm 虚拟区查找（hoisted/pnpm 布局）
    vdir = os.path.join(plugin_nm, ".pnpm", "node_modules")
    v = os.path.join(vdir, *name.split("/"))
    tgt = effective_target(v)
    if tgt:
        return tgt
    if os.path.isdir(v):
        return v
    # 精确实体：.pnpm/<short>@<ver>/node_modules/<name>
    short = name.split("/")[-1]
    pdir = os.path.join(plugin_nm, ".pnpm")
    if os.path.isdir(pdir):
        for e in os.listdir(pdir):
            cand = os.path.join(pdir, e, "node_modules", *name.split("/"))
            if os.path.isdir(cand):
                return cand
    return None


def copy_entity(src, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if os.path.isdir(dest):
        shutil.rmtree(dest, ignore_errors=True)
    if os.path.isdir(src):
        shutil.copytree(src, dest, symlinks=False)
    else:
        shutil.copy2(src, dest)


def main():
    if len(sys.argv) < 3:
        print("usage: ensure-plugin-deps.py <plugin-build-dir> <target-node-modules>")
        return 2
    plugin = os.path.abspath(sys.argv[1])
    target_nm = os.path.abspath(sys.argv[2])
    plugin_nm = os.path.join(plugin, "node_modules")
    if not os.path.isdir(plugin_nm):
        print("plugin build dir has no node_modules; nothing to do")
        return 0

    q = deque()
    pj0 = os.path.join(plugin, "package.json")
    if os.path.isfile(pj0):
        for d in get_deps(pj0):
            if not d.startswith("@deepseek-ai/"):
                q.append(d)

    seen = set()
    added = 0
    while q:
        name = q.popleft()
        if name in seen:
            continue
        seen.add(name)
        if name.startswith("@deepseek-ai/"):
            continue
        dest = os.path.join(target_nm, *name.split("/"))
        if os.path.isdir(dest):
            # already present: still inspect its transitive deps
            pj = os.path.join(dest, "package.json")
            if os.path.isfile(pj):
                for d in get_deps(pj):
                    if not d.startswith("@deepseek-ai/") and not os.path.isdir(os.path.join(target_nm, *d.split("/"))):
                        q.append(d)
            continue
        src = find_in_plugin(plugin_nm, name)
        if not src:
            print(f"WARN: dependency {name} not found in plugin node_modules")
            continue
        copy_entity(src, dest)
        added += 1
        pj = os.path.join(dest, "package.json")
        if os.path.isfile(pj):
            for d in get_deps(pj):
                if d.startswith("@deepseek-ai/"):
                    continue
                if not os.path.isdir(os.path.join(target_nm, *d.split("/"))):
                    q.append(d)
    print(f"plugin deps ensured: {added} packages -> {target_nm}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
