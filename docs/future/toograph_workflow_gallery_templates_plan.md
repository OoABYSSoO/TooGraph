# TooGraph Workflow Gallery 模板路线规划

> 版本：v0.1 Draft  
> 目标：为 TooGraph 仓库沉淀一份可执行的模板库开发路线，用于指导 P0～P2 模板建设、Demo 准备、文档编写和后续开源宣发。

---

## 1. 模板库定位

TooGraph 不应该只做“又一个 Agent 聊天框架”，而应该做一个 **Agent 工作流模板库**。

TooGraph Workflow Gallery 的核心定位是：

> 把真实任务拆成可运行、可观察、可迭代、可复用的 Agent 工作流模板。

模板的价值不应该停留在“让模型回答一段话”，而应该体现 TooGraph 的框架能力：

```text
多源输入
  ↓
任务拆解
  ↓
结构化中间产物
  ↓
多节点 Agent / Skill 协作
  ↓
用户反馈与多轮迭代
  ↓
Memory 沉淀
  ↓
Eval 评测
  ↓
Artifacts 输出
```

---

## 2. 模板筛选原则

以后判断一个模板是否值得做，可以使用以下 7 个标准。

### 2.1 是否比网页 ChatGPT 更工作流化

如果一个模板只是：

```text
用户输入一段话
  ↓
模型输出一段话
```

那它不值得作为 TooGraph 官方模板，因为 ChatGPT、Claude、Gemini 等网页产品已经可以完成。

值得做的模板应该具备：

```text
固定流程
多源输入
结构化中间状态
多轮追问
用户 Memory
引用 / 证据链
Artifacts 文件包
评测与返修
```

### 2.2 是否能体现 TooGraph 的框架能力

优先选择能体现以下能力的模板：

- Graph 编排
- Skills 调用
- Knowledge / RAG
- Memory
- Human-in-the-loop
- Eval
- Artifacts
- Revision Loop
- Citation / Evidence Trace

### 2.3 是否具备真实使用场景

模板不能只是“技术上能做”，还需要有明确用户：

- 普通用户
- 内容创作者
- 求职者
- 产品 / 运营
- 电商商家
- 开发者
- AIGC / 增长团队

### 2.4 是否能被清晰 Demo

首批模板必须能在 3～5 分钟内讲清楚：

```text
输入什么
经过哪些节点
输出什么
为什么比直接问模型更好
```

### 2.5 是否容易产出可展示的 Artifacts

优先选择能输出文件包的模板，例如：

```text
Markdown 文章
JSON 卡片
行动清单
候选标题
评测报告
分发稿
引用地图
最终报告
```

### 2.6 是否有可评测空间

好的模板应该能设计 Eval Case，例如：

- 是否引用了来源
- 是否遗漏关键条件
- 是否过度承诺
- 是否符合用户风格
- 是否降低 AI 味
- 是否输出完整文件包
- 是否通过结构化 schema 校验

### 2.7 是否有传播价值

模板最好具备一句话传播能力，例如：

```text
把官方政策文件变成普通人能看懂的权益清单。
每天自动整理 AI 新闻，并生成公众号文章。
把一篇文章改写成公众号、小红书、知乎、B站、X 多平台稿件，并去除 AI 味。
JD 进去，简历匹配、项目故事、模拟面试和准备计划出来。
```

---

## 3. 当前模板路线总览

### 3.1 P0：必须优先做

| 模板 | 中文名 | 优先级 | 状态 |
|---|---|---:|---|
| Policy Navigator Agent | 官方通知与政策白话解读 Agent | P0 | 确认保留 |
| AI News Digest to WeChat Article | AI 新闻整理与公众号文章生成 Agent | P0 | 确认保留 |
| Multi-platform Content Repurposer | 一文多发与去 AI 味改写 Agent | P0 | 确认保留 |

### 3.2 P1：建议首批或第二批完成

| 模板 | 中文名 | 优先级 | 状态 |
|---|---|---:|---|
| Job Application & Interview Coach | 简历匹配与面试准备 Agent | P1 | 确认保留，需设计差异化 |
| SLG Creative Factory | 游戏广告创意生产 Agent | P1 | 保留为高级展示模板 |

### 3.3 P2：后续展开

| 模板 | 中文名 | 优先级 | 状态 |
|---|---|---:|---|
| Product Competitor Research Agent | 产品竞品分析与需求洞察 Agent | P2 | 记录，后续展开 |
| E-commerce Review Mining Agent | 电商评论洞察与卖点提炼 Agent | P2 | 记录，后续展开 |

### 3.4 暂不做 / 存疑

| 模板 | 当前判断 | 原因 |
|---|---|---|
| Paper to Insight Report | 暂不做 | ChatGPT、Claude 等网页产品已经能较好完成普通论文阅读 |
| Meeting to PRD / Action Plan | 暂不做 | 飞书等办公软件已有原生会议总结、待办提取能力 |
| Codebase Onboarding Agent | 暂不做 | Cursor、Codex、Claude Code 等专业开发工具更适合代码场景 |
| Personal Knowledge Weekly Report | 存疑 | 应用面偏窄，使用场景不够强 |
| Long Video to Article Agent | 暂不做 | 已有人做，热度和刚需程度一般 |
| Course Builder Agent | 存疑 | 真正难点是教学质量、交付和反馈，不是生成课程内容 |
| Finance News Briefing Agent | 存疑 | 容易涉及投资建议边界，暂缓 |
| Customer Feedback Analysis Agent | 存疑 | 可与竞品分析、电商评论分析合并考虑 |
| Open Source Project Launch Agent | 不做 | 使用人群过小众，不适合作为官方重点模板 |

---

# 4. P0 模板一：Policy Navigator Agent

## 4.1 模板名称

英文名：`Policy Navigator Agent`  
中文名：`官方通知与政策白话解读 Agent`

## 4.2 一句话定位

> 把普通人看不懂、不愿意读的官方通知、政策文件、补贴公告、办事指南，整理成白话摘要、权益卡片、资格初判、办理清单，并通过多轮对话帮用户找到自己最关心的信息。

## 4.3 适用场景

适合处理：

- 政府通知
- 补贴政策
- 人才政策
- 落户政策
- 社保 / 医保通知
- 公积金政策
- 创业扶持政策
- 高校招生 / 就业通知
- 税费减免政策
- 消费券 / 购房 / 购车补贴公告
- 办事指南
- 公开征求意见稿

目标用户：

- 普通市民
- 高校学生 / 毕业生
- 个体户
- 小微企业主
- 创业者
- 宝妈 / 家庭用户
- 自由职业者
- 基层办事人员
- 内容创作者

## 4.4 为什么值得做

官方通知和政策文件常见问题：

```text
信息密度高
语言正式
关键条件分散
普通人不愿意读全文
不知道和自己有没有关系
不知道能不能申请
不知道要准备什么材料
不知道截止时间
不知道哪里办理
```

这个模板的价值不是替用户“做法律判断”，而是降低信息差：

```text
这份文件说了什么？
和谁有关？
我可能能获得什么？
我是否可能符合？
我还缺哪些信息？
下一步该做什么？
原文依据是哪一条？
哪些地方需要咨询官方？
```

## 4.5 工作流

```text
输入：官方通知链接 / PDF / Word / 网页文本 / 多份政策文件
        ↓
文件解析与来源校验
        ↓
政策元信息抽取
        ↓
条款切分与结构化
        ↓
政策权益卡片生成
        ↓
适用人群与限制条件提取
        ↓
办理流程 / 材料 / 时间节点提取
        ↓
白话摘要生成
        ↓
用户画像收集
        ↓
个性化匹配与资格初判
        ↓
多轮问答
        ↓
生成个人行动清单
        ↓
风险与不确定项提示
        ↓
输出政策解读包
```

## 4.6 核心 State

```json
{
  "policy_sources": "json",
  "raw_policy_text": "markdown",
  "policy_metadata": "json",
  "policy_sections": "json",
  "policy_cards": "json",
  "eligibility_rules": "json",
  "plain_language_summary": "markdown",
  "user_profile": "json",
  "user_questions": "json",
  "matched_benefits": "json",
  "eligibility_report": "markdown",
  "action_checklist": "json",
  "citation_map": "json",
  "uncertainty_report": "markdown",
  "final_policy_package": "result_package"
}
```

## 4.7 关键节点

### 4.7.1 `policy_source_validator`

检查来源可靠性：

```text
是否来自政府官网 / 学校官网 / 官方公众号 / 人社局 / 医保局 / 财政局等
是否有发布日期
是否有发文机关
是否有原文链接
是否可能只是转载内容
是否缺页
是否存在新旧文件冲突
```

输出：

```json
{
  "source_reliability": "official / likely_official / repost / unknown",
  "warnings": [
    "该文件来自转载页面，建议补充官方原文链接"
  ]
}
```

### 4.7.2 `policy_metadata_extractor`

抽取：

```json
{
  "title": "关于发放高校毕业生就业补贴的通知",
  "issuer": "某市人力资源和社会保障局",
  "document_no": "市人社发〔2025〕xx号",
  "publish_date": "2025-06-01",
  "effective_date": "2025-06-01",
  "valid_until": "2025-12-31",
  "region": "陕西省西安市",
  "policy_type": "就业补贴",
  "target_groups": ["高校毕业生", "小微企业"]
}
```

### 4.7.3 `policy_clause_structurer`

将原文切成条款：

```json
[
  {
    "clause_id": "C001",
    "title": "补贴对象",
    "raw_text": "毕业年度高校毕业生...",
    "plain_text": "主要面向毕业当年的高校毕业生。",
    "clause_type": "eligibility",
    "keywords": ["高校毕业生", "毕业年度", "就业补贴"]
  }
]
```

### 4.7.4 `policy_card_builder`

生成政策权益卡片：

```json
{
  "card_id": "benefit_001",
  "name": "高校毕业生一次性就业补贴",
  "who_can_apply": [
    "毕业年度高校毕业生",
    "已在本市就业",
    "符合社保或劳动合同要求"
  ],
  "benefit": "可申请一次性补贴，金额以原文为准",
  "amount": "1000元",
  "deadline": "2025-12-31",
  "where_to_apply": "当地人社部门或指定线上平台",
  "required_materials": ["身份证", "毕业证", "劳动合同", "社保缴纳证明"],
  "exclusion_rules": ["已享受同类补贴的人可能不能重复申请"],
  "source_clauses": ["C001", "C002", "C003"]
}
```

### 4.7.5 `user_profile_collector`

根据政策类型动态追问用户画像。

示例问题：

```text
你目前在哪个城市？
你的身份是学生、上班族、个体户、企业主还是其他？
你最关心补贴、资格、办理材料还是截止时间？
你是否已缴纳社保？
你是否已申请过同类补贴？
```

### 4.7.6 `eligibility_matcher`

输出资格初判，必须使用谨慎表达：

```text
可能符合
可能不符合
信息不足
```

不要输出：

```text
你一定符合
你一定能领
```

### 4.7.7 `uncertainty_and_risk_checker`

输出：

```text
原文没有明确说明的事项
需要咨询官方的事项
政策可能过期或被新文件替代的风险
用户信息不足导致的不确定项
```

## 4.8 输出物

```text
policy_plain_summary.md
policy_cards.json
eligibility_report.md
action_checklist.json
citation_map.json
uncertainty_report.md
qa_transcript.md
final_policy_package.md
```

## 4.9 比网页 ChatGPT 更好的点

```text
强制引用原文条款
不直接给确定性承诺
通过多轮对话收集用户画像
输出个人行动清单
标记不确定项和官方确认事项
可以处理多份政策的新旧对比
生成完整政策解读包
```

## 4.10 安全边界

模板 README 和最终输出中必须包含：

```text
本模板仅用于政策信息整理和辅助理解，不构成法律、财务或行政审批建议。
最终解释和办理结果以主管部门、官方窗口或正式文件为准。
```

## 4.11 Eval 设计

### Case 1：基础摘要完整性

检查是否提取：

```text
发文机关
发布时间
适用对象
政策内容
申请材料
截止时间
办理入口
```

### Case 2：资格判断谨慎性

用户信息不完整时，必须输出：

```text
信息不足
需要进一步确认
不能直接说一定符合
```

### Case 3：户籍限制未明确

如果原文没有写户籍限制，回答必须：

```text
说明原文未明确
不得编造户籍限制
建议咨询官方
```

### Case 4：多文件冲突

如果旧通知和新通知金额不同，回答必须：

```text
识别发布时间
提示新文件可能覆盖旧文件
说明需要确认有效性
```

---

# 5. P0 模板二：AI News Digest to WeChat Article

## 5.1 模板名称

英文名：`AI News Digest to WeChat Article`  
中文名：`AI 新闻整理与公众号文章生成 Agent`

## 5.2 一句话定位

> 自动整理 AI 新闻，去重、聚类、排序、提炼影响，生成公众号文章，并输出小红书、知乎、B站、X 等平台的分发稿。

## 5.3 适用人群

```text
AI 博主
公众号作者
小红书 / 知乎 / B站创作者
行业研究员
技术社群运营
内容运营
```

## 5.4 工作流

```text
输入：关注领域 / 时间范围 / 新闻源 / 目标平台 / 文章风格
  ↓
新闻源抓取：RSS / 用户粘贴链接 / 手动上传网页内容
  ↓
新闻清洗：去重、过滤低价值内容、提取事实
  ↓
主题聚类：模型、产品、融资、开源、政策、研究、应用
  ↓
重要性评分：影响力、时效性、争议性、受众相关性
  ↓
生成今日 Top N 新闻卡片
  ↓
生成公众号文章大纲
  ↓
生成正文
  ↓
事实一致性检查
  ↓
生成标题候选
  ↓
生成摘要、小红书笔记、知乎文章、B站口播稿、X Thread
  ↓
输出内容包
```

## 5.5 核心 State

```json
{
  "topic": "text",
  "date_range": "text",
  "news_sources": "json",
  "raw_news_items": "json",
  "clean_news_items": "json",
  "clustered_topics": "json",
  "top_news_cards": "json",
  "importance_ranking": "json",
  "article_outline": "markdown",
  "wechat_article": "markdown",
  "fact_check_report": "json",
  "title_candidates": "json",
  "distribution_pack": "json",
  "final_content_package": "result_package"
}
```

## 5.6 关键 Skills

```text
rss_fetcher
url_content_extractor
news_cleaner
news_deduplicator
topic_clusterer
importance_ranker
article_outline_builder
wechat_article_writer
fact_consistency_checker
multi_platform_rewriter
artifact_writer
```

## 5.7 输出物

```text
top_news_cards.json
ai_news_digest.md
wechat_article.md
fact_check_report.json
title_candidates.json
xiaohongshu_note.md
zhihu_article.md
bilibili_script.md
x_thread.md
cover_prompt.txt
final_content_package.md
```

## 5.8 比网页 ChatGPT 更好的点

```text
自动处理多源新闻，而不是用户自己复制粘贴
自动去重和主题聚类
保留每条新闻的来源和引用
输出完整内容包，而不是单段回答
可以持续沉淀用户选题偏好和写作风格
可以每天 / 每周重复运行，形成固定内容生产流程
```

## 5.9 MVP 版本

第一版不需要做复杂爬虫，可以支持：

```text
用户粘贴多条新闻链接 / 文本
  ↓
去重
  ↓
聚类
  ↓
Top 新闻卡片
  ↓
公众号文章
  ↓
多平台分发稿
```

## 5.10 Eval 设计

```text
是否输出 Top 新闻卡片
是否对新闻去重
是否保留来源
是否区分事实和观点
是否避免编造没有来源的信息
公众号文章是否结构完整
多平台稿件是否符合平台风格
```

---

# 6. P0 模板三：Multi-platform Content Repurposer

## 6.1 模板名称

英文名：`Multi-platform Content Repurposer`  
中文名：`一文多发与去 AI 味改写 Agent`

## 6.2 一句话定位

> 将一篇原始内容改写成公众号、小红书、知乎、B站、抖音、X、YouTube 等多平台版本，并根据用户历史内容学习个人风格，通过多轮修改降低 AI 味。

## 6.3 适用人群

```text
内容创作者
技术博主
独立开发者
公众号运营
小红书 / 知乎 / B站创作者
开源项目作者
自媒体团队
```

## 6.4 核心问题

普通改写很容易产生：

```text
AI 味重
表达空泛
排比过度
总结腔明显
不符合个人风格
每个平台都像同一篇稿子
缺少创作者自己的判断和语气
```

这个模板的核心不是“改写”，而是：

```text
历史风格学习
AI 味检测
多轮反馈迭代
平台差异化重写
Memory 沉淀
风格一致性评分
```

## 6.5 工作流

```text
输入：原始文章 / README / 视频脚本 / 公众号文章 / 用户历史样本
  ↓
提取核心观点
  ↓
识别目标平台
  ↓
读取用户历史风格样本
  ↓
生成用户风格画像
  ↓
生成各平台初稿
  ↓
AI 味检测
  ↓
按用户风格重写
  ↓
用户反馈
  ↓
二次修改
  ↓
风格一致性评分
  ↓
平台适配评分
  ↓
输出多平台内容包
  ↓
写入风格 Memory
```

## 6.6 核心 State

```json
{
  "source_content": "markdown",
  "target_platforms": "json",
  "historical_samples": "json",
  "core_message": "json",
  "style_profile": "json",
  "platform_strategy": "json",
  "draft_outputs": "json",
  "ai_tone_report": "json",
  "human_feedback": "markdown",
  "style_rewrite_outputs": "json",
  "style_consistency_score": "json",
  "final_distribution_pack": "result_package"
}
```

## 6.7 关键节点

### 6.7.1 `style_profiler`

从用户历史内容中提取：

```text
常用句式
段落长度
语气强弱
是否口语化
是否喜欢反问
是否喜欢举例
是否喜欢下判断
标题风格
是否使用网络表达
是否倾向短句或长句
```

### 6.7.2 `ai_tone_detector`

检测 AI 味：

```text
空泛总结
过度排比
“首先，其次，最后”过多
“值得注意的是”过多
缺少具体例子
缺少个人判断
语气过度中性
结尾过度升华
```

输出：

```json
{
  "ai_tone_score": 0.78,
  "problem_sentences": [
    {
      "text": "这无疑将极大提升效率。",
      "reason": "空泛判断，没有具体依据"
    }
  ],
  "rewrite_suggestions": [
    "加入个人经验",
    "减少总结腔",
    "用更具体的例子替代抽象表达"
  ]
}
```

### 6.7.3 `human_like_rewriter`

按用户风格改写。

### 6.7.4 `feedback_memory_writer`

把本次用户修改偏好写入 Memory：

```json
{
  "memory_type": "writing_style_preference",
  "content": "用户不喜欢过度排比，偏好直接、有判断、有具体例子的表达。"
}
```

## 6.8 输出物

```text
core_message.json
style_profile.json
ai_tone_report.json
wechat_article.md
zhihu_article.md
xiaohongshu_note.md
bilibili_script.md
douyin_script.md
x_thread.md
youtube_description.md
cover_prompts.txt
publishing_plan.json
final_distribution_pack.md
```

## 6.9 比网页 ChatGPT 更好的点

```text
有用户风格 Memory
能根据历史文章学习用户风格
有 AI 味检测报告
支持多轮修改闭环
能输出平台内容包
能越用越贴近用户本人表达
```

## 6.10 Eval 设计

```text
是否保留原文核心观点
是否符合目标平台风格
AI 味评分是否下降
是否符合用户历史风格
是否生成完整分发包
用户反馈后是否真的修改对应问题
```

---

# 7. P1 模板一：Job Application & Interview Coach

## 7.1 模板名称

英文名：`Job Application & Interview Coach`  
中文名：`简历匹配与面试准备 Agent`

## 7.2 一句话定位

> 根据用户长期职业画像、项目经历和目标 JD，生成岗位匹配报告、简历改写、项目故事库、面试题预测、模拟面试反馈和阶段性准备计划。

## 7.3 为什么需要重新设计

普通 ChatGPT 已经能做：

```text
分析 JD
改简历
模拟面试
```

TooGraph 版本必须做到：

```text
候选人长期画像
多岗位对比
项目故事库
多轮模拟面试记录
薄弱点追踪
目标城市和薪资策略
准备计划看板
```

## 7.4 工作流

```text
输入：简历 / 项目经历 / 目标 JD / 目标城市 / 目标薪资
  ↓
JD 能力拆解
  ↓
候选人经历匹配
  ↓
差距分析
  ↓
项目故事线生成
  ↓
简历 bullet 改写
  ↓
面试题预测
  ↓
模拟面试
  ↓
回答评分
  ↓
薄弱点训练计划
  ↓
写入候选人 Memory
```

## 7.5 核心 State

```json
{
  "candidate_profile": "json",
  "resume": "markdown",
  "project_experiences": "json",
  "job_description": "markdown",
  "target_city": "text",
  "salary_expectation": "text",
  "jd_requirements": "json",
  "matching_report": "json",
  "gap_analysis": "markdown",
  "resume_rewrite": "markdown",
  "project_story_library": "json",
  "interview_questions": "json",
  "mock_interview_transcript": "json",
  "mock_interview_feedback": "markdown",
  "learning_plan": "markdown"
}
```

## 7.6 关键产物

```text
jd_requirement_matrix.json
matching_report.md
gap_analysis.md
rewritten_resume.md
project_story_library.json
interview_questions.json
mock_interview_feedback.md
learning_plan.md
salary_strategy.md
```

## 7.7 比网页 ChatGPT 更好的点

```text
长期记住用户经历
维护项目故事库
可比较多个 JD 的匹配度
多轮模拟面试并记录薄弱点
按目标城市、行业、岗位调整薪资策略
输出准备任务看板
```

## 7.8 Eval 设计

```text
是否完整拆解 JD
是否准确映射候选人经历
简历 bullet 是否具体且可验证
项目故事是否符合 STAR / CAR 结构
模拟面试反馈是否指出具体问题
学习计划是否有时间和任务安排
```

---

# 8. P1 模板二：SLG Creative Factory

## 8.1 模板名称

英文名：`SLG Creative Factory`  
中文名：`游戏广告创意生产 Agent`

## 8.2 一句话定位

> 将游戏广告创意生产流程拆成可观察的 Agent 工作流：新闻辅助、竞品素材分析、视频理解、模式总结、Creative Brief、多版本脚本、图片分镜、视频提示词、审核评分、返修循环和 Artifacts 输出。

## 8.3 模板定位

这个模板不是大众模板，而是 **高级展示模板**，用于体现 TooGraph 处理复杂业务 Agent 工作流的能力。

它适合展示：

```text
多源输入
视频理解
素材分析
模式总结
Brief 生成
多版本创意
分镜脚本
视频提示词
审核评分
返修循环
Artifacts 落盘
```

## 8.4 参考工作流

```text
RSS 新闻抓取
  ↓
新闻清洗
  ↓
广告素材抓取 / 用户上传素材
  ↓
素材规范化
  ↓
筛选 Top 视频
  ↓
视频理解
  ↓
竞品模式总结
  ↓
新闻辅助上下文
  ↓
Creative Brief
  ↓
多版本创意脚本
  ↓
图片分镜脚本
  ↓
两类视频提示词
  ↓
创意评分审核
  ↓
是否通过？
    ├─ 否：根据反馈重写
    └─ 是：进入最终输出
  ↓
图片生成 TODO / 视频生成 TODO
  ↓
最终创意包
```

## 8.5 核心 State

```json
{
  "rss_items": "json",
  "clean_news_items": "json",
  "ad_items": "json",
  "normalized_video_items": "json",
  "selected_video_items": "json",
  "video_analysis_results": "json",
  "news_context": "markdown",
  "pattern_summary": "markdown",
  "creative_brief": "markdown",
  "script_variants": "json",
  "storyboard_packages": "json",
  "video_prompt_packages": "json",
  "review_results": "json",
  "best_variant": "json",
  "revision_feedback": "json",
  "image_generation_todo": "json",
  "video_generation_todo": "json",
  "final_summary": "markdown"
}
```

## 8.6 输出物

```text
creative_brief.md
pattern_summary.md
news_context.md
script_variants.json
storyboards_showcase.md
video_prompts_showcase.md
review_results.json
best_variant.json
todo_image_generation.md
todo_video_generation.md
final_summary.md
```

## 8.7 比网页 ChatGPT 更好的点

```text
处理多源输入和视频素材
每个步骤都有中间产物
支持评分审核和返修循环
能输出完整创意文件包
能复用为 TooGraph 模板
能展示复杂 Agent pipeline，而不是单次问答
```

## 8.8 注意事项

公开模板中建议支持两种输入模式：

### 轻量模式

```text
用户上传素材分析文本 / 示例素材
  ↓
生成 Brief、脚本、分镜、视频提示词
```

### 完整模式

```text
RSS / 广告素材 / 视频理解 / 审核返修完整链路
```

不要让用户第一次运行就必须依赖复杂抓取。应提供示例数据和 mock mode。

---

# 9. P2 模板一：Product Competitor Research Agent

## 9.1 模板名称

英文名：`Product Competitor Research Agent`  
中文名：`产品竞品分析与需求洞察 Agent`

## 9.2 一句话定位

> 输入产品方向、竞品资料、用户评论和访谈材料，自动生成竞品画像、功能矩阵、用户痛点、机会点排序、MVP 方案和 PRD 草稿。

## 9.3 工作流

```text
输入：产品方向 / 竞品链接 / 用户评论 / 应用商店评价 / 官网 / 截图 / 用户访谈
  ↓
竞品资料整理
  ↓
功能矩阵生成
  ↓
评论与反馈聚类
  ↓
用户痛点提取
  ↓
产品机会点排序
  ↓
MVP 方案生成
  ↓
PRD 草稿生成
  ↓
风险和验证计划
```

## 9.4 核心 State

```json
{
  "product_idea": "markdown",
  "competitor_sources": "json",
  "competitor_profiles": "json",
  "feature_matrix": "json",
  "user_review_clusters": "json",
  "pain_points": "json",
  "opportunity_report": "markdown",
  "mvp_plan": "markdown",
  "prd_draft": "markdown",
  "validation_plan": "markdown"
}
```

## 9.5 输出物

```text
competitor_profiles.json
feature_matrix.csv
review_clusters.json
pain_points.md
opportunity_report.md
mvp_plan.md
prd_draft.md
validation_plan.md
```

## 9.6 比网页 ChatGPT 更好的点

```text
可以导入评论、截图、竞品链接、访谈等多源材料
输出功能矩阵和证据链
每个结论可关联来源
可以生成 MVP 计划和 PRD 草稿
可以多轮追问用户目标，例如差异化、增长、降本、MVP 验证
```

## 9.7 暂缓原因

这个模板有商业价值，但需要设计好数据输入、证据链和评论处理能力。如果做浅了，会变成普通 ChatGPT 竞品分析，所以放到 P2。

---

# 10. P2 模板二：E-commerce Review Mining Agent

## 10.1 模板名称

英文名：`E-commerce Review Mining Agent`  
中文名：`电商评论洞察与卖点提炼 Agent`

## 10.2 一句话定位

> 批量分析商品评论和竞品评论，提炼好评点、差评点、用户画像、购买动机、卖点、风险点，并生成详情页文案、短视频脚本和小红书种草笔记。

## 10.3 工作流

```text
输入：商品评论 / 竞品评论 / 店铺评价 / 用户反馈
  ↓
评论清洗
  ↓
好评点聚类
  ↓
差评点聚类
  ↓
用户画像推断
  ↓
购买动机分析
  ↓
卖点提炼
  ↓
风险点提炼
  ↓
详情页文案
  ↓
短视频脚本
  ↓
小红书种草笔记
```

## 10.4 核心 State

```json
{
  "raw_reviews": "json",
  "clean_reviews": "json",
  "positive_review_clusters": "json",
  "negative_review_clusters": "json",
  "user_persona": "markdown",
  "purchase_motivation": "markdown",
  "selling_points": "markdown",
  "risk_points": "markdown",
  "product_copy": "markdown",
  "short_video_scripts": "json",
  "xiaohongshu_notes": "json"
}
```

## 10.5 输出物

```text
positive_review_clusters.json
negative_review_clusters.json
user_persona.md
purchase_motivation.md
selling_points.md
risk_points.md
product_copy.md
short_video_scripts.md
xiaohongshu_notes.md
```

## 10.6 比网页 ChatGPT 更好的点

```text
批量处理大量评论
将评论聚类成稳定类别
每个卖点关联真实评论证据
可以对比自己商品和竞品商品
能输出多平台营销素材
```

## 10.7 暂缓原因

这个模板值得展开，但需要考虑评论来源、批量导入、证据链、平台合规和输出质量。暂时放到 P2。

---

# 11. 暂不做模板说明

## 11.1 Paper to Insight Report

当前判断：暂不做。

原因：

```text
ChatGPT、Claude、Gemini 等网页产品已经能较好地读论文。
专业论文阅读工具也很多。
如果只是做论文摘要，没有明显差异化。
```

除非后续升级为：

```text
论文 → 可复现实验计划 → 代码实现任务 → 相关论文图谱 → 项目落地方案
```

否则不进入首批。

## 11.2 Meeting to PRD / Action Plan

当前判断：暂不做。

原因：

```text
飞书、钉钉、腾讯会议等办公软件已经集成会议总结、待办提取。
它们有原生会议上下文和组织协同能力。
TooGraph 做普通会议纪要没有优势。
```

## 11.3 Codebase Onboarding Agent

当前判断：暂不做。

原因：

```text
开发者已经在使用 Cursor、Codex、Claude Code、GitHub Copilot 等专业工具。
这些工具天然接近代码环境，能力更强。
TooGraph 做普通代码理解没有竞争优势。
```

## 11.4 Personal Knowledge Weekly Report

当前判断：存疑，先不做。

原因：

```text
更适合 Obsidian、Notion、个人知识管理用户。
大众使用场景不够强。
```

## 11.5 Long Video to Article Agent

当前判断：暂不做。

原因：

```text
已经有人做。
热度和刚需程度不够确定。
```

## 11.6 Course Builder Agent

当前判断：存疑，先不做。

原因：

```text
生成课程不难。
真正难的是教学质量、体系设计、交付和反馈。
```

## 11.7 Finance News Briefing Agent

当前判断：存疑，先不做。

原因：

```text
财经方向容易涉及投资建议边界。
需要更谨慎的合规设计。
```

## 11.8 Customer Feedback Analysis Agent

当前判断：存疑，先不做。

原因：

```text
它和 Product Competitor Research、E-commerce Review Mining 有重叠。
可以后续考虑合并或作为子模块。
```

## 11.9 Open Source Project Launch Agent

当前判断：不做。

原因：

```text
使用人群太小众。
可以内部自用，但不适合作为 TooGraph 官方重点模板。
```

---

# 12. 官方模板目录规范

建议每个模板使用统一目录结构：

```text
templates/official/<template_id>/
  template.json
  README.md
  graph.json
  sample_inputs/
  sample_outputs/
  skills/
  eval_cases/
  screenshots/
```

## 12.1 template.json 示例

```json
{
  "template_id": "policy_navigator_agent",
  "name": "Policy Navigator Agent",
  "description": "Parse official policy notices into plain-language summaries, benefit cards, eligibility reports and personalized action checklists.",
  "category": "public_utility",
  "difficulty": "beginner",
  "estimated_runtime": "3-10 min",
  "required_skills": [
    "official_document_parser",
    "policy_metadata_extractor",
    "policy_card_builder",
    "eligibility_rule_extractor",
    "policy_qa_with_citations",
    "action_checklist_writer"
  ],
  "inputs": [
    {
      "key": "policy_source",
      "type": "file_or_url",
      "required": true
    },
    {
      "key": "user_question",
      "type": "text",
      "required": false
    }
  ],
  "outputs": [
    "plain_language_summary",
    "policy_cards",
    "eligibility_report",
    "action_checklist",
    "citation_map",
    "uncertainty_report"
  ],
  "tags": ["policy", "public_utility", "qa", "citations"]
}
```

## 12.2 README.md 标准结构

```md
# Template Name

## What it does

## Who is it for

## Workflow

## Inputs

## Outputs

## Required skills

## Sample run

## Eval cases

## Safety notes

## Customization
```

---

# 13. 模板轻量模式与完整模式

每个模板都应该设计两种运行模式。

## 13.1 轻量模式

目标：让用户第一次能快速跑起来。

示例：

```text
AI News：用户粘贴 5 条新闻链接
Policy：用户粘贴一份通知正文
Multi-platform：用户粘贴一篇文章和一篇历史样本
Job Coach：用户粘贴简历和 JD
SLG：用户使用示例素材分析结果
```

## 13.2 完整模式

目标：展示 TooGraph 的完整工作流能力。

示例：

```text
AI News：RSS + 去重 + 聚类 + 事实检查 + 多平台分发
Policy：多文件解析 + 条款引用 + 用户画像 + 多轮问答
Multi-platform：历史样本库 + AI 味检测 + 多轮反馈 + Memory
Job Coach：项目故事库 + 多轮模拟面试 + 薄弱点追踪
SLG：RSS + 素材抓取/上传 + 视频理解 + 审核返修
```

---

# 14. 首发模板建议

TooGraph v0.1 建议主推 3 个大众模板 + 1 个求职模板 + 1 个复杂业务模板。

```text
1. Policy Navigator Agent
2. AI News Digest to WeChat Article
3. Multi-platform Content Repurposer
4. Job Application & Interview Coach
5. SLG Creative Factory
```

## 14.1 首发卖点

```text
TooGraph 不是又一个聊天机器人框架。
它把真实任务做成可运行、可观察、可迭代、可复用的 Agent 工作流模板。
```

## 14.2 首发宣传语

中文：

```text
TooGraph：把真实工作流程做成可视化 Agent 模板。
```

英文：

```text
TooGraph: Visual workflow templates for real-world AI agents.
```

---

# 15. 后续迭代路线

## v0.1

```text
完成 Policy Navigator Agent
完成 AI News Digest to WeChat Article
完成 Multi-platform Content Repurposer
完成 Job Application & Interview Coach 初版
整理 SLG Creative Factory 模板思路和示例数据
```

## v0.2

```text
增强 Memory 模块
增强模板 Eval
完善用户风格学习
完善政策引用溯源
开始 Product Competitor Research Agent
```

## v0.3

```text
上线 E-commerce Review Mining Agent
扩展模板 Gallery 页面
支持社区模板贡献
支持模板级评分和示例输出展示
```

---

# 16. 总结

TooGraph 官方模板库的核心方向应当是：

```text
少做“单次问答型模板”
多做“可运行工作流模板”
少做网页 ChatGPT 已经很强的场景
多做需要 Memory、RAG、Eval、Artifacts、证据链和多轮迭代的场景
```

当前最值得优先推进的模板是：

```text
Policy Navigator Agent
AI News Digest to WeChat Article
Multi-platform Content Repurposer
```

它们分别覆盖：

```text
公共信息差
内容生产
个人风格化分发
```

再配合：

```text
Job Application & Interview Coach
SLG Creative Factory
```

TooGraph 的首批模板库就能同时具备：

```text
大众传播价值
实际使用价值
Agent 工程化展示价值
开源项目差异化
```
