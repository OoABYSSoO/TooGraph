# 游戏广告创意工厂

## 用途

把游戏类型、游戏简报、市场/新闻材料、竞品广告素材分析、上传素材分析和平台约束转成可审查的 Creative Brief、多版本广告脚本、图片分镜、视频提示词、审核评分、生产任务清单和最终创意包。

## 目标用户

- 游戏发行和买量创意团队
- 广告素材策划与短视频编导
- 独立游戏开发者和营销代理商

## 工作流

1. 读取游戏类型、游戏简报、目标用户、创意目标、市场材料、竞品广告分析、上传素材分析、平台约束和返修反馈。
2. 通过 `buddy_session_recall` 只读召回品牌偏好、历史素材表现、禁用表达和审核反馈。
3. 规范化多源输入，整理市场项、广告素材项、视频/素材分析结果。
4. 总结竞品广告模式和市场上下文。
5. 生成 Creative Brief。
6. 生成多版本广告脚本、图片分镜和视频提示词。
7. 审核策略适配、差异化、可执行性、素材可得性和平台合规风险。
8. 选择最佳变体，生成图片/视频生产任务清单。
9. 标出可供 Buddy 后台记忆整理参考的稳定创意偏好或审核经验，不直接写长期记忆。

## 输入

- `game_genre`: 游戏类型，SLG 只是示例，模板应支持 RPG、策略、休闲、模拟、卡牌、塔防、解谜、射击等。
- `game_brief`: 核心玩法、题材、卖点、素材范围和商业目标。
- `target_audience`: 玩家画像、地区、平台和付费动机。
- `creative_goal`: 本轮创意目标和素材数量。
- `market_notes`: 市场趋势、RSS 摘要、发行节点或用户粘贴的新闻材料。
- `competitor_ad_notes`: 竞品广告结构、钩子、镜头、评论和转化观察。
- `material_analysis`: 上传素材或视频理解结果。
- `platform_constraints`: 投放平台、时长、尺寸、品牌边界和合规限制。
- `revision_feedback`: 上一轮审核或投放反馈。

## 输出

- `creative_brief.md`
- `pattern_summary.md`
- `news_context.md`
- `script_variants.json`
- `storyboards_showcase.md`
- `video_prompts_showcase.md`
- `review_results.json`
- `best_variant.json`
- `todo_image_generation.md`
- `todo_video_generation.md`
- `final_summary.md`

## Required Skills/Subgraphs

- `buddy_session_recall`: 只读召回品牌偏好、历史素材表现、禁用表达和审核反馈。

## Sample Run

使用 `examples/mock_game_creative_input.json`，并参考：

- `mock_data/sample_competitor_ads.md`
- `mock_data/sample_material_analysis.md`
- `artifacts/sample_final_summary.md`

该 mock run 不需要外部广告素材平台、视频理解服务或投放账号。

## Eval Cases

`eval_cases.json` 覆盖 game_genre 是否影响策略、多源输入是否被使用、竞品模式是否被总结、脚本变体是否差异化、分镜/提示词是否可执行、审核评分是否包含平台合规风险。

## Safety Notes

- 不生成违法、歧视、成人、赌博或侵犯版权的广告建议。
- 不编造真实投放数据、平台政策或竞品商业数据。
- 所有素材、版权和平台合规点都需要人工复核后再生产或投放。
- 本模板不直接写长期记忆；稳定创意经验应由 Buddy 后台记忆整理模板写入 `MEMORY.md`。

## Customization

- 完整模式可接入 RSS、广告素材抓取、视频理解和投放效果回传。
- 可增加审核返修循环，让低分变体回到脚本节点重写。
- 可把任务清单交给独立图片生成、视频生成或剪辑模板继续执行。
