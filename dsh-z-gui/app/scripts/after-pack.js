// electron-builder afterPack 钩子：补齐 dsh-runtime 的 node_modules。
//
// 原因：electron-builder 复制 extraResources 时，会把「from 目录根节点下的
// node_modules」无条件排除（fileMatcher 的默认行为，本意是排除 app 根
// node_modules，误伤了 dsh-runtime 这类自带依赖闭包的资源目录），导致打包
// 产物的 resources/dsh-runtime/node_modules 缺失、后端无法启动。
// 本钩子在 win-unpacked 生成后、安装包制作前，把 app/dsh-runtime 全量覆盖
// 复制到产物目录（实体布局，无 junction，可直接 cpSync）。
const fs = require('node:fs')
const path = require('node:path')

/** @param {import('electron-builder').AfterPackContext} context */
exports.default = async function afterPack(context) {
  const projectDir = context.packager.projectDir
  const appOutDir = context.appOutDir
  const src = path.join(projectDir, 'dsh-runtime')
  const dest = path.join(appOutDir, 'resources', 'dsh-runtime')
  if (!fs.existsSync(src)) {
    console.warn('[afterPack] dsh-runtime 源目录缺失，跳过:', src)
    return
  }
  console.log('[afterPack] 全量补齐 dsh-runtime ->', dest)
  fs.rmSync(dest, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.cpSync(src, dest, { recursive: true })
  const nm = path.join(dest, 'node_modules')
  if (fs.existsSync(nm)) {
    console.log('[afterPack] node_modules 补齐完成，包数:',
      fs.readdirSync(nm).length,
      fs.existsSync(path.join(nm, '@deepseek-ai'))
        ? '(' + fs.readdirSync(path.join(nm, '@deepseek-ai')).length + ' @deepseek-ai)'
        : '')
  }
}
