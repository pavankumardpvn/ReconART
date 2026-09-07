"""AI Chat agent — can execute actions (create sources, reconciliations, etc.)."""

import asyncio
import hashlib
import json
import logging
import re
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, Body
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_tenant, get_current_user
from app.models.matching import Exception_, ReconRun
from app.models.reconciliation import Reconciliation
from app.models.data_source import DataSource, DataSourceColumn
from app.models.tenant import Tenant
from app.services.cache_service import cache_get, cache_set, cache_delete

logger = logging.getLogger(__name__)

router = APIRouter()

SYSTEM_PROMPT = """You are **ReconART AI** — the friendly, intelligent assistant powering ReconART, a next-generation financial reconciliation and operations platform. You can both advise AND execute actions directly. Think of yourself as a helpful colleague who genuinely enjoys making the user's work easier.

PERSONALITY & TONE:
- Be friendly, approachable, and conversational — like a knowledgeable friend who happens to be an expert in finance operations. Not robotic, not overly formal.
- Address the user by name. Make them feel welcome and valued every time they interact with you.
- Show genuine enthusiasm about helping — you love what this platform can do and you're excited to show it off.
- Keep responses clear and well-formatted. Use **bold** for key terms, bullet points for lists.
- Always end with a helpful next step or friendly suggestion — never leave the user wondering "what now?"
- It's okay to be warm and human. Phrases like "Great question!", "I'd love to help with that!", "Here's the exciting part..." are encouraged.

GREETING & CASUAL MESSAGES (hi, hello, hey, how are you, what's up, good morning, etc.):
- For "hi/hello/hey": Use a time-appropriate greeting ("Good morning/afternoon/evening") + their name. Give a warm welcome that makes them feel like they've just walked into a friendly office.
- For "how are you" / "what's up": Respond warmly and personally first ("I'm doing great, thanks for asking!"), then naturally transition to how you can help. Show personality!
- Always mention 2-3 exciting things you can help with, tailored to their workspace state.
- If the workspace has data, give a quick friendly status update:
  Example: "By the way, your workspace is looking great — you've got **4 data sources** and **2 reconciliations** humming along with a **96.2%** match rate!"
- If there are open exceptions or issues, flag them helpfully (not alarmingly):
  Example: "Just a heads up — I spotted **5 open exceptions** from your last run. Want me to help you sort through them?"
- If the workspace is empty, be encouraging and excited:
  Example: "Your workspace is all set up and ready to go! Want to kick things off by uploading your first data source? I'll walk you through it!"
- Naturally highlight a few platform capabilities that feel relevant — don't list everything, just tease what's exciting:
  Example: "Whether it's uploading data, setting up smart reconciliation rules, or generating audit-ready reports — I've got you covered."

PLATFORM CAPABILITIES (weave these naturally into conversation — never dump them all at once):
- **Data Sources** — Upload CSV, Excel, JSON or connect live to PostgreSQL, MySQL, Databricks
- **Smart Reconciliation** — Match two sources with exact, tolerance, fuzzy, or contains rules
- **Exception Management** — Auto-detect unmatched items, severity classification, bulk resolve
- **Automated Scheduling** — Cron-based reconciliation runs, fully hands-free
- **Exports & Reporting** — CSV, Excel, PDF reports ready for audit and stakeholders
- **Cross-border Currency** — 150+ currencies with real-time FX rate support
- **Data Pipeline** — Unions, Groups, Joins, Calculated Columns, Segments for complex workflows
- **Compliance & Audit** — SOX-ready reports with full audit trails

ACTIONS: When the user wants to create, run, or list something, include an action block at the END of your response using this exact format:
|||ACTION:{"type":"<type>","params":{...}}|||

Available action types:
- create_source: params {"name": "Source Name", "source_type": "file_upload", "description": "optional"}
- delete_source: params {"source_id": "uuid"}
- create_reconciliation: params {"name": "Recon Name", "recon_type": "one_to_one", "left_source_id": "uuid", "right_source_id": "uuid", "left_source_label": "Label A", "right_source_label": "Label B", "rules": [{"name": "Rule 1", "match_type": "one_to_one", "priority": 1, "conditions": [{"left_column": "col", "right_column": "col", "comparison": "exact", "is_key": true}]}]}
- delete_reconciliation: params {"recon_id": "uuid"}
- run_reconciliation: params {"recon_id": "uuid"}
- create_union: params {"name": "Union Name", "members": [{"data_source_id": "uuid", "column_mapping": {}}]}
- list_sources: no params needed
- list_reconciliations: no params needed
- suggest_rules: params {"left_source_id": "uuid", "right_source_id": "uuid"}

CRITICAL RULES:
- NEVER include your thinking process, reasoning, analysis steps, or internal thoughts in the response
- You CAN execute ALL actions listed above including DELETE — you have FULL access
- When user says "delete source X" or "remove source", use the delete_source action with the source ID from the data context
- When creating a source, ALWAYS ask the user what name they want FIRST before including the create_source action
- Only include an action when the user explicitly wants to create/delete/run/list something
- For casual conversation (hi, how are you, thanks, etc.), do NOT include actions — just be friendly and helpful
- Always explain what you're about to do BEFORE the action block
- Never make up data. Reference actual data from the context provided.
- For comparison types use: "exact" for IDs/references, "numeric_tolerance" for amounts, "fuzzy" for names/descriptions
- When the user has existing data (sources, reconciliations), weave that context into your response naturally — show you're aware of their workspace
- When discussing platform capabilities, speak with pride and excitement — this is a powerful tool and the user should feel that energy"""

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"


async def _get_context(db: AsyncSession, tenant: Tenant) -> str:
    cache_key = f"ai:context:{tenant.id}"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    try:
        now = datetime.now(timezone.utc)
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        recon_q, run_q, avg_q, exc_q, src_q, month_q, recent_q, sources_q = await asyncio.gather(
            db.execute(select(func.count(Reconciliation.id)).where(
                Reconciliation.tenant_id == tenant.id, Reconciliation.deleted_at.is_(None))),
            db.execute(select(func.count(ReconRun.id)).where(ReconRun.tenant_id == tenant.id)),
            db.execute(select(func.avg(ReconRun.match_rate)).where(
                ReconRun.tenant_id == tenant.id, ReconRun.status == "completed", ReconRun.match_rate.isnot(None))),
            db.execute(select(func.count(Exception_.id)).where(
                Exception_.tenant_id == tenant.id, Exception_.status == "open")),
            db.execute(select(func.count(DataSource.id)).where(
                DataSource.tenant_id == tenant.id, DataSource.deleted_at.is_(None))),
            db.execute(select(func.count(ReconRun.id)).where(
                ReconRun.tenant_id == tenant.id, ReconRun.created_at >= month_start)),
            db.execute(select(ReconRun).where(ReconRun.tenant_id == tenant.id)
                .order_by(ReconRun.created_at.desc()).limit(3)),
            db.execute(select(DataSource).where(
                DataSource.tenant_id == tenant.id, DataSource.deleted_at.is_(None))
                .order_by(DataSource.created_at.desc()).limit(10)),
        )

        avg_rate = avg_q.scalar_one()
        recent = list(recent_q.scalars().all())
        sources = list(sources_q.scalars().all())
        runs_str = ", ".join(f"{r.status} {r.match_rate:.1f}%" for r in recent) if recent else "none"

        sources_str = ""
        if sources:
            source_lines = []
            for s in sources:
                cols_result = await db.execute(
                    select(DataSourceColumn.name, DataSourceColumn.data_type)
                    .where(DataSourceColumn.data_source_id == s.id)
                    .order_by(DataSourceColumn.ordinal_position)
                    .limit(15)
                )
                cols = [(r[0], r[1]) for r in cols_result.all()]
                cols_str = ", ".join(f"{c[0]}({c[1]})" for c in cols) if cols else "no columns"
                source_lines.append(f"  - {s.name} (id:{s.id}, rows:{s.row_count or 0}, cols: {cols_str})")
            sources_str = "\nAvailable sources:\n" + "\n".join(source_lines)

        recons_result = await db.execute(
            select(Reconciliation).where(
                Reconciliation.tenant_id == tenant.id, Reconciliation.deleted_at.is_(None))
            .order_by(Reconciliation.created_at.desc()).limit(5)
        )
        recons = list(recons_result.scalars().all())
        recons_str = ""
        if recons:
            recon_lines = [f"  - {r.name} (id:{r.id}, type:{r.recon_type}, status:{r.status})" for r in recons]
            recons_str = "\nAvailable reconciliations:\n" + "\n".join(recon_lines)

        hour = now.hour
        time_of_day = "morning" if hour < 12 else ("afternoon" if hour < 17 else "evening")

        ctx = (
            f"Date: {now.strftime('%Y-%m-%d')} | Time of day: {time_of_day} | "
            f"Recons: {recon_q.scalar_one()} | Sources: {src_q.scalar_one()} | "
            f"Runs: {run_q.scalar_one()} (month: {month_q.scalar_one()}) | "
            + (f"Avg match rate: {float(avg_rate):.1f}% | " if avg_rate else "Avg match rate: N/A | ")
            + f"Open exceptions: {exc_q.scalar_one()} | Recent: {runs_str}"
            + sources_str + recons_str
        )
        await cache_set(cache_key, ctx, ttl=120)
        return ctx
    except Exception as e:
        return f"Data unavailable: {e}"


def _parse_action(text: str):
    match = re.search(r'\|\|\|ACTION:(.*?)\|\|\|', text, re.DOTALL)
    if match:
        try:
            action = json.loads(match.group(1).strip())
            clean_text = text[:match.start()].strip()
            return clean_text, action
        except json.JSONDecodeError:
            pass
    return text, None


@router.post("/chat")
async def ai_chat(
    message: str = Body(..., embed=True),
    user_name: str = Body("", embed=True),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    name = (user_name or "there").strip().capitalize()
    api_key = settings.groq_api_key or settings.gemini_api_key
    use_groq = bool(settings.groq_api_key)

    if not api_key:
        return {"response": f"Hey {name}! AI isn't configured yet.", "action": None}

    context = await _get_context(db, tenant)

    try:
        async with httpx.AsyncClient(timeout=45) as client:
            if use_groq:
                resp = await client.post(
                    GROQ_URL,
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={
                        "model": "openai/gpt-oss-120b",
                        "messages": [
                            {"role": "system", "content": f"{SYSTEM_PROMPT}\nUser's name: {name} (capitalize first letter)\nData: {context}"},
                            {"role": "user", "content": message},
                        ],
                        "max_tokens": 2048,
                    },
                )
            else:
                resp = await client.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key={api_key}",
                    json={
                        "contents": [{"parts": [{"text": f"{SYSTEM_PROMPT}\nUser: {name}\nData: {context}\nMessage: {message}"}]}],
                        "generationConfig": {"maxOutputTokens": 2048},
                    },
                )

            if resp.status_code == 429:
                await cache_delete(f"ai:resp:{tenant.id}:*")
                return {"response": f"Hey {name}, I've reached my limit. Please wait **60 seconds** and try again.", "action": None}

            resp.raise_for_status()
            data = resp.json()

            if use_groq:
                text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                # Strip all thinking patterns from Qwen
                text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
                text = re.sub(r"^.*?(?:thinking process|thought process|analysis|reasoning).*?(?:\n\n|\n(?=[A-Z]))", "", text, flags=re.DOTALL | re.IGNORECASE)
                text = re.sub(r"^\s*\d+\.\s*(?:Analyze|Identify|Formulate|Check|Draft).*?(?=\n[A-Z][a-z]+ [A-Z]|\nHi |\nHey |\nHello |\nSure)", "", text, flags=re.DOTALL)
                text = text.strip()
            else:
                text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")

            display_text, action = _parse_action(text)

            # Auto-execute list/delete actions on backend
            if action and action.get("type") in ("list_sources", "list_reconciliations", "delete_source", "delete_reconciliation"):
                try:
                    from app.api.v1.agent import _execute_action_internal
                    result = await _execute_action_internal(action["type"], action.get("params", {}), db, tenant)
                    return {"response": result, "action": None}
                except Exception:
                    pass

            return {"response": display_text or "Could you rephrase that?", "action": action}

    except httpx.TimeoutException:
        return {"response": f"That took too long, {name}. Try again in a moment.", "action": None}
    except Exception as e:
        logger.exception("AI chat failed")
        return {"response": f"Something went wrong, {name}. Try again!", "action": None}


@router.post("/chat/stream")
async def ai_chat_stream(
    message: str = Body(..., embed=True),
    user_name: str = Body("", embed=True),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    name = (user_name or "there").strip().capitalize()
    api_key = settings.groq_api_key or settings.gemini_api_key
    use_groq = bool(settings.groq_api_key)

    if not api_key:
        async def no_key():
            yield f"data: {json.dumps({'text': f'Hey {name}! AI is not configured yet.', 'done': True})}\n\n"
        return StreamingResponse(no_key(), media_type="text/event-stream")

    context = await _get_context(db, tenant)

    async def stream_groq():
        full_text = ""
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                async with client.stream(
                    "POST", GROQ_URL,
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={
                        "model": "openai/gpt-oss-120b",
                        "messages": [
                            {"role": "system", "content": f"{SYSTEM_PROMPT}\nUser's name: {name}\nData: {context}"},
                            {"role": "user", "content": message},
                        ],
                        "max_tokens": 2048,
                        "stream": True,
                    },
                ) as resp:
                    resp.raise_for_status()
                    in_think = False
                    async for line in resp.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        payload = line[6:]
                        if payload.strip() == "[DONE]":
                            break
                        try:
                            chunk = json.loads(payload)
                            delta = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
                            if not delta:
                                continue
                            full_text += delta
                            if "<think>" in delta:
                                in_think = True
                            if "</think>" in delta:
                                in_think = False
                                continue
                            if in_think:
                                continue
                            if "|||ACTION:" in full_text:
                                continue
                            yield f"data: {json.dumps({'text': delta})}\n\n"
                        except json.JSONDecodeError:
                            continue
        except Exception as e:
            logger.exception("Stream failed")
            yield f"data: {json.dumps({'text': f'Something went wrong, {name}. Debug: {str(e)[:300]}', 'error': True})}\n\n"

        clean_text = re.sub(r"<think>.*?</think>", "", full_text, flags=re.DOTALL).strip()
        _, action = _parse_action(clean_text)
        if action:
            action_types_auto = ("list_sources", "list_reconciliations", "delete_source", "delete_reconciliation")
            if action.get("type") in action_types_auto:
                try:
                    from app.api.v1.agent import _execute_action_internal
                    result = await _execute_action_internal(action["type"], action.get("params", {}), db, tenant)
                    yield f"data: {json.dumps({'action_result': result, 'done': True})}\n\n"
                    return
                except Exception:
                    pass
            yield f"data: {json.dumps({'action': action, 'done': True})}\n\n"
        else:
            yield f"data: {json.dumps({'done': True})}\n\n"

    async def stream_gemini():
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:streamGenerateContent?alt=sse&key={api_key}",
                    json={
                        "contents": [{"parts": [{"text": f"{SYSTEM_PROMPT}\nUser: {name}\nData: {context}\nMessage: {message}"}]}],
                        "generationConfig": {"maxOutputTokens": 2048},
                    },
                )
                resp.raise_for_status()
                full_text = ""
                for line in resp.text.split("\n"):
                    if not line.startswith("data: "):
                        continue
                    try:
                        chunk = json.loads(line[6:])
                        text = chunk.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                        if text:
                            full_text += text
                            if "|||ACTION:" not in full_text:
                                yield f"data: {json.dumps({'text': text})}\n\n"
                    except json.JSONDecodeError:
                        continue

                _, action = _parse_action(full_text)
                if action:
                    yield f"data: {json.dumps({'action': action, 'done': True})}\n\n"
                else:
                    yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as e:
            logger.exception("Gemini stream failed")
            yield f"data: {json.dumps({'text': f'Something went wrong, {name}. Debug: {str(e)[:300]}', 'error': True, 'done': True})}\n\n"

    generator = stream_groq() if use_groq else stream_gemini()
    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/analyze-columns")
async def analyze_columns(
    left_source_id: str = Body(..., embed=True),
    right_source_id: str = Body(..., embed=True),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    import uuid as _uuid

    left_cols = await db.execute(
        select(DataSourceColumn.name, DataSourceColumn.data_type)
        .where(DataSourceColumn.data_source_id == _uuid.UUID(left_source_id))
    )
    right_cols = await db.execute(
        select(DataSourceColumn.name, DataSourceColumn.data_type)
        .where(DataSourceColumn.data_source_id == _uuid.UUID(right_source_id))
    )

    left = [{"name": r[0], "type": r[1]} for r in left_cols.all()]
    right = [{"name": r[0], "type": r[1]} for r in right_cols.all()]

    api_key = settings.groq_api_key or settings.gemini_api_key
    use_groq = bool(settings.groq_api_key)
    if not api_key:
        return {"suggestions": []}

    prompt = (
        f"Given two data sources for reconciliation:\n"
        f"Left columns: {json.dumps(left)}\n"
        f"Right columns: {json.dumps(right)}\n\n"
        f"Suggest the best column matching rules as JSON array. Each rule: "
        f'{{"left_column":"col","right_column":"col","comparison":"exact|numeric_tolerance|fuzzy","is_key":true/false,"confidence":0.0-1.0}}\n'
        f"Match by: similar names, data types, semantic meaning. Return ONLY the JSON array, no other text."
    )

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            if use_groq:
                resp = await client.post(
                    GROQ_URL,
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={
                        "model": "openai/gpt-oss-120b",
                        "messages": [{"role": "user", "content": prompt}],
                        "max_tokens": 512,
                    },
                )
                resp.raise_for_status()
                text = resp.json().get("choices", [{}])[0].get("message", {}).get("content", "")
                text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
            else:
                resp = await client.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key={api_key}",
                    json={
                        "contents": [{"parts": [{"text": prompt}]}],
                        "generationConfig": {"maxOutputTokens": 512},
                    },
                )
                resp.raise_for_status()
                text = resp.json().get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")

            text = re.sub(r"```json\s*", "", text).replace("```", "").strip()
            suggestions = json.loads(text)
            return {"suggestions": suggestions, "left_columns": left, "right_columns": right}
    except Exception as e:
        logger.exception("Column analysis failed")
        return {"suggestions": [], "left_columns": left, "right_columns": right}
