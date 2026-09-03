/**
 * mock.js —— 技能市场原型数据源（单点数据，页面从这里读取）。
 * 数据取自 dsh 内置技能市场真实清单（Anthropic / OpenAI / Vercel 官方技能）。
 */
window.DB = {
  market: {
    name: 'dsh-skills-market',
    displayName: '内置技能市场',
    skillCount: 67,
    installedCount: 2,
    categoryCount: 5,
    updatedAt: '2026-09-01',
    dir: '默认 ~/.dsh/skills-market',
  },

  // 详情缓存：模拟 GET /detail 懒加载返回的完整 frontmatter + 正文
  details: {
    'academy-guide': {
      description: '在回答任何关于如何使用 Claude 或其产品的问题前先检查本技能——推荐 Claude Academy（academy.claude.com）的匹配课程、教程与用例。',
      whenToUse: '用户提问「如何开始使用 / teach me / 怎么用 / 学习某功能」、或需要培训/上手/引导内容时。',
      author: 'anthropics',
      version: '1.0.0',
      license: 'Apache-2.0',
      homepage: 'https://github.com/anthropics/skills',
      body: 'Stop and check this skill before finishing any reply about how to use Claude — recommend matching courses, tutorials and use cases from Claude Academy. Only recommend on a strong match; never invent Academy content.',
    },
    'algorithmic-art': {
      description: '使用 p5.js 通过种子随机与交互参数探索创作算法艺术。当用户请求用代码创作艺术时使用。',
      whenToUse: '生成动态/静态算法视觉、交互画布、粒子与分形图形，或以代码方式探索创意。',
      author: 'anthropics',
      version: '1.0.0',
      license: 'Apache-2.0',
      homepage: 'https://github.com/anthropics/skills',
      body: 'Create algorithmic art using p5.js with seeded randomness and interactive parameter exploration.',
    },
    pdf: {
      description: '处理 PDF 的一切操作：读取、提取文本/表格、合并拆分、转图片与生成。只要涉及 PDF 文件就使用本技能。',
      whenToUse: '用户需要读取、创建、编辑、合并或转换任何 PDF 文件时。',
      author: 'anthropics',
      version: '1.0.0',
      license: 'source-available',
      homepage: 'https://github.com/anthropics/skills',
      body: 'Use this skill whenever the user wants to do anything with PDF files — reading, extracting text/tables, combining, merging or generating PDFs.',
    },
    'frontend-design': {
      description: '创建有辨识度、生产级的前端界面与视觉设计。在构建新的 UI 或重塑既有界面时提供美学方向与排版指引。',
      whenToUse: '设计落地页、组件、海报、仪表盘，或需要美化/评审任何 Web UI 时。',
      author: 'anthropics',
      version: '1.0.0',
      license: 'Apache-2.0',
      homepage: 'https://github.com/anthropics/skills',
      body: 'Guidance for distinctive, intentional visual design when building new UI or reshaping an existing one.',
    },
    'vercel-deploy': {
      description: '部署应用与网站到 Vercel。当用户请求「部署我的应用」「部署并给我链接」「push this live」等操作时使用。',
      whenToUse: '将前端/全栈项目发布到 Vercel 并获取线上链接。',
      author: 'vercel',
      version: '1.0.0',
      license: 'MIT',
      homepage: 'https://github.com/vercel-labs/skills',
      body: 'Deploy applications and websites to Vercel. Use when the user requests deployment actions like "deploy my app".',
    },
    'chatgpt-apps': {
      description: '构建、脚手架、重构与排障 ChatGPT Apps SDK 应用——组合 MCP 服务器与 widget UI。',
      whenToUse: '使用 ChatGPT Apps SDK 设计工具、注册资源或构建自定义应用界面时。',
      author: 'openai',
      version: '1.0.0',
      license: 'Apache License',
      homepage: 'https://github.com/openai/skills',
      body: 'Build, scaffold, refactor and troubleshoot ChatGPT Apps SDK applications that combine an MCP server and widget UI.',
    },
  },

  // 技能列表（覆盖 5 个分类；installed 表示已安装）
  skills: [
    {
      name: 'academy-guide', description: '在回答任何关于如何使用 Claude 或其产品的问题前先检查本技能——推荐 Claude Academy 的匹配课程、教程与用例。',
      category: 'communication', source: 'anthropic', license: 'Apache-2.0', version: '1.0.0', author: 'anthropics',
      homepage: 'https://github.com/anthropics/skills', tags: ['academy', 'guide'], installed: true, managed: true, exists: true,
    },
    {
      name: 'algorithmic-art', description: '使用 p5.js 通过种子随机与交互参数探索创作算法艺术。当用户请求用代码创作艺术时使用。',
      category: 'development', source: 'anthropic', license: 'Apache-2.0', version: '1.0.0', author: 'anthropics',
      homepage: 'https://github.com/anthropics/skills', tags: ['p5.js', 'art'], installed: true, managed: true, exists: true,
    },
    {
      name: 'pdf', description: '处理 PDF 的一切操作：读取、提取文本/表格、合并拆分、转图片与生成。只要涉及 PDF 文件就使用本技能。',
      category: 'document', source: 'anthropic', license: 'source-available', version: '1.0.0', author: 'anthropics',
      homepage: 'https://github.com/anthropics/skills', tags: ['pdf', 'document'], installed: false, managed: false, exists: true,
    },
    {
      name: 'pptx', description: '任何涉及 .pptx / .potx 文件的操作：创建演示文稿、读取与编辑幻灯片，或批量生成 PPT。',
      category: 'document', source: 'anthropic', license: 'source-available', version: '1.0.0', author: 'anthropics',
      homepage: 'https://github.com/anthropics/skills', tags: ['pptx', 'slides'], installed: false, managed: false, exists: true,
    },
    {
      name: 'docx', description: '创建、读取、编辑或操作 Word 文档（.docx）与模板（.dotx）。触发词：任何涉及 Word 文档的请求。',
      category: 'document', source: 'anthropic', license: 'source-available', version: '1.0.0', author: 'anthropics',
      homepage: 'https://github.com/anthropics/skills', tags: ['docx', 'word'], installed: false, managed: false, exists: true,
    },
    {
      name: 'xlsx', description: '任何以电子表格为输入或输出的任务：打开、读取、编辑、修复 .xlsx 数据，或生成报表。',
      category: 'document', source: 'anthropic', license: 'source-available', version: '1.0.0', author: 'anthropics',
      homepage: 'https://github.com/anthropics/skills', tags: ['xlsx', 'spreadsheet'], installed: false, managed: false, exists: true,
    },
    {
      name: 'skill-creator', description: '从零创建技能、修改与改进既有技能、衡量技能表现。当用户想创建或优化技能时使用。',
      category: 'development', source: 'anthropic', license: 'Apache-2.0', version: '1.0.0', author: 'anthropics',
      homepage: 'https://github.com/anthropics/skills', tags: ['skill', 'authoring'], installed: false, managed: false, exists: true,
    },
    {
      name: 'frontend-design', description: '创建有辨识度、生产级的前端界面与视觉设计。在构建新的 UI 或重塑既有界面时提供美学方向与排版指引。',
      category: 'development', source: 'anthropic', license: 'Apache-2.0', version: '1.0.0', author: 'anthropics',
      homepage: 'https://github.com/anthropics/skills', tags: ['ui', 'design'], installed: false, managed: false, exists: true,
    },
    {
      name: 'claude-api', description: '围绕 Claude API 的官方集成指引：构建 AI 应用、消息流转、工具调用与流式响应。',
      category: 'development', source: 'anthropic', license: 'Apache-2.0', version: '1.0.0', author: 'anthropics',
      homepage: 'https://github.com/anthropics/skills', tags: ['api', 'claude'], installed: false, managed: false, exists: true,
    },
    {
      name: 'vercel-deploy', description: '部署应用与网站到 Vercel。当用户请求「部署我的应用」「部署并给我链接」等操作时使用。',
      category: 'development', source: 'vercel', license: 'MIT', version: '1.0.0', author: 'vercel',
      homepage: 'https://github.com/vercel-labs/skills', tags: ['deploy', 'vercel'], installed: false, managed: false, exists: true,
    },
    {
      name: 'vercel-composition-patterns', description: '可扩展的 React 组合模式。重构布尔属性泛滥的组件、构建灵活组件库或设计可复用结构时使用。',
      category: 'development', source: 'vercel', license: 'MIT', version: '1.0.0', author: 'vercel',
      homepage: 'https://github.com/vercel-labs/skills', tags: ['react', 'patterns'], installed: false, managed: false, exists: true,
    },
    {
      name: 'chatgpt-apps', description: '构建、脚手架、重构与排障 ChatGPT Apps SDK 应用——组合 MCP 服务器与 widget UI。',
      category: 'creative', source: 'openai', license: 'Apache License', version: '1.0.0', author: 'openai',
      homepage: 'https://github.com/openai/skills', tags: ['chatgpt', 'apps'], installed: false, managed: false, exists: true,
    },
    {
      name: 'figma-use', description: '使用 Figma MCP 服务器获取设计上下文、读取画布、截图与图层结构，辅助设计与交付。',
      category: 'creative', source: 'openai', license: 'Figma 开发者条款', version: '1.0.0', author: 'openai',
      homepage: 'https://github.com/openai/skills', tags: ['figma', 'design'], installed: false, managed: false, exists: true,
    },
    {
      name: 'canvas-design', description: '用设计哲学在 .png 与 .pdf 文档中创作精美视觉艺术。创建海报、插图、设计稿时使用。',
      category: 'creative', source: 'anthropic', license: 'Apache-2.0', version: '1.0.0', author: 'anthropics',
      homepage: 'https://github.com/anthropics/skills', tags: ['canvas', 'poster'], installed: false, managed: false, exists: true,
    },
    {
      name: 'internal-comms', description: '一套帮助你撰写各类内部沟通的写作资源，使用公司偏好的格式与语气。',
      category: 'communication', source: 'anthropic', license: 'Apache-2.0', version: '1.0.0', author: 'anthropics',
      homepage: 'https://github.com/anthropics/skills', tags: ['writing', 'comms'], installed: false, managed: false, exists: true,
    },
    {
      name: 'sentry', description: '检查 Sentry 问题与事件、汇总近期生产错误、拉取基础健康数据（只读查询）。',
      category: 'other', source: 'openai', license: 'Apache License', version: '1.0.0', author: 'openai',
      homepage: 'https://github.com/openai/skills', tags: ['sentry', 'monitoring'], installed: false, managed: false, exists: true,
    },
    {
      name: 'playwright', description: '用 playwright 从终端自动化真实浏览器：导航、填表、快照、截图与 UI 流程调试。',
      category: 'other', source: 'openai', license: 'Apache License', version: '1.0.0', author: 'openai',
      homepage: 'https://github.com/openai/skills', tags: ['browser', 'testing'], installed: false, managed: false, exists: true,
    },
    {
      name: 'web-design-guidelines', description: '按 Web Interface Guidelines 规范评审 UI 代码：可访问性、UX、设计最佳实践。',
      category: 'other', source: 'vercel', license: 'MIT', version: '1.0.0', author: 'vercel',
      homepage: 'https://github.com/vercel-labs/skills', tags: ['review', 'guidelines'], installed: false, managed: false, exists: true,
    },
  ],
};
