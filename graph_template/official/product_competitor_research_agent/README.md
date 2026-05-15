# 产品竞品研究助手

## 用途

把产品方向、竞品资料、用户评论和访谈材料转成证据链明确的竞品画像、功能矩阵、用户痛点、机会点排序、MVP 方案、PRD 草稿、验证计划和最终研究包。

## 目标用户

- 产品经理、创业团队、增长团队
- 用户研究员、运营团队、独立开发者

## 工作流

1. 读取产品方向、竞品资料、用户评论、访谈材料、目标市场、研究目标和已有知识。
2. 通过 `buddy_session_recall` 只读召回产品偏好、历史调研结论和验证经验。
3. 建立证据索引，保留每个结论的来源和可信度。
4. 生成竞品画像和可追溯功能矩阵。
5. 清洗并聚类用户反馈，提炼痛点和现有方案不足。
6. 排序产品机会点，输出取舍和假设。
7. 生成 MVP 方案、PRD 草稿和验证计划。
8. 标出可供 Buddy 后台记忆整理参考的稳定产品偏好、调研约束或验证经验，不直接写长期记忆。

## 输入

- `product_idea`: 产品方向和初始假设。
- `competitor_sources`: 竞品官网、功能说明、截图 OCR 或人工整理材料。
- `user_reviews`: 应用商店评论、社媒反馈、客服记录或社区讨论。
- `interview_notes`: 访谈、销售反馈、运营记录或内部调研摘要。
- `target_market`: 目标行业、人群、地区、渠道和商业约束。
- `research_goal`: 本次研究要回答的问题。
- `existing_knowledge_notes`: 团队已有知识和必须复用的约束。

## 输出

- `competitor_profiles.json`
- `feature_matrix.csv`
- `review_clusters.json`
- `pain_points.md`
- `opportunity_report.md`
- `mvp_plan.md`
- `prd_draft.md`
- `validation_plan.md`
- `final_research_package.md`

## Required Skills/Subgraphs

- `buddy_session_recall`: 只读召回产品偏好、历史调研结论和验证经验。

## Sample Run

使用 `examples/mock_product_research_input.json`，并参考：

- `mock_data/sample_competitor_sources.md`
- `mock_data/sample_user_reviews.md`
- `artifacts/sample_final_research_package.md`

## Eval Cases

`eval_cases.json` 覆盖证据链、功能矩阵、评论聚类、机会点排序、MVP/PRD 假设边界和验证计划。

## Safety Notes

- 不编造竞品功能、定价、用户数、融资或市场数据。
- 少量评论只能作为定性线索，不能包装成统计结论。
- PRD 必须区分证据、推断和假设。
- 本模板不直接写长期记忆；稳定产品经验应由 Buddy 后台记忆整理模板写入 `MEMORY.md`。

## Customization

- 完整模式可接入 URL 抽取、截图 OCR、应用商店评论导入和知识库检索。
- 可扩展为多阶段研究：竞品资料收集、用户访谈、MVP 测试、PRD 迭代。
