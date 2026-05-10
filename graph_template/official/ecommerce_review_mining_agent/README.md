# 电商评论洞察挖掘助手

## 用途

批量分析商品评论、竞品评论和店铺反馈，提炼好评点、差评点、用户画像、购买动机、卖点、风险点，并生成详情页文案、短视频脚本和小红书种草笔记。

## 目标用户

- 电商运营、品牌方、商品经理
- 内容营销团队、客服和售后团队

## 工作流

1. 读取商品背景、自家评论、竞品评论、店铺反馈、目标平台、营销目标和合规说明。
2. 通过 `memory_recall` 只读召回历史卖点、禁用词、合规经验和评论洞察偏好。
3. 清洗评论并建立证据索引，区分自家商品、竞品和店铺反馈。
4. 聚类好评点和差评点。
5. 推断用户画像和购买动机，保留证据和不确定项。
6. 提炼卖点和风险点。
7. 生成详情页文案、短视频脚本和小红书笔记。
8. 通过 `memory_candidate_writer` 写入 candidate 状态的评论洞察候选。

## 输入

- `product_context`: 商品类型、价格带、渠道、目标人群和营销约束。
- `raw_reviews`: 自家商品评论，支持 CSV/JSON/粘贴文本。
- `competitor_reviews`: 竞品评论、问答、差评和社媒反馈。
- `store_feedback`: 客服记录、退货原因、私域反馈或运营观察。
- `target_platforms`: 详情页、短视频、小红书等目标平台。
- `marketing_goal`: 本次评论挖掘服务的转化目标。
- `compliance_notes`: 平台限制、禁用词和人工审核边界。

## 输出

- `positive_review_clusters.json`
- `negative_review_clusters.json`
- `user_persona.md`
- `purchase_motivation.md`
- `selling_points.md`
- `risk_points.md`
- `product_copy.md`
- `short_video_scripts.md`
- `xiaohongshu_notes.md`
- `final_review_mining_package.md`

## Required Skills/Subgraphs

- `memory_recall`: 只读召回历史卖点、禁用词和评论洞察经验。
- `memory_candidate_writer`: 只写 candidate 状态候选记忆，不自动应用为 active。

## Sample Run

使用 `examples/mock_ecommerce_review_input.json`，并参考：

- `mock_data/sample_reviews.csv`
- `mock_data/sample_competitor_reviews.md`
- `artifacts/sample_final_review_mining_package.md`

## Eval Cases

`eval_cases.json` 覆盖评论清洗、正负向聚类、证据引用、卖点/风险边界、合规文案和候选记忆状态。

## Safety Notes

- 不把少量评论包装成统计结论。
- 不生成无来源功效承诺、绝对化宣传、虚假稀缺或竞品贬损。
- 营销素材投放前必须人工合规审核。
- 候选记忆只写入 candidate 状态，等待人工审核。

## Customization

- 完整模式可接入电商平台评论导入、CSV 批处理、竞品区分、平台合规词库和素材生成下游模板。
