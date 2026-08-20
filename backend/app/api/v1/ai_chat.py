"""AI Chat endpoint — calls Google Gemini REST API directly."""

import asyncio
import logging
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
from app.models.data_source import DataSource
from app.models.tenant import Tenant
from app.services.cache_service import cache_get, cache_set

logger = logging.getLogger(__name__)

router = APIRouter()

SYSTEM_PROMPT = """You are ReconART AI — a finance operations copilot inside a reconciliation platform.
Address the user by name. Be warm, concise, and actionable.
Use **bold** and bullet points. Keep responses 3-6 lines for simple questions.
Use the platform data provided as context. Never make up data.
For casual chat (hello, thanks, bye), be friendly and brief.
Suggest a follow-up action at the end."""

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent"


async def _get_context(db: AsyncSession, tenant: Tenant) -> str:
    now = datetime.now(timezone.utc)
    cache_key = f"ai:context:{tenant.id}"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    try:
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        recon_q, run_q, avg_q, exc_q, src_q, month_q, recent_q = await asyncio.gather(
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
        )

        avg_rate = avg_q.scalar_one()
        recent = list(recent_q.scalars().all())
        runs_str = ", ".join(
            f"{r.status} {r.match_rate:.1f}%" for r in recent
        ) if recent else "none"

        ctx = (
            f"Date: {now.strftime('%Y-%m-%d')} | "
            f"Recons: {recon_q.scalar_one()} | Sources: {src_q.scalar_one()} | "
            f"Runs: {run_q.scalar_one()} (this month: {month_q.scalar_one()}) | "
            f"Match rate: {float(avg_rate):.1f}%" if avg_rate else "Match rate: N/A" + f" | "
            f"Open exceptions: {exc_q.scalar_one()} | Recent: {runs_str}"
        )
        await cache_set(cache_key, ctx, ttl=20)
        return ctx
    except Exception as e:
        return f"Error fetching data: {e}"


@router.post("/chat")
async def ai_chat(
    message: str = Body(..., embed=True),
    user_name: str = Body("", embed=True),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    if not settings.gemini_api_key:
        return {"response": f"Hey {user_name or 'there'}! AI isn't configured yet. Set GEMINI_API_KEY."}

    context = await _get_context(db, tenant)

    prompt = f"{SYSTEM_PROMPT}\nUser: {user_name or 'User'}\nData: {context}\nMessage: {message}"

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{GEMINI_URL}?key={settings.gemini_api_key}",
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {"maxOutputTokens": 512},
                },
            )

            if resp.status_code == 429:
                return {"response": f"I'm getting a lot of requests, {user_name}. Try again in a minute!"}

            resp.raise_for_status()
            data = resp.json()
            text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            return {"response": text or "Could you rephrase that?"}

    except httpx.TimeoutException:
        return {"response": f"That took too long, {user_name or 'there'}. Try a simpler question or try again."}
    except Exception as e:
        logger.exception("AI chat failed")
        return {"response": f"Something went wrong, {user_name or 'there'}. Try again!"}
