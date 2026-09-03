#!/usr/bin/env python3
"""生成 dsh-runtime 的"发布版" package.json：把 workspace:* 依赖改写为 file: 引用
harness 内的包目录，配合 node-linker=hoisted 可生成无 junction、可分发（zip/拷贝）
的实体 node_modules。

用法: python gen-runtime-manifest.py <dsh-d-root> [--restore]
"""

import json
import os
import shutil
import sys

ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else ".")
HARNESS = os.path.join(ROOT, "deepseek-harness")
RUNTIME = os.path.join(ROOT, "dsh-z-gui", "app", "dsh-runtime")
PKG = os.path.join(RUNTIME, "package.json")
BAK = PKG + ".dep"


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


def main():
    if "--restore" in sys.argv:
        if os.path.exists(BAK):
            shutil.copy2(BAK, PKG)
            print("restored original manifest")
        return 0
    if not os.path.isfile(PKG):
        print(f"no package.json at {PKG}")
        return 1
    ws = collect_workspace(ROOT)
    pkg = json.load(open(PKG, encoding="utf-8"))
    rt_dir = os.path.dirname(PKG)
    changed = []
    for section in ("dependencies", "peerDependencies"):
        deps = pkg.get(section) or {}
        for name, ver in list(deps.items()):
            if isinstance(ver, str) and ver.startswith("workspace:"):
                if name in ws:
                    rel = os.path.relpath(ws[name], rt_dir).replace("\\", "/")
                    deps[name] = f"file:{rel}"
                    changed.append(name)
                else:
                    print(f"WARN: workspace dep not in harness: {name}")
    pkg.setdefault("dependencies", {})
    json.dump(pkg, open(PKG, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"rewrote {len(changed)} workspace deps to file: refs")
    return 0


if __name__ == "__main__":
    sys.exit(main())
