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
