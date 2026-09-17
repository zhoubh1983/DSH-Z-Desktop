/**
 * 路径解析：定位 dsh-runtime（内置的 dsh CLI 运行时）与相关资源。
 *
 * 打包后 dsh-runtime 通过 electron-builder 的 extraResources 放到真实文件系统
 * （process.resourcesPath/dsh-runtime），因为 RUN_AS_NODE 子进程不支持 asar 补丁，
 * 后端必须从真实文件系统读取所有文件。
 * 开发模式（npm start）直接使用仓库内的 ../dsh-runtime。
 * @module dsh-gui/main/paths
 */

const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { app } = require('electron')

/** dsh 用户数据根目录（与官方 dsh CLI 一致，默认 ~/.dsh）。 */
function resolveDshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
}

/** dsh-runtime 根目录：dsh CLI 构建产物 + 依赖 + 内置 webhook 资源。 */
function resolveDshRuntime() {
  if (process.env.DSH_RUNTIME_DIR) return process.env.DSH_RUNTIME_DIR
  if (app.isPackaged) return path.join(process.resourcesPath, 'dsh-runtime')
  return path.join(__dirname, '..', 'dsh-runtime')
}

/** dsh CLI 的入口（apps/cli 的构建产物）。 */
function resolveDshBin(dshRuntime) {
  return path.join(dshRuntime, 'lib', 'bin.js')
}

/** 内置 webhook 插件源（随 dsh-runtime 分发）。 */
function resolveWebhookPluginDir(dshRuntime) {
  return path.join(dshRuntime, 'webhook-plugin')
}

/** 内置插件目录（webhook / whale-musume / skills-mcp-manager / skill-market）。 */
function resolveBuiltinPluginsDir() {
  if (process.env.DSH_BUILTIN_PLUGINS_DIR) return process.env.DSH_BUILTIN_PLUGINS_DIR
  if (app.isPackaged) return path.join(process.resourcesPath, 'builtin-plugins')
  return path.join(__dirname, '..', 'builtin-plugins')
}

/** 内置技能市场目录（随应用分发，启动时同步到 ~/.dsh/skills-market）。 */
function resolveBuiltinSkillsMarketDir() {
  if (process.env.DSH_BUILTIN_SKILLS_MARKET_DIR) return process.env.DSH_BUILTIN_SKILLS_MARKET_DIR
  if (app.isPackaged) return path.join(process.resourcesPath, 'skills-market')
  return path.join(__dirname, '..', 'skills-market')
}

/** 内置 webhook 启用补丁（--patch overlay，须在真实文件系统上）。 */
function resolveWebhookPatch(dshRuntime) {
  return path.join(dshRuntime, 'webhook.cordis.yml')
}

/** 运行时日志文件（$DSH_HOME/logs/dsh-gui.log）。 */
function resolveLogFile() {
  const logs = path.join(resolveDshHome(), 'logs')
  fs.mkdirSync(logs, { recursive: true })
  return path.join(logs, 'dsh-gui.log')
}

module.exports = {
  resolveDshHome,
  resolveDshRuntime,
  resolveDshBin,
  resolveWebhookPluginDir,
  resolveWebhookPatch,
  resolveBuiltinPluginsDir,
  resolveBuiltinSkillsMarketDir,
  resolveLogFile,
}
