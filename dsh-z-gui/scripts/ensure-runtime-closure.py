#!/usr/bin/env python3
"""补齐 dsh-runtime 的依赖闭包（跨平台）。

pnpm deploy --prod 会遗漏 web profile 的 workspace 包及其第三方依赖。本脚本：
1. 收集 workspace 全部 @deepseek-ai 包；
2. BFS 遍历整个依赖图，把顶层缺失/悬空的 workspace 包复制到
   node_modules/.pnpm/node_modules/@deepseek-ai/<pkg>（虚拟扁平区），
   并在 node_modules/@deepseek-ai/<pkg> 建立链接（Linux: 相对 symlink；Windows: junction）；
3. 递归补齐第三方依赖（从源 harness 的 .pnpm 虚拟区实体化复制）。

用法: python ensure-runtime-closure.py <dsh-d-root>
"""

import json
import os
import shutil
import subprocess
import sys
from collections import deque

SKIP_DIRS = {"src", "tests", "test", "node_modules", ".dsh-build", "dist-src"}


def is_link(path):
    return os.path.islink(path)


def link_target(path):
    """读取链接目标（兼容 symlink 与 Windows junction）。"""
    try:
        return os.readlink(path)
    except OSError:
        return None


def make_link(target, path):
    """创建目录链接：Windows 用 junction，其他平台用 symlink。"""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.exists(path) or is_link(path):
        os.remove(path)
    if os.name == "nt":
        # Windows junction（无需管理员权限）
        subprocess.run(["cmd", "/c", "mklink", "/J", path, target],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    else:
        os.symlink(target, path, target_is_directory=True)


def effective_target(path):
    """链接解析后的真实目录（不存在则返回 None）。"""
    if not is_link(path):
        return path if os.path.isdir(path) else None
    tgt = link_target(path)
    if tgt is None:
        return None
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
            if os.path.exists(d):
                shutil.rmtree(d, ignore_errors=True)
            shutil.copytree(s, d, symlinks=False)
        else:
            os.makedirs(os.path.dirname(d), exist_ok=True)
            if os.path.isdir(d):
                shutil.rmtree(d, ignore_errors=True)
            shutil.copy2(s, d)


def main(root):
    harness = os.path.join(root, "deepseek-harness")
    runtime = os.path.join(root, "dsh-z-gui", "app", "dsh-runtime")
    nm = os.path.join(runtime, "node_modules")
    scope = os.path.join(nm, "@deepseek-ai")
    vdir = os.path.join(nm, ".pnpm", "node_modules")
    hvdir = os.path.join(harness, "node_modules", ".pnpm", "node_modules")

    ws = collect_workspace(root)

    def top_needs_fix(name):
        top = os.path.join(scope, name.replace("@deepseek-ai/", ""))
        if not os.path.exists(top):
            return True
        tgt = effective_target(top)
        return tgt is None

    def ensure_ws(name):
        if name not in ws:
            return
        short = name.replace("@deepseek-ai/", "")
        top = os.path.join(scope, short)
        if not top_needs_fix(name):
            return
        vpkg = os.path.join(vdir, "@deepseek-ai", short)
        if not os.path.isdir(vpkg):
            copy_pkg(ws[name], vpkg)
        # 相对链接（移动到打包目录后仍有效）
        rel = os.path.relpath(vpkg, os.path.dirname(top))
        make_link(rel, top)

    def ensure_third(name):
        if name.startswith("@deepseek-ai/"):
            ensure_ws(name)
            return
        dest = os.path.join(vdir, name)
        if os.path.exists(dest):
            return
        href = os.path.join(hvdir, name)
        if not os.path.exists(href):
            return
        tgt = effective_target(href) or href
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        if os.path.isdir(tgt):
            shutil.copytree(tgt, dest, symlinks=True)
        else:
            shutil.copy2(tgt, dest)

    # BFS 全依赖图
    q = deque(ws.keys())
    seen = set()
    while q:
        name = q.popleft()
        if name in seen:
            continue
        seen.add(name)
        if name.startswith("@deepseek-ai/"):
            short = name.replace("@deepseek-ai/", "")
            vpkg = os.path.join(vdir, "@deepseek-ai", short)
            ensure_ws(name)
            pj = os.path.join(vpkg, "package.json")
            if not os.path.isfile(pj):
                continue
            for dep in get_deps(pj):
                if dep.startswith("@deepseek-ai/"):
                    if top_needs_fix(dep):
                        q.append(dep)
                else:
                    if not os.path.exists(os.path.join(vdir, dep)):
                        q.append(dep)
        else:
            dest = os.path.join(vdir, name)
            ensure_third(name)
            pj = os.path.join(dest, "package.json")
            if not os.path.isfile(pj):
                continue
            for dep in get_deps(pj):
                if not os.path.exists(os.path.join(vdir, dep)):
                    q.append(dep)

    print(f"closure complete, processed {len(seen)} packages")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "."))
