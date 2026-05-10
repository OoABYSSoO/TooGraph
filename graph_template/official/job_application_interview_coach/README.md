# 求职简历与面试教练

## 用途

把候选人画像、简历、项目经历和目标 JD 转成可审查的求职准备包：岗位匹配报告、差距分析、简历改写、项目故事库、面试题预测、模拟面试反馈、阶段准备计划和候选人记忆候选。

## 目标用户

- 正在投递单个目标岗位的求职者
- 准备转岗、晋升或城市迁移的候选人
- 职业教练、高校就业指导和招聘顾问

## 工作流

1. 读取候选人画像、简历、项目经历、JD、目标城市和薪资期望。
2. 通过 `memory_recall` 只读召回候选人长期画像、历史面试反馈和求职约束。
3. 拆解 JD 能力矩阵，保留要求来源和不确定项。
4. 把候选人经历映射到 JD，生成匹配报告和差距分析。
5. 改写简历 bullet，但只使用可验证事实。
6. 生成 STAR/CAR 项目故事库、面试题预测和模拟面试反馈。
7. 输出阶段准备计划、薪资策略和最终求职准备包。
8. 通过 `memory_candidate_writer` 写入 candidate 状态的候选人记忆，等待人工审核。

## 输入

- `candidate_profile`: 候选人长期画像、目标方向、优势和约束。
- `resume`: 当前简历正文。
- `project_experiences`: 项目细节、职责、指标和复盘。
- `job_description`: 目标岗位 JD。
- `target_city`: 目标城市或远程偏好。
- `salary_expectation`: 薪资期望、下限和谈判约束。
- `interview_transcript`: 可选模拟面试记录；为空时生成题库和练习评分表。

## 输出

- `jd_requirement_matrix.json`
- `matching_report.md`
- `gap_analysis.md`
- `rewritten_resume.md`
- `project_story_library.json`
- `interview_questions.json`
- `mock_interview_feedback.md`
- `learning_plan.md`
- `salary_strategy.md`
- `final_application_package.md`

## Required Skills/Subgraphs

- `memory_recall`: 只读召回候选人画像、项目故事和历史面试反馈。
- `memory_candidate_writer`: 只写 candidate 状态候选记忆，不自动应用为 active。

## Sample Run

使用 `examples/mock_job_application_input.json`，并参考：

- `mock_data/sample_resume.md`
- `mock_data/sample_job_description.md`
- `artifacts/sample_final_application_package.md`

该 mock run 不需要外部账号、招聘平台 API 或联网检索。

## Eval Cases

`eval_cases.json` 覆盖 JD 拆解、经历证据映射、简历事实边界、STAR/CAR 故事、模拟面试反馈和学习计划可执行性。

## Safety Notes

- 不承诺录用、薪资结果、签证、劳动法或雇佣结论。
- 不编造项目、指标、学历、证书或任职经历。
- 薪资与城市策略只能作为准备建议，必须保留人工判断提示。
- 候选人长期画像只能以 candidate 状态写入，等待人工审核。

## Customization

- 可把 `job_description` 换成多个 JD，并在后续扩展多岗位对比节点。
- 可把 `interview_transcript` 接入真实模拟面试记录，复用同一评分链路。
- 可在完整模式中增加知识库检索、行业薪资数据和多轮弱点追踪。
