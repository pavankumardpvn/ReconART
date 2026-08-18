"""AI Chat endpoint — powered by Claude for intelligent finance copilot."""

import logging
from datetime import datetime, timezone

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

logger = logging.getLogger(__name__)

router = APIRouter()

SYSTEM_PROMPT = """You are ReconART AI — an expert finance operations copilot embedded inside a financial reconciliation platform called ReconART.

Your personality:
- You are warm, professional, and knowledgeable — like a senior finance analyst who knows the user personally
- Address the user by their first name naturally throughout the conversation
- You provide actionable insights, not just data dumps
- You anticipate follow-up questions and suggest next steps
- You can handle casual conversation naturally while always being ready to dive into data
- When discussing numbers, provide context (is this good? bad? improving?)

Your capabilities in ReconART:
- View reconciliation status, match rates, exception counts
- Analyze trends over time periods
- Identify problem areas and recommend fixes
- Guide users through creating reconciliations, uploading data, setting up schedules
- Explain financial reconciliation concepts
- Provide best practices for matching rules, tolerance settings, exception handling

Platform features you know about:
- Data Sources: Upload CSV/Excel/JSON files or connect databases (PostgreSQL, MySQL, Databricks)
- Reconciliations: Match two data sources with configurable rules (exact, tolerance, fuzzy, contains)
- Exceptions: Unmatched items with severity classification and resolution workflows
- Segments: Filter data by custom rules
- Schedules: Automated cron-based recurring reconciliation runs
- Exports: CSV, Excel, and PDF reports
- Unions: Combine multiple data sources
- Groups: Aggregate data by columns
- Sweeps: Auto-resolve exceptions based on rules
- Cross-border currency support with 150+ currencies and real-time FX rates
- AI-suggested matching rules based on manual match patterns
- Audit trails and compliance reporting (SOX, PCI DSS)
- Real-time SSE event streaming
- Notebook: SQL query interface for ad-hoc analysis

Important rules:
- Always respond in a helpful, conversational tone
- Use markdown formatting: **bold** for emphasis, bullet points for lists
- When showing numbers, format them nicely (e.g., 98.7%, 1,234)
- If the user asks about something you can't do, suggest what they CAN do
- Keep responses concise but thorough — aim for 3-8 lines for simple questions, more for analysis
- Always suggest a relevant follow-up action or question at the end
- Never make up data — only use the real data provided in the context"""


async def _get_context(db: AsyncSession, tenant: Tenant) -> str:
    """Fetch current platform data to give Claude context."""
    lines = []
    now = datetime.now(timezone.utc)

    try:
        recon_count = (await db.execute(
            select(func.count(Reconciliation.id)).where(
                Reconciliation.tenant_id == tenant.id,
                Reconciliation.deleted_at.is_(None),
            )
        )).scalar_one()

        run_count = (await db.execute(
            select(func.count(ReconRun.id)).where(ReconRun.tenant_id == tenant.id)
        )).scalar_one()

        avg_rate = (await db.execute(
            select(func.avg(ReconRun.match_rate)).where(
                ReconRun.tenant_id == tenant.id,
                ReconRun.status == "completed",
                ReconRun.match_rate.isnot(None),
            )
        )).scalar_one()

        open_exc = (await db.execute(
            select(func.count(Exception_.id)).where(
                Exception_.tenant_id == tenant.id,
                Exception_.status == "open",
            )
        )).scalar_one()

        source_count = (await db.execute(
            select(func.count(DataSource.id)).where(
                DataSource.tenant_id == tenant.id,
                DataSource.deleted_at.is_(None),
            )
        )).scalar_one()

        recent_runs_result = await db.execute(
            select(ReconRun)
            .where(ReconRun.tenant_id == tenant.id)
            .order_by(ReconRun.created_at.desc())
            .limit(5)
        )
        recent_runs = list(recent_runs_result.scalars().all())

        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        runs_this_month = (await db.execute(
            select(func.count(ReconRun.id)).where(
                ReconRun.tenant_id == tenant.id,
                ReconRun.created_at >= month_start,
            )
        )).scalar_one()

        lines.append(f"Current date/time: {now.strftime('%Y-%m-%d %H:%M UTC')}")
        lines.append(f"Total reconciliations: {recon_count}")
        lines.append(f"Total data sources: {source_count}")
        lines.append(f"Total runs (all time): {run_count}")
        lines.append(f"Runs this month: {runs_this_month}")
        lines.append(f"Average match rate: {float(avg_rate):.1f}%" if avg_rate else "Average match rate: N/A (no completed runs)")
        lines.append(f"Open exceptions: {open_exc}")

        if recent_runs:
            lines.append("\nRecent runs (last 5):")
            for r in recent_runs:
                lines.append(
                    f"  - Status: {r.status}, Match rate: {r.match_rate:.1f}% "
                    f"Matched: {r.matched_count or 0}, Exceptions: {r.exception_count or 0}, "
                    f"Date: {r.created_at.strftime('%Y-%m-%d %H:%M') if r.created_at else 'N/A'}"
                )
        else:
            lines.append("\nNo recent runs found.")

    except Exception as e:
        lines.append(f"Error fetching data: {str(e)}")

    return "\n".join(lines)


@router.post("/chat")
async def ai_chat(
    message: str = Body(..., embed=True),
    user_name: str = Body("", embed=True),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    if not settings.anthropic_api_key:
        return {"response": f"Hey {user_name or 'there'}! The AI service isn't configured yet. Please set the ANTHROPIC_API_KEY environment variable to enable intelligent responses."}

    context = await _get_context(db, tenant)

    try:
        import anthropic

        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            system=SYSTEM_PROMPT + f"\n\nThe user's first name is: {user_name or 'User'}\n\nCurrent platform data:\n{context}",
            messages=[{"role": "user", "content": message}],
        )

        text = response.content[0].text if response.content else "I'm not sure how to respond to that. Could you rephrase?"
        return {"response": text}

    except Exception as e:
        logger.exception("AI chat failed")
        return {"response": f"I'm having a momentary issue, {user_name or 'there'}. Error: {str(e)}\n\nTry again in a few seconds!"}
