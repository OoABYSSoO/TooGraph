import {
  buildHumanReviewPanelModel,
  buildHumanReviewResumePayload,
  type HumanReviewPanelModel,
  type HumanReviewRow,
  type PermissionApprovalDetails,
} from "../editor/workspace/humanReviewPanelModel.ts";
import type { GraphPayload } from "../types/node-system.ts";
import type { RunDetail } from "../types/run.ts";

const DENY_REPLY_PATTERN = /拒绝|不同意|不要|别|不允许|否|暂停|取消|deny|denied|reject|rejected|refuse|refused|\bno\b/i;
const APPROVE_REPLY_PATTERN = /同意|允许|批准|继续|可以|确认|执行|approve|approved|allow|allowed|proceed|continue|\byes\b|\bok\b/i;

export function buildBuddyConversationalPausePrompt(run: RunDetail, graph: GraphPayload) {
  const model = buildHumanReviewPanelModel(run, graph);
  const scopeText = model.scopePath.length > 0 ? `（${model.scopePath.join(" / ")}）` : "";

  if (model.permissionApproval) {
    return buildPermissionApprovalPrompt(model.permissionApproval, scopeText);
  }

  if (model.requiredNow.length > 0) {
    return buildRequiredInputPrompt(model, scopeText);
  }

  return `我已经运行到一个需要你确认后继续的步骤${scopeText}。如果可以继续，请直接回复“继续”。`;
}

export function buildBuddyConversationalPauseResumePayload(
  run: RunDetail,
  graph: GraphPayload,
  userMessage: string,
) {
  const model = buildHumanReviewPanelModel(run, graph);
  const reply = userMessage.trim();

  if (model.permissionApproval) {
    return {
      permission_approval: {
        decision: resolvePermissionDecision(reply),
        reason: reply,
      },
    };
  }

  const targetRow = resolveConversationalPauseTargetRow(model);
  if (!targetRow) {
    return {};
  }

  return buildHumanReviewResumePayload(model.allRows, {
    ...Object.fromEntries(model.allRows.map((row) => [row.key, row.draft])),
    [targetRow.key]: reply,
  });
}

function buildPermissionApprovalPrompt(approval: PermissionApprovalDetails, scopeText: string) {
  const permissionText = approval.permissions.length > 0
    ? `权限：${approval.permissions.join("、")}。`
    : "";
  const reasonText = approval.reason ? `原因：${approval.reason}。` : "";
  const inputText = approval.inputPreview ? `\n\n待执行输入：\n${approval.inputPreview}` : "";
  return [
    `这个步骤${scopeText}需要你确认是否允许执行 ${approval.skillName || approval.skillKey}。`,
    permissionText,
    reasonText,
    "请直接回复“同意继续”或“拒绝”。",
    inputText,
  ].filter(Boolean).join("\n");
}

function buildRequiredInputPrompt(model: HumanReviewPanelModel, scopeText: string) {
  const rows = model.requiredNow;
  if (rows.length === 1) {
    const row = rows[0];
    const description = row.description ? `：${row.description}` : "";
    return `我需要你补充${scopeText}：${row.label}${description}\n\n你可以直接回复这部分内容，我会把它填回当前运行并继续。`;
  }

  const requiredList = rows
    .map((row, index) => {
      const description = row.description ? `：${row.description}` : "";
      return `${index + 1}. ${row.label}${description}`;
    })
    .join("\n");
  return `我需要你补充${scopeText}下面这些信息之一，才能继续运行：\n${requiredList}\n\n你可以先直接回复最关键的一项内容，我会填回当前运行并继续。`;
}

function resolveConversationalPauseTargetRow(model: HumanReviewPanelModel): HumanReviewRow | null {
  return model.requiredNow.find((row) => !row.draft.trim()) ?? model.requiredNow[0] ?? null;
}

function resolvePermissionDecision(reply: string) {
  if (DENY_REPLY_PATTERN.test(reply)) {
    return "denied";
  }
  if (APPROVE_REPLY_PATTERN.test(reply)) {
    return "approved";
  }
  return "approved";
}
