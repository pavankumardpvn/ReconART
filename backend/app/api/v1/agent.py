"""Agent API — chat sessions with persistent message history."""

import logging
import uuid as _uuid

from fastapi import APIRouter, Depends, Body
from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_tenant, get_current_user
from app.models.chat import ChatSession, ChatMessage
from app.models.tenant import Tenant

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/sessions", status_code=201)
async def create_session(
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    user: dict = Depends(get_current_user),
):
    session = ChatSession(
        tenant_id=tenant.id,
        user_id=user.get("user_id", "unknown"),
        title=None,
        status="active",
    )
    db.add(session)
    await db.flush()
    await db.refresh(session)
    return {"sessionId": str(session.id), "title": session.title, "status": session.status}


@router.get("/sessions")
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(ChatSession)
        .where(
            ChatSession.tenant_id == tenant.id,
            ChatSession.user_id == user.get("user_id", ""),
            ChatSession.status == "active",
        )
        .order_by(ChatSession.updated_at.desc())
        .limit(50)
    )
    sessions = result.scalars().all()
    return {
        "sessions": [
            {
                "sessionId": str(s.id),
                "title": s.title,
                "status": s.status,
                "updatedAt": str(s.updated_at) if s.updated_at else None,
            }
            for s in sessions
        ]
    }


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    await db.execute(
        delete(ChatSession).where(
            ChatSession.id == _uuid.UUID(session_id),
            ChatSession.tenant_id == tenant.id,
        )
    )
    return {"status": "deleted"}


@router.get("/sessions/{session_id}/messages")
async def get_messages(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(ChatMessage)
        .where(
            ChatMessage.session_id == _uuid.UUID(session_id),
            ChatMessage.tenant_id == tenant.id,
        )
        .order_by(ChatMessage.created_at)
    )
    msgs = result.scalars().all()
    return {
        "messages": [
            {
                "id": str(m.id),
                "role": m.role,
                "text": m.text,
                "action": m.action,
                "actionStatus": m.action_status,
                "createdAt": str(m.created_at),
            }
            for m in msgs
        ]
    }


@router.post("/sessions/{session_id}/messages")
async def send_message(
    session_id: str,
    message: str = Body(..., embed=True),
    user_name: str = Body("", embed=True),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    sid = _uuid.UUID(session_id)

    # Save user message
    user_msg = ChatMessage(
        session_id=sid,
        tenant_id=tenant.id,
        role="user",
        text=message,
    )
    db.add(user_msg)
    await db.flush()

    # Call AI chat endpoint logic
    from app.api.v1.ai_chat import ai_chat, _get_context, _parse_action, SYSTEM_PROMPT, GROQ_URL
    from app.config import settings
    import httpx
    import re

    name = (user_name or "there").strip().capitalize()
    api_key = settings.groq_api_key or settings.gemini_api_key

    ai_text = "AI is not configured."
    action = None

    if api_key:
        context = await _get_context(db, tenant)

        # Load last 10 messages for conversation context
        prev_result = await db.execute(
            select(ChatMessage)
            .where(ChatMessage.session_id == sid, ChatMessage.tenant_id == tenant.id)
            .order_by(ChatMessage.created_at.desc())
            .limit(10)
        )
        prev_msgs = list(reversed(prev_result.scalars().all()))

        groq_messages = [
            {"role": "system", "content": f"{SYSTEM_PROMPT}\nUser's name: {name} (capitalize first letter)\nData: {context}"}
        ]
        for m in prev_msgs:
            if m.role in ("user", "assistant"):
                groq_messages.append({"role": m.role, "content": m.text})

        try:
            async with httpx.AsyncClient(timeout=45) as client:
                if settings.groq_api_key:
                    resp = await client.post(
                        GROQ_URL,
                        headers={"Authorization": f"Bearer {api_key}"},
                        json={"model": "qwen/qwen3.6-27b", "messages": groq_messages, "max_tokens": 2048},
                    )
                else:
                    prompt = "\n".join(f"{m['role']}: {m['content']}" for m in groq_messages)
                    resp = await client.post(
                        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key={api_key}",
                        json={"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"maxOutputTokens": 2048}},
                    )

                if resp.status_code == 429:
                    ai_text = f"Hey {name}, I've reached my limit. Please wait **60 seconds** and try again."
                elif resp.status_code >= 400:
                    ai_text = f"Something went wrong, {name}. Try again!"
                else:
                    data = resp.json()
                    if settings.groq_api_key:
                        raw = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                        raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL)
                        raw = re.sub(r"^.*?(?:thinking process|thought process).*?(?:\n\n|\n(?=[A-Z]))", "", raw, flags=re.DOTALL | re.IGNORECASE)
                        raw = raw.strip()
                    else:
                        raw = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")

                    ai_text, action = _parse_action(raw)
                    if not ai_text:
                        ai_text = "Could you rephrase that?"
        except Exception as e:
            logger.exception("Agent AI call failed")
            ai_text = f"Something went wrong, {name}. Try again!"

    # Save assistant message
    assistant_msg = ChatMessage(
        session_id=sid,
        tenant_id=tenant.id,
        role="assistant",
        text=ai_text,
        action=action,
        action_status="pending" if action else None,
    )
    db.add(assistant_msg)

    # Update session title from first user message
    session_result = await db.execute(
        select(ChatSession).where(ChatSession.id == sid)
    )
    session_obj = session_result.scalar_one_or_none()
    if session_obj and not session_obj.title:
        session_obj.title = message[:80]

    await db.flush()

    return {
        "response": ai_text,
        "action": action,
        "messageId": str(assistant_msg.id),
    }


@router.post("/execute-action")
async def execute_action(
    action_type: str = Body(..., embed=True),
    params: dict = Body({}, embed=True),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """Execute an AI agent action on the backend."""
    import uuid as _u
    from app.models.data_source import DataSource, DataSourceColumn
    from app.models.reconciliation import Reconciliation
    from app.models.matching import ReconRun
    from app.models.transform import Union, UnionMember
    from datetime import datetime, timezone

    try:
        if action_type == "create_source":
            source = DataSource(
                tenant_id=tenant.id,
                name=params.get("name", "Untitled"),
                source_type=params.get("source_type", "file_upload"),
                description=params.get("description"),
                status="active",
            )
            db.add(source)
            await db.flush()
            await db.refresh(source)
            return {"result": f"Source **{source.name}** created! (ID: `{source.id}`)"}

        elif action_type == "delete_source":
            sid = _u.UUID(params["source_id"])
            result = await db.execute(
                select(DataSource).where(DataSource.id == sid, DataSource.tenant_id == tenant.id)
            )
            source = result.scalar_one_or_none()
            if not source:
                return {"result": "Source not found."}
            source.deleted_at = datetime.now(timezone.utc)
            await db.flush()
            return {"result": f"Source **{source.name}** deleted!"}

        elif action_type == "delete_reconciliation":
            rid = _u.UUID(params["recon_id"])
            result = await db.execute(
                select(Reconciliation).where(Reconciliation.id == rid, Reconciliation.tenant_id == tenant.id)
            )
            recon = result.scalar_one_or_none()
            if not recon:
                return {"result": "Reconciliation not found."}
            recon.deleted_at = datetime.now(timezone.utc)
            await db.flush()
            return {"result": f"Reconciliation **{recon.name}** deleted!"}

        elif action_type == "create_reconciliation":
            recon = Reconciliation(
                tenant_id=tenant.id,
                name=params.get("name", "Untitled"),
                recon_type=params.get("recon_type", "one_to_one"),
                left_source_id=_u.UUID(params["left_source_id"]) if params.get("left_source_id") else None,
                right_source_id=_u.UUID(params["right_source_id"]) if params.get("right_source_id") else None,
                left_source_label=params.get("left_source_label", "Source A"),
                right_source_label=params.get("right_source_label", "Source B"),
                status="draft",
            )
            db.add(recon)
            await db.flush()
            await db.refresh(recon)

            from app.models.reconciliation import ReconRule, ReconRuleCondition
            for rule_data in params.get("rules", []):
                rule = ReconRule(
                    tenant_id=tenant.id,
                    reconciliation_id=recon.id,
                    name=rule_data.get("name", "Rule"),
                    match_type=rule_data.get("match_type", "one_to_one"),
                    priority=rule_data.get("priority", 1),
                    is_active=True,
                )
                db.add(rule)
                await db.flush()
                await db.refresh(rule)
                for cond in rule_data.get("conditions", []):
                    db.add(ReconRuleCondition(
                        rule_id=rule.id,
                        left_column=cond["left_column"],
                        right_column=cond["right_column"],
                        comparison=cond.get("comparison", "exact"),
                        tolerance_value=cond.get("tolerance_value"),
                        fuzzy_threshold=cond.get("fuzzy_threshold"),
                        is_key=cond.get("is_key", False),
                    ))
            await db.flush()
            return {"result": f"Reconciliation **{recon.name}** created! (ID: `{recon.id}`)\n\nWant me to run it?"}

        elif action_type == "run_reconciliation":
            rid = _u.UUID(params["recon_id"])
            result = await db.execute(
                select(Reconciliation).where(Reconciliation.id == rid, Reconciliation.tenant_id == tenant.id)
            )
            recon = result.scalar_one_or_none()
            if not recon:
                return {"result": "Reconciliation not found."}
            if recon.status == "draft":
                recon.status = "active"
            run = ReconRun(reconciliation_id=recon.id, tenant_id=tenant.id, status="pending", triggered_by="agent")
            db.add(run)
            await db.flush()
            await db.refresh(run)
            try:
                from app.tasks.reconciliation_tasks import run_reconciliation
                run_reconciliation.delay(str(recon.id), str(run.id))
            except Exception:
                pass
            return {"result": f"Run started! (Run ID: `{run.id}`). Check Reconciliations page for results."}

        elif action_type == "list_sources":
            result = await db.execute(
                select(DataSource).where(DataSource.tenant_id == tenant.id, DataSource.deleted_at.is_(None))
            )
            sources = result.scalars().all()
            if not sources:
                return {"result": "No data sources found. Upload a file or create one to get started."}
            lines = [f"• **{s.name}** — {s.row_count or 0} rows ({s.status}) `{s.id}`" for s in sources]
            return {"result": f"**{len(sources)}** source(s):\n\n" + "\n".join(lines)}

        elif action_type == "list_reconciliations":
            result = await db.execute(
                select(Reconciliation).where(Reconciliation.tenant_id == tenant.id, Reconciliation.deleted_at.is_(None))
            )
            recons = result.scalars().all()
            if not recons:
                return {"result": "No reconciliations found. Create one to get started."}
            lines = [f"• **{r.name}** — {r.recon_type} ({r.status}) `{r.id}`" for r in recons]
            return {"result": f"**{len(recons)}** reconciliation(s):\n\n" + "\n".join(lines)}

        elif action_type == "create_union":
            union = Union(tenant_id=tenant.id, name=params.get("name", "Untitled"))
            db.add(union)
            await db.flush()
            await db.refresh(union)
            for i, m in enumerate(params.get("members", [])):
                db.add(UnionMember(
                    union_id=union.id,
                    data_source_id=_u.UUID(m["data_source_id"]),
                    column_mapping=m.get("column_mapping", {}),
                    ordinal=i,
                ))
            await db.flush()
            return {"result": f"Union **{union.name}** created! (ID: `{union.id}`)"}

        else:
            return {"result": f"Unknown action: {action_type}"}

    except Exception as e:
        logger.exception("Action execution failed")
        return {"result": f"Failed: {str(e)}"}


@router.patch("/sessions/{session_id}/messages/{message_id}")
async def update_message_action(
    session_id: str,
    message_id: str,
    action_status: str = Body(..., embed=True),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    await db.execute(
        update(ChatMessage)
        .where(
            ChatMessage.id == _uuid.UUID(message_id),
            ChatMessage.tenant_id == tenant.id,
        )
        .values(action_status=action_status)
    )
    return {"status": "updated"}
