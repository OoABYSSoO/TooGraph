# 一文多发内容改写助手

## 用途

把原始文章、README 或脚本改写成公众号、小红书、知乎、B站、抖音、X、YouTube 等多平台内容包。

## 目标用户

内容创作者、技术博主、独立开发者、开源项目作者和自媒体团队。

## 工作流

1. 输入源内容、目标平台、历史样本、传播目标和可选人工反馈。
2. 只读召回用户风格记忆。
3. 提取核心观点、关键事实、例子和禁改项。
4. 结合历史样本和召回记忆生成用户风格画像。
5. 为每个平台制定结构、语气、长度和 CTA 策略。
6. 生成平台初稿并检测 AI 味。
7. 按用户风格和人工反馈重写。
8. 评估风格一致性、平台适配和发布计划。
9. 组装最终多平台内容包，并标出可供后台记忆整理参考的稳定偏好。

## 输入

- `source_content`：原始文章、README、脚本或 mock 内容。
- `target_platforms`：目标平台列表。
- `historical_samples`：历史样本或风格参考。
- `content_goal`：传播目标。
- `human_feedback`：可选人工反馈。

## 输出

- `core_message.json`
- `style_profile.json`
- `ai_tone_report.json`
- `platform_outputs.json`
- `publishing_plan.json`
- `final_distribution_pack.md`

## Required Skills/Subgraphs

- `buddy_session_recall`

权限需求：`buddy_session_read`。模板不需要网络或外部账号。

## Sample Run

示例输入见 `examples/mock_repurposer_input.json`，mock 源内容见 `mock_data/sample_source_content.md`，示例输出见 `artifacts/sample_final_distribution_pack.md`。

## Eval Cases

见 `eval_cases.json`。首个 case 检查核心观点保留、目标平台覆盖、AI 味报告和人工复核提示。

## Safety Notes

- 本模板不直接写长期记忆；稳定偏好交给 Buddy 后台记忆整理模板处理。
- 不把一次性临时偏好、秘密、完整日志或无证据判断包装成长期记忆建议。
- 改写不得丢失源内容中的限制条件、不确定项和关键事实。

## Customization

后续可以接入更细的平台评分、封面图提示词、发布时间实验和用户反馈二次修改。
