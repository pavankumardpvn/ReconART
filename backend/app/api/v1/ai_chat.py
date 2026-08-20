"""AI Chat agent — can execute actions (create sources, reconciliations, etc.)."""

import asyncio
import hashlib
import json
import logging
import re
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, Body
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

SYSTEM_PROMPT = """You are ReconART AI — a finance operations agent that can EXECUTE actions. Address the user by name. Be warm and actionable.

Platform features:
- Data Sources: Upload CSV/Excel/JSON or connect PostgreSQL/MySQL/Databricks
- Reconciliations: Match two sources with exact/tolerance/fuzzy/contains rules
- Exception Management: Auto-detect unmatched items, severity classification, bulk resolve
- Scheduled Runs: Cron-based automated reconciliation
- Exports: CSV, Excel, PDF reports
- Cross-border Currency: 150+ currencies with real-time FX rates
- Data Pipeline: Unions, Groups, Joins, Calculated Columns, Segments
- Compliance: SOX reports, audit trails

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
- Go DIRECTLY to the answer — no preamble
- You CAN execute ALL actions listed above including DELETE — you have FULL access
- When user says "delete source X" or "remove source", use the delete_source action with the source ID from the data context
- When creating a source, ALWAYS ask the user what name they want FIRST before including the create_source action
- Only include an action when the user explicitly wants to create/delete/run/list something
- For casual conversation, do NOT include actions
- Always explain what you're about to do BEFORE the action block
- Use **bold** and bullets. Never make up data. Suggest a follow-up.
- For comparison types use: "exact" for IDs/references, "numeric_tolerance" for amounts, "fuzzy" for names/descriptions"""

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

        ctx = (
            f"Date: {now.strftime('%Y-%m-%d')} | "
            f"Recons: {recon_q.scalar_one()} | Sources: {src_q.scalar_one()} | "
            f"Runs: {run_q.scalar_one()} (month: {month_q.scalar_one()}) | "
            + (f"Avg match rate: {float(avg_rate):.1f}% | " if avg_rate else "Avg match rate: N/A | ")
            + f"Open exceptions: {exc_q.scalar_one()} | Recent: {runs_str}"
            + sources_str + recons_str
        )
        await cache_set(cache_key, ctx, ttl=15)
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
                        "model": "qwen/qwen3.6-27b",
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
            return {"response": display_text or "Could you rephrase that?", "action": action}

    except httpx.TimeoutException:
        return {"response": f"That took too long, {name}. Try again in a moment.", "action": None}
    except Exception as e:
        logger.exception("AI chat failed")
        return {"response": f"Something went wrong, {name}. Try again!", "action": None}


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
            resp = await client.post(
                GROQ_URL,
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": "qwen/qwen3.6-27b",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 512,
                },
            )
            resp.raise_for_status()
            text = resp.json().get("choices", [{}])[0].get("message", {}).get("content", "")
            text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
            text = re.sub(r"```json\s*", "", text).replace("```", "").strip()
            suggestions = json.loads(text)
            return {"suggestions": suggestions, "left_columns": left, "right_columns": right}
    except Exception as e:
        logger.exception("Column analysis failed")
        return {"suggestions": [], "left_columns": left, "right_columns": right}
