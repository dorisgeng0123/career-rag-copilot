# Career RAG Copilot

Career RAG Copilot 是一个面向 AI 产品经理 / AI 解决方案岗位面试准备的个人知识库工作台。它模拟候选人在真实面试前的准备流程：先解析目标岗位 JD，再整理个人知识资产，最后围绕具体面试问题生成一版贴合岗位、贴合个人经历、带有事实边界的口语化回答。

这个项目不是一个通用聊天机器人，而是一个围绕“面试回答生成”设计的垂直应用。它的核心思路是：用 RAG 做上下文选择，用大模型做最终回答组织。

## 适用场景

面试 AI 产品经理、AI 解决方案、Agent / RAG / 数据智能相关岗位时，候选人通常需要同时处理几类信息：

- 目标 JD 里的岗位职责、能力要求和业务关键词。
- 自己简历中的项目经历、指标、职责边界和可讲事实。
- 过往面试复盘中的高频追问、攻防问法和更自然的表达方式。
- AI / Agent / RAG 相关知识材料。
- 哪些内容可以讲，哪些内容不能夸大或混淆。

Career RAG Copilot 把这些材料组织成一个面试准备工作流，帮助候选人回答类似下面的问题：

- “你做过的销售智能平台，如果模型出现幻觉怎么办？”
- “话术建议不对、出现 bad case，你怎么处理？”
- “你如何证明这个 AI 项目真的带来了业务价值？”
- “如果让你重新设计这个 RAG / Agent 系统，你会怎么做？”

## 页面使用流程

### 1. 顶部导航与项目说明

页面顶部展示项目名称和主要入口。面试官可以通过这些入口查看：

- 产品定位
- 技术架构
- 本体 / 知识资产结构
- 生成链路

这些入口用于解释这个应用不是简单 prompt demo，而是有明确的数据流、上下文组织和回答生成流程。

### 2. 知识资产前置库

页面左侧或资产区域用于管理候选人的知识材料。用户可以上传 Markdown、PDF、TXT 等文件。

输入：

- 简历画像
- 项目 STAR 材料
- 项目复盘文档
- 面试复盘 Q&A
- AI / Agent / RAG 知识笔记
- 风险边界说明

系统处理：

1. 后端读取上传文件。
2. 按文档类型解析正文。
3. 根据资产类别切成语义 chunk。
4. 为 chunk 写入类别、标签、来源路径、摘要等元数据。
5. 保存到本地 SQLite 知识库。

输出：

- 可检索的知识资产列表。
- 每份资产下的语义 chunk。
- 后续回答生成时可使用的事实、few-shot 样例和边界材料。

这里的重点是：上传资产不是简单存文件，而是把个人材料转成后续模型可调用的结构化上下文。

### 3. Step 1：JD 解析

用户可以粘贴 JD 文本，也可以上传 JD 截图。

输入：

- 岗位 JD 文本
- 招聘 App / 网页中的 JD 截图

系统处理：

1. 如果是截图，先调用 OCR / 视觉模型提取文字。
2. 将 JD 文本送入模型解析。
3. 抽取公司、岗位、职级、职责、能力标签和关键词。
4. 生成结构化 `JDContext`。
5. 将解析结果刷新到页面卡片中。

输出：

- 公司名称
- 岗位定位
- 职级判断
- 核心职责权重
- required capabilities
- JD 原文上下文

这个步骤的作用是把非结构化 JD 转成后续问题推荐、chunk 检索和回答生成都能使用的岗位上下文。

### 4. Step 2：选择任务模式与问题

用户选择当前要准备的面试任务模式，例如：

- JD 匹配分析
- 自我介绍
- 项目深挖
- 攻防问答
- 反问面试官

输入：

- 当前任务模式
- Step 1 得到的 `JDContext`
- 用户自定义问题

系统处理：

1. 根据任务模式判断回答目标。
2. 根据 JD 的岗位标题、职责和能力标签生成推荐问题。
3. 用户可以点击推荐问题，也可以直接输入自己的真实问题。
4. 最终以用户输入框中的问题为准。

输出：

- 3-4 个岗位定制推荐问题。
- 一个最终用于回答生成的用户问题。

这个步骤解决的是“问题必须跟 JD 和面试场景绑定”的问题，避免推荐问题和岗位脱节。

### 5. Step 3：生成面试回答

用户点击生成后，系统进入核心生成链路。

输入：

- 用户问题
- 当前任务模式
- 结构化 JDContext
- 本地知识库中的资产 chunk

系统处理分为五层：

#### 5.1 JD 结构化上下文

系统读取当前 JD 中的公司、岗位、职责、能力要求。这部分不是 RAG 检索结果，而是当前面试问题的岗位背景。

作用：

- 让回答明确面向哪个岗位。
- 让模型知道哪些能力是本轮面试最需要展示的。

#### 5.2 问题路由

系统会用轻量规则分析用户问题中的关键词、实体线索和问题焦点，例如：

- 是否在问项目深挖。
- 是否在问幻觉、安全、bad case。
- 是否在问业务价值和指标。
- 是否在问 Agent / RAG / 评测体系。
- 是否在问候选人的职责边界。

作用：

- 决定优先召回哪类材料。
- 决定回答应该偏项目事实、方法论、风险治理还是复盘表达。

问题路由不是 chunk 本身，而是选择 chunk 的规则引擎。

#### 5.3 Chunk 大类选择

根据问题路由，系统从知识库中选择不同类别的 chunk：

- `few-shot chunks`: 来自面试复盘 Q&A，用于学习回答结构、表达方式和攻防思路。
- `evidence chunks`: 来自简历和项目材料，用于提供真实项目事实、职责、指标和方案。
- `risk/boundary chunks`: 来自风险边界材料，用于限制模型不要夸大、不要把理论说成亲身经历。
- AI knowledge chunks: 用于补充 Agent、RAG、评测、治理等专业知识背景。

作用：

- RAG 不直接决定最终话术。
- RAG 负责把“应该喂给模型的材料”选出来。

#### 5.4 上下文编排

系统会把以下内容组装进模型提示词：

- 用户原始问题
- 当前任务模式
- 结构化 JDContext
- few-shot chunks
- evidence chunks
- risk/boundary chunks
- 候选资产摘要
- 回答风格和事实边界要求

这里会明确告诉模型：

- 直接回答版本不强制展示 `[Ref-N]`。
- 但个人经历、项目指标和职责必须来自候选资产。
- few-shot 只能学习表达方式，不能当作个人事实。
- 风险边界材料用于限制夸大和错误归因。

#### 5.5 大模型生成回答

最后由大模型生成面试回答。模型负责：

- 判断问题真正考察什么。
- 组织回答结构。
- 把项目事实转成口语化表达。
- 补充合理的方法论。
- 在必要处体现风险意识和 bad case 处理能力。

输出：

- 一版可直接用于面试表达的回答。
- 回答策略说明。
- 使用到的上下文链路。
- 生成阶段信息。

### 6. 本次生成链路展示

回答下方会展示本次生成经历了哪些阶段，例如：

1. JD 结构化
2. 问题路由
3. 候选素材检索
4. few-shot / evidence / boundary 上下文编排
5. 大模型生成和组织

面试官可以看到这个系统不是直接把用户问题丢给模型，而是先完成岗位理解、问题判断、素材选择和边界约束，再让模型生成回答。

### 7. 候选素材详情

在上下文选择过程追踪里，候选素材可以展开查看详情。

展示内容包括：

- chunk 类型
- 来源文档
- 召回原因
- 相关内容摘要
- 分数或匹配依据

这个功能用于解释回答为什么会使用这些材料，也便于候选人检查是否召回了正确项目、正确 Q&A 和正确边界。

## RAG 在项目中的作用

本项目里的 RAG 不是最终回答本身，而是模型生成前的上下文选择层。

具体作用包括：

1. 从个人资产中找到最相关的项目事实。
2. 从面试复盘中找到相似问法和表达样例。
3. 从风险边界中找到不能夸大的内容。
4. 从 AI 知识笔记中补充专业概念。
5. 根据 JD 和问题动态决定不同 chunk 的优先级。

因此，项目采用的是：

```text
JD 解析 + 问题路由 + Chunk 检索 + 上下文编排 + 大模型回答
```

当前回答生成的核心流程可以更具体地拆成：

```text
用户问题
-> 规则判断问题焦点
-> 提取问题关键词 / JD 关键词
-> 根据问题焦点提高某些 chunk 类型权重
-> 召回相关 chunk
-> 分 few-shot / evidence / boundary 上下文桶
-> 编排进 prompt
-> 大模型生成回答
```

而不是：

```text
用户问题 + 普通 RAG 拼接 + 模板化答案
```

这样可以避免两类问题：

- 只用大模型回答时，容易泛化或编造候选人经历。
- 只用 RAG 改写时，回答容易生硬，不像真实面试表达。

## 模型调用

项目后端通过 OpenAI-compatible Chat Completions API 调用模型，当前支持 Zhipu GLM compatible mode，也可以按环境变量切换到其他兼容模型服务。

主要模型调用点：

- JD 文本结构化解析。
- JD 截图 OCR 后的结构化解析。
- JD 相关推荐问题生成。
- 面试回答生成。

环境变量示例：

```env
MODEL_PROVIDER=zhipu
ZHIPU_API_KEY=your_api_key_here
ZHIPU_BASE_URL=https://open.bigmodel.cn/api/paas/v4
ZHIPU_MODEL=glm-4.5-air
ZHIPU_VISION_MODEL=glm-ocr
ZHIPU_THINKING_TYPE=enabled
```

如果模型 API 不可用，项目会进入本地 fallback 逻辑，保证页面仍能展示基础流程。

## 输入与输出

### 输入

- JD 文本或 JD 截图
- 用户选择的面试任务模式
- 用户自定义面试问题
- Markdown / PDF / TXT 知识资产
- 模型环境变量配置

### 输出

- 结构化 JDContext
- JD 相关面试问题推荐
- 知识资产 chunk
- 问题路由信号
- few-shot / evidence / boundary 上下文分桶
- 面试回答
- 本次生成链路追踪

## 评测与质量控制

项目内置了回答质量检查和链路可解释性设计，关注以下维度：

- Intent Match: 回答是否真正回应用户输入的问题。
- JD Alignment: 回答是否贴合当前 JD 的岗位职责和能力要求。
- Evidence Grounding: 项目事实是否来自已上传资产。
- Boundary Safety: 是否避免夸大职责、指标和模型能力。
- Answer Quality: 回答是否有结构、有判断、有面试口语感。
- Context Transparency: 是否能看到本次生成使用了哪些上下文阶段。

当前版本更强调“面试可用性”和“上下文透明度”，而不是把所有答案都强制做成带引用角标的论文式回答。

## 实施难点与卡点

这个项目的主要难点不在于做一个问答页面，而在于让 JD、问题、个人资产、RAG 检索和大模型回答形成稳定的数据闭环。

### 1. JD 解析结果要即时驱动后续流程

早期问题是：用户上传新 JD 截图或粘贴新 JD 文本后，页面下方的结构化 JD 卡片有时没有立即刷新，导致后续推荐问题仍然沿用旧岗位上下文。

解决方式：

- 将 `JDContext` 作为全局关键状态管理。
- JD 解析成功后立即回写 `jdContext`。
- 推荐问题依赖 `jdContext.id`、公司、岗位和解析时间重新计算。
- 避免只更新局部 UI 而没有更新后续生成链路。

### 2. 推荐问题不能脱离 JD

普通问题生成很容易变成通用面试题，例如“请介绍一个项目”。但面试准备真正需要的是围绕当前 JD 的职责、能力标签和业务场景生成问题。

解决方式：

- 从 JD 中抽取核心职责、能力关键词和岗位定位。
- 按任务模式选择问题方向。
- 用规则 fallback 保证模型不可用时仍能生成 JD 相关问题。
- 对模型生成的问题做 JD 相关性过滤，避免泛化问题进入列表。

### 3. 自定义问题必须成为最高优先级输入

用户不一定会点击推荐问题，更多时候会直接输入真实面试问题。早期回答容易更贴系统预设问题，而不是贴用户输入框里的问题。

解决方式：

- 生成回答时以输入框中的 `question` 为唯一最终问题。
- 后端先用规则识别用户问题焦点，并结合问题关键词、JD 关键词和资产类别进行 chunk 召回。
- Prompt 中明确要求模型优先回答用户原始问题，而不是只复述 JD 或资产摘要。
- 回答质量检查中加入 Intent Match，判断是否真正回应了用户问题。

### 4. RAG 不能直接替代大模型回答

项目中一个关键产品判断是：面试回答需要自然、有判断力、有口语感。如果强制把 RAG 检索结果改写成带引用的答案，容易变得像资料摘录，不像真实面试表达。

解决方式：

- 前台不再强调“RAG 重写”。
- RAG 保留为隐式上下文选择层。
- 大模型负责最终回答组织。
- chunk 负责提供事实、few-shot 样例和风险边界。
- 直接回答版本不强制展示 `[Ref-N]`，但仍受事实边界约束。

### 5. Chunk 大类和问题路由需要分开设计

问题路由和 chunk 大类不是一回事。问题路由判断“这道题在考什么”，chunk 大类决定“应该喂给模型什么材料”。

解决方式：

- 先用规则识别问题焦点，例如项目深挖、幻觉治理、业务指标、需求分析、Agent / RAG 方案等。
- 再按焦点提高不同 chunk 类型的权重。
- 将召回结果分成 few-shot、evidence、risk/boundary 等桶。
- 在生成链路中展示每个阶段，让用户知道答案不是凭空生成的。

### 6. Few-shot 样例不能污染个人事实

面试复盘 Q&A 很适合作为 few-shot，因为它能教模型怎么回答、怎么组织攻防逻辑。但它不一定都是简历事实，如果直接当证据使用，会造成事实污染。

解决方式：

- few-shot chunks 只用于学习表达结构和考核点。
- evidence chunks 才能作为个人项目事实来源。
- risk/boundary chunks 用于提醒模型哪些不能说。
- Prompt 中明确区分“表达参考”和“事实依据”。

### 7. 风险边界要真正进入模型上下文

AI 项目面试里容易出现夸大风险，例如把 RAG 编排说成自研大模型，把算法团队能力说成个人完整 ownership，把理论知识说成真实项目经历。

解决方式：

- 单独设置 risk/boundary chunk 类别。
- 在问题涉及幻觉、合规、安全、权限、bad case 时提高边界材料召回优先级。
- 在模型 system instruction 中明确写入事实边界。
- 要求模型避免编造未出现在资产中的项目、指标、职责和产出。

### 8. 本地 Demo 与线上部署的数据边界不同

本地运行时，用户上传的资产会写入本地 SQLite 文件；但部署到 Render 后，如果不配置持久磁盘，线上上传文件不保证长期保存。

解决方式：

- 将 `.env`、`data/`、SQLite 文件、构建产物和私有资产全部加入 `.gitignore`。
- README 中明确说明公开仓库只包含演示数据和代码。
- Render 部署先支持 Demo 试用。
- 如果后续要做正式多人使用，需要接入持久化数据库、对象存储和登录权限。

### 9. 部署端口兼容

本地开发可以固定使用 `3000`，但 Render 这类平台会通过环境变量分配端口。如果后端写死端口，部署后服务可能无法启动。

解决方式：

- 后端监听端口改为 `process.env.PORT || 3000`。
- 保证本地和线上都能启动。
- 构建命令保持为 `npm install && npm run build`，启动命令为 `npm start`。

## 技术栈

- React 19
- TypeScript
- Vite
- Tailwind CSS
- Express
- SQL.js / SQLite
- pdf-parse
- OpenAI-compatible model API
- Zhipu GLM compatible mode
- lucide-react
- esbuild

## 项目结构

```text
career-rag-copilot/
  server.ts
  package.json
  vite.config.ts
  index.html
  src/
    App.tsx
    main.tsx
    types.ts
    components/
      WorkflowSection.tsx
      AnswerResultSection.tsx
      RagPipelineModal.tsx
      AssetDrawer.tsx
      BatchAssetUploader.tsx
      EvaluationSection.tsx
    utils/
      jdParser.ts
      questionGenerator.ts
      dynamicRagEngine.ts
    data/
      sampleData.ts
  docs/
    product-design.md
    rag-pipeline.md
    ontology-schema.md
```

## 本地运行

安装依赖：

```bash
npm install
```

复制环境变量文件：

```bash
cp .env.example .env
```

启动开发服务：

```bash
npm run dev
```

访问：

```text
http://localhost:3000
```

## 构建与生产启动

```bash
npm run build
npm start
```

## Render 部署

这个项目包含 Express 后端，所以不适合只用 GitHub Pages 发布。推荐使用 Render Web Service。

Render 配置：

```text
Build Command:
npm install && npm run build

Start Command:
npm start
```

环境变量：

```env
MODEL_PROVIDER=zhipu
ZHIPU_API_KEY=your_api_key_here
ZHIPU_BASE_URL=https://open.bigmodel.cn/api/paas/v4
ZHIPU_MODEL=glm-4.5-air
ZHIPU_VISION_MODEL=glm-ocr
ZHIPU_THINKING_TYPE=enabled
```

说明：

- 服务端已支持 `process.env.PORT`，可以适配 Render 的运行环境。
- 如果只是给面试官试用，可以先不配置持久磁盘。
- 如果需要长期保存线上上传资产，需要为 `data/` 配置持久化存储。

## 隐私说明

本仓库不包含个人真实简历、真实项目文档、面试录音、招聘平台截图、API Key 或本地数据库。

以下内容已通过 `.gitignore` 排除：

- `.env`
- `data/`
- `*.sqlite`
- `*.db`
- `dist/`
- `node_modules/`
- `output/`
- `.playwright-cli/`

公开仓库只保留产品流程、工程实现和演示数据。
