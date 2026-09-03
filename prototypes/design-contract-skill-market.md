# Design Contract · dsh 技能市场高保真原型

## Style Tier & Aesthetic Direction

- style: minimal-light（干净 / 现代 / 精密工具面板）

- aesthetic: precise-tool（精密工具面板：克制留白 + 高信息密度 + 严格网格对齐，来源用色点编码）

- tone keywords: calm / restrained / high information density

- 载体上下文：dsh 桌面应用「设置」面板内的一级菜单「技能市场」

## Design Tokens

- color.primary: #5B5BD6（紫罗兰，dsh 品牌主色）  primary-hover: #4B4FD1  primary-soft: #EFEFFF

- color.bg: #F5F6FA（冷调浅灰蓝，避免纯白）  color.surface: #FFFFFF

- color.border: #E4E7EF  color.border-strong: #D4D8E4

- color.text: #1F2933（深灰蓝，非纯黑）  color.text-sub: #667085  color.text-faint: #98A2B3

- color.success: #12B76A  danger: #E5484D  warning: #F5A623

- 来源编码色点：anthropic #C2703D 琥珀 / openai #0E9E9B 青 / vercel #2E5BFF 蓝

- font.body: "PingFang SC", "Microsoft YaHei", "Segoe UI", system-ui, sans-serif（中文优先）

- font.display: 同上栈，用 500/600 字重 + 字号层级制造对比（避免单一字号）

- font.mono: "JetBrains Mono", "SF Mono", Consolas, monospace（技能名 / 路径 / 数字）

- font.scale: 12 / 13 / 14 / 16 / 20 / 24（px）

- radius: sm 6 / md 10 / lg 16

- shadow: sm `0 1px 2px rgba(16,24,40,.05)` / md `0 4px 16px rgba(16,24,40,.08)` / lg `0 12px 40px rgba(16,24,40,.14)`

- spacing.unit: 4px base（4/8/12/16/20/24/32）

- layout: 内容区 max-width 880px；左侧设置导航宽 224px；卡片网格 minmax(360px, 1fr) 双列

- icon.lib: lucide（全部内联 SVG，零外部依赖，离线可开）

- icon.size: 16 / 18 / 20 / 24   icon.stroke: 1.75   icon.color: currentColor

- motion: 页面载入 stagger reveal（6 段 offset 40ms）；卡片 hover 上浮 1px + 边框加深 140ms；弹窗 mask fade + 内容 scale(0.98→1) 160ms；toast 滑入 180ms

- bg-texture: 顶部内容区细网格线（1px @ 24px）+ 侧栏纯色，克制不喧宾夺主

## Component Spec

- button：默认(白底描边) / primary(紫底白字) / danger(红字红描边) / ghost(透明)；sizes sm(28px)/md(34px)；hover 加深 120ms；loading 态内联 spinner + 禁用

- input：白底 1px 描边，focus 主色描边 + 2px 柔光；带图标输入框左侧留位

- card：白底 md radius 1px 描边；hover 上浮 + 主色描边 140ms；已安装卡主色左条 3px

- tag：pill，12px 描边灰字；已安装 success 绿；来源色点 + 灰字

- chip（分类筛选）：pill 可切换，active 主色底白字

- modal（市场设置）：居中 440px，mask 半透明，lg radius，标题 + 副标题 + 输入 + 当前地址 + 取消/保存

- nav-sidebar：224px，白底，item 48px 高 pill，active 主色软底 + 主色字 + 左侧条

- empty-state：虚线框 + 居中图标 + 主/副文案

- toast：底部居中黑底白字 pill，自动消失 2.4s

## App Shell + Canonical Nav（模拟 dsh 设置面板）

- shell skeleton：`.app`(grid 224px 1fr) = `.nav`(侧栏) + `.main`(内容区)；`.main` 内 `.page-head`(标题/简介) + `.page-body`(各模块)

- nav items（冻结，仅技能市场 active）：

  1. 通用设置 settings
  2. 模型 cpu
  3. 插件 puzzle
  4. 桌面伴侣 fish
  5. Webhook 告警 bell-ring
  6. 记忆与知识库 database
  7. Agent 预设 bot
  8. 技能与 MCP blocks
  9. 技能市场 store（active，order 21）

- active rule：`body[data-page="skill-market"]` 下 `.nav-item[data-nav="skill-market"]` 加 `.active`

- mount：内联 shell（单页直接写在 index.html）

- 其他 8 项为占位：disabled 样式（cursor 默认 + 不可点），原型仅演示技能市场

## Page List

- 技能市场（唯一页面）| 浏览/搜索/分类/安装/卸载/更新技能 + 市场地址配置 | 统计概览、搜索+分类 chips+排序、技能卡片、市场设置弹窗、toast | 无跳转（单页）

- 市场设置弹窗 | 配置市场地址（留空=内置）| 输入+当前地址+保存 | 保存→toast

## Mock Schema

```js
MarketInfo = { name, displayName, skillCount, installedCount, categoryCount, updatedAt, dir }
Skill = { name, description, category('document'|'development'|'creative'|'communication'|'other'),
          source('anthropic'|'openai'|'vercel'), license, version, author, homepage,
          whenToUse, tags[], installed, managed, exists }
```

- mock 集中在 mock.js；api.js 提供与真实后端同形异步 stub（GET/POST + delay），标注 `// TODO: replace with fetch('...')` 与真实端点

