from __future__ import annotations

from dataclasses import dataclass

from app.buddy import store as buddy_store
from app.core.model_catalog import build_model_catalog
from app.messaging import store
from app.messaging.event_model import MessagingInboundEvent


@dataclass(frozen=True)
class CommandResult:
    handled: bool
    reply_text: str
    include_in_context: bool = False


def parse_slash_command(text: str) -> tuple[str, str]:
    stripped = str(text or "").strip()
    if not stripped.startswith("/"):
        return "", ""
    command, _, args = stripped.partition(" ")
    return command.removeprefix("/").split("@", 1)[0].lower(), args.strip()


V1_COMMANDS = {
    "help",
    "commands",
    "session",
    "status",
    "new",
    "reset",
    "model",
    "provider",
    "stop",
    "retry",
    "undo",
    "title",
    "resume",
    "whoami",
}


def _available_text_model_refs() -> tuple[str, list[str]]:
    catalog = build_model_catalog(force_refresh=False)
    refs: list[str] = []
    for provider in catalog.get("providers") or []:
        if not provider.get("configured") or provider.get("enabled") is False:
            continue
        auth_status = provider.get("auth_status") if isinstance(provider.get("auth_status"), dict) else {}
        if provider.get("requires_login") and not auth_status.get("authenticated"):
            continue
        for model in provider.get("models") or []:
            model_ref = str(model.get("model_ref") or "").strip()
            if model_ref:
                refs.append(model_ref)
    return str(catalog.get("default_text_model_ref") or ""), sorted(set(refs))


def _numbered_lines(items: list[str], *, empty_text: str) -> list[str]:
    if not items:
        return [empty_text]
    return [f"{index}. {item}" for index, item in enumerate(items, start=1)]


def _model_list_reply(current: str, refs: list[str], *, prefix: str = "") -> str:
    available = "\n".join(_numbered_lines(refs, empty_text="未配置"))
    first_ref = refs[0] if refs else ""
    switch_hint = f"/model {first_ref}" if first_ref else "请先在 TooGraph Model Providers 页面配置模型。"
    body = (
        f"当前模型：{current}\n"
        f"可用模型：\n{available}\n\n"
        f"切换模型：\n{switch_hint}\n\n"
        "切回全局默认：\n/model global"
    )
    return f"{prefix}\n\n{body}" if prefix else body


def _handle_model_command(event: MessagingInboundEvent, platform_session: dict, args: str) -> CommandResult:
    default_ref, refs = _available_text_model_refs()
    current = str(platform_session.get("buddy_model_ref") or "") or f"global ({default_ref or '未配置'})"
    if not args or args == "list":
        return CommandResult(True, _model_list_reply(current, refs))
    if args == "global":
        store.set_platform_session_model_ref(platform_session["platform_session_id"], "", updated_by=event.sender_id)
        return CommandResult(True, f"已切回全局默认模型：{default_ref or '未配置'}")
    if args not in refs:
        return CommandResult(True, _model_list_reply(current, refs, prefix=f"模型不可用：{args}"))
    store.set_platform_session_model_ref(platform_session["platform_session_id"], args, updated_by=event.sender_id)
    return CommandResult(True, f"当前会话模型已切换为：{args}\n作用范围：仅当前消息平台会话。")


def _is_resumable_buddy_session(session: dict) -> bool:
    if session.get("deleted"):
        return False
    if str(session.get("source") or "").strip() == "tool":
        return False
    return bool(str(session.get("session_id") or "").strip())


def _list_resumable_buddy_sessions() -> list[dict]:
    return [session for session in buddy_store.list_chat_sessions() if _is_resumable_buddy_session(session)]


def _resume_list_reply(sessions: list[dict], *, prefix: str = "") -> str:
    rows = [
        f"{session['session_id']} {str(session.get('title') or '未命名').strip() or '未命名'}"
        for session in sessions[:10]
    ]
    available = "\n".join(_numbered_lines(rows, empty_text="暂无可恢复会话"))
    first_session_id = str(sessions[0].get("session_id") or "").strip() if sessions else ""
    switch_hint = f"/resume {first_session_id}" if first_session_id else "请先在 Buddy 窗口创建或保留一个会话。"
    body = f"可恢复的 Buddy 会话：\n{available}\n\n切换会话：\n{switch_hint}"
    return f"{prefix}\n\n{body}" if prefix else body


def _handle_resume_command(event: MessagingInboundEvent, platform_session: dict, args: str) -> CommandResult:
    if not args or args == "list":
        return CommandResult(True, _resume_list_reply(_list_resumable_buddy_sessions()))
    try:
        target_session = buddy_store.get_chat_session(args)
    except KeyError:
        return CommandResult(True, _resume_list_reply(_list_resumable_buddy_sessions(), prefix=f"会话不可用：{args}"))
    if not _is_resumable_buddy_session(target_session):
        return CommandResult(True, _resume_list_reply(_list_resumable_buddy_sessions(), prefix=f"会话不可用：{args}"))
    updated = store.rebind_platform_session(
        platform_session["platform_session_id"],
        target_session["session_id"],
        updated_by=event.sender_id,
    )
    title = str(target_session.get("title") or "未命名").strip() or "未命名"
    return CommandResult(True, f"已切换到 Buddy 会话：{updated['buddy_session_id']}\n标题：{title}")


def handle_slash_command(event: MessagingInboundEvent, platform_session: dict) -> CommandResult:
    command, args = parse_slash_command(event.text)
    if command not in V1_COMMANDS:
        return CommandResult(handled=False, reply_text="", include_in_context=True)
    if command in {"help", "commands"}:
        return CommandResult(True, "可用命令：/session /status /new /model /stop /retry /undo /title /resume /whoami")
    if command == "session":
        return CommandResult(
            True,
            (
                f"平台会话：{platform_session['platform_session_id']}\n"
                f"Buddy 会话：{platform_session['buddy_session_id']}\n"
                f"最近运行：{platform_session.get('last_run_id') or '无'}"
            ),
        )
    if command == "status":
        return CommandResult(True, f"当前平台会话状态：{platform_session.get('status') or 'active'}")
    if command in {"model", "provider"}:
        return _handle_model_command(event, platform_session, args)
    if command == "resume":
        return _handle_resume_command(event, platform_session, args)
    if command in {"new", "reset"}:
        new_session = buddy_store.create_chat_session(
            {"title": args or platform_session.get("title") or "Message platform session", "source": event.platform_id},
            changed_by="message_platform",
            change_reason="外部消息平台通过斜杠命令创建新 Buddy 会话。",
        )
        updated = store.rebind_platform_session(
            platform_session["platform_session_id"],
            new_session["session_id"],
            updated_by=event.sender_id,
        )
        return CommandResult(True, f"已创建并切换到 Buddy 会话：{updated['buddy_session_id']}")
    return CommandResult(True, f"/{command} 已识别，具体执行将在对应任务中接入。")
