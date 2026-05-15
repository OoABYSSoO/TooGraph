# AI 新闻公众号助手

## 用途

把多条 AI 新闻材料整理成可追溯的 Top 新闻卡片、公众号文章、事实检查报告、标题候选和多平台分发包。

## 目标用户

AI 博主、公众号作者、技术社群运营、行业研究员和内容运营。

## 工作流

1. 输入关注主题、时间范围、新闻材料、是否联网、目标平台和写作风格。
2. 召回用户内容偏好和历史平台风格。
3. 准备新闻获取计划；`use_web_search=true` 时运行 `web_search`，否则使用粘贴或 mock 材料。
4. 清洗去重新闻，生成 citation map。
5. 主题聚类并按影响力、确定性、受众相关性和新鲜度排序。
6. 生成 Top 新闻卡片、公众号大纲、正文和标题候选。
7. 进行事实一致性检查，标记无来源断言和人工确认事项。
8. 生成小红书、知乎、B站、X 等分发稿和最终内容包。

## 输入

- `topic`：新闻关注主题。
- `date_range`：时间范围。
- `raw_news_items`：用户粘贴的链接、摘要、原文片段或 mock 新闻材料。
- `use_web_search`：是否运行联网搜索。
- `target_platforms`：目标分发平台。
- `style_brief`：写作风格和受众约束。

## 输出

- `top_news_cards.json`
- `ai_news_digest.md`
- `wechat_article.md`
- `fact_check_report.json`
- `title_candidates.json`
- `distribution_pack.json`
- `final_content_package.md`

## Required Skills/Subgraphs

- `buddy_session_recall`
- `web_search`

轻量 mock 模式默认 `use_web_search=false`，不需要外部账号。完整模式使用 `web_search`，权限需求为 `network`、`secret_read`、`browser_automation`。

## Sample Run

示例输入见 `examples/mock_news_input.json`，mock 新闻材料见 `mock_data/sample_ai_news_items.md`，示例输出见 `artifacts/sample_final_content_package.md`。

## Eval Cases

见 `eval_cases.json`。首个 case 检查 Top 新闻卡片、去重、来源引用、事实/观点分离和多平台分发完整性。

## Safety Notes

- 没有来源的新闻事实必须进入 `fact_check_report.unsupported_claims`。
- 公众号正文必须区分事实、影响和观点。
- 多平台分发稿不能删除关键风险和引用边界。

## Customization

后续可以接入 RSS 源、定时运行、主题订阅、用户选题偏好记忆、封面提示词和更细的分发平台评分。
