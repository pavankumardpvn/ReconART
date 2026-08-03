"""Accounting endpoints — journal templates and entry generation."""

import math
from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_tenant, get_current_user
from app.exceptions import BadRequestError, NotFoundError
from app.models.accounting import AccountingEntry, AccountingEntryLine, JournalTemplate
from app.models.matching import MatchPair, MatchPairItem, ReconRun
from app.models.data_source import DataSourceRow
from app.models.tenant import Tenant
from app.utils.pagination import paginate

router = APIRouter()


class TemplateCreate(BaseModel):
    reconciliation_id: UUID | None = None
    name: str
    description: str | None = None
    entry_rules: list[dict]


class GenerateRequest(BaseModel):
    run_id: UUID
    template_id: UUID


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------

@router.get("/templates")
async def list_templates(
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    query = (
        select(JournalTemplate)
        .where(JournalTemplate.tenant_id == tenant.id)
        .order_by(JournalTemplate.created_at.desc())
    )
    return await paginate(db, query, page=page, page_size=page_size)


@router.post("/templates", status_code=status.HTTP_201_CREATED)
async def create_template(
    payload: TemplateCreate,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    template = JournalTemplate(
        tenant_id=tenant.id,
        reconciliation_id=payload.reconciliation_id,
        name=payload.name,
        description=payload.description,
        entry_rules=payload.entry_rules,
    )
    db.add(template)
    await db.flush()
    await db.refresh(template)
    return template


@router.get("/templates/{template_id}")
async def get_template(
    template_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(JournalTemplate).where(
            JournalTemplate.id == template_id,
            JournalTemplate.tenant_id == tenant.id,
        )
    )
    template = result.scalar_one_or_none()
    if not template:
        raise NotFoundError("Journal template")
    return template


# ---------------------------------------------------------------------------
# Entries
# ---------------------------------------------------------------------------

@router.get("/entries")
async def list_entries(
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=200),
    run_id: UUID | None = None,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    query = (
        select(AccountingEntry)
        .where(AccountingEntry.tenant_id == tenant.id)
        .order_by(AccountingEntry.created_at.desc())
    )
    if run_id:
        query = query.where(AccountingEntry.run_id == run_id)
    return await paginate(db, query, page=page, page_size=page_size)


@router.get("/entries/{entry_id}")
async def get_entry(
    entry_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(AccountingEntry).where(
            AccountingEntry.id == entry_id,
            AccountingEntry.tenant_id == tenant.id,
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise NotFoundError("Accounting entry")

    lines_result = await db.execute(
        select(AccountingEntryLine)
        .where(AccountingEntryLine.entry_id == entry.id)
        .order_by(AccountingEntryLine.line_number)
    )
    lines = lines_result.scalars().all()

    return {
        "id": str(entry.id),
        "entry_date": str(entry.entry_date),
        "entry_number": entry.entry_number,
        "status": entry.status,
        "total_debit": float(entry.total_debit),
        "total_credit": float(entry.total_credit),
        "narration": entry.narration,
        "created_at": entry.created_at.isoformat(),
        "lines": [
            {
                "line_number": l.line_number,
                "account_code": l.account_code,
                "account_name": l.account_name,
                "debit_amount": float(l.debit_amount),
                "credit_amount": float(l.credit_amount),
                "currency": l.currency,
                "reference": l.reference,
                "narration": l.narration,
            }
            for l in lines
        ],
    }


@router.post("/entries/generate", status_code=status.HTTP_201_CREATED)
async def generate_entries(
    payload: GenerateRequest,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    user: dict = Depends(get_current_user),
):
    # Verify run exists
    run_result = await db.execute(
        select(ReconRun).where(ReconRun.id == payload.run_id, ReconRun.tenant_id == tenant.id)
    )
    run = run_result.scalar_one_or_none()
    if not run:
        raise NotFoundError("Reconciliation run")

    # Verify template exists
    tmpl_result = await db.execute(
        select(JournalTemplate).where(
            JournalTemplate.id == payload.template_id,
            JournalTemplate.tenant_id == tenant.id,
        )
    )
    template = tmpl_result.scalar_one_or_none()
    if not template:
        raise NotFoundError("Journal template")

    # Fetch matched pairs
    pairs_result = await db.execute(
        select(MatchPair).where(MatchPair.run_id == run.id, MatchPair.tenant_id == tenant.id)
    )
    pairs = pairs_result.scalars().all()

    if not pairs:
        raise BadRequestError("No matched pairs to generate entries from")

    total_debit = Decimal(0)
    total_credit = Decimal(0)
    lines = []
    line_num = 1

    for pair in pairs:
        amount = pair.left_amount or Decimal(0)

        for rule in (template.entry_rules or []):
            condition = rule.get("condition", "matched")
            if condition == "matched" and pair.match_status in ("matched", "manual_match"):
                debit_amt = amount if rule.get("side") == "debit" else Decimal(0)
                credit_amt = amount if rule.get("side") == "credit" else Decimal(0)
                total_debit += debit_amt
                total_credit += credit_amt
                lines.append({
                    "line_number": line_num,
                    "account_code": rule.get("account_code", "0000"),
                    "account_name": rule.get("account_name", ""),
                    "debit_amount": debit_amt,
                    "credit_amount": credit_amt,
                    "currency": rule.get("currency", "USD"),
                    "reference": str(pair.id)[:8],
                    "narration": rule.get("narration", "Auto-generated"),
                    "match_pair_id": pair.id,
                })
                line_num += 1

    entry = AccountingEntry(
        tenant_id=tenant.id,
        run_id=run.id,
        template_id=template.id,
        entry_date=date.today(),
        entry_number=f"JE-{run.id.hex[:8]}",
        status="draft",
        total_debit=total_debit,
        total_credit=total_credit,
        narration=f"Auto-generated from run {run.id}",
    )
    db.add(entry)
    await db.flush()

    for line_data in lines:
        db.add(AccountingEntryLine(
            entry_id=entry.id,
            line_number=line_data["line_number"],
            account_code=line_data["account_code"],
            account_name=line_data["account_name"],
            debit_amount=line_data["debit_amount"],
            credit_amount=line_data["credit_amount"],
            currency=line_data["currency"],
            reference=line_data["reference"],
            narration=line_data["narration"],
            match_pair_id=line_data.get("match_pair_id"),
        ))

    await db.flush()
    await db.refresh(entry)

    return {
        "id": str(entry.id),
        "entry_date": str(entry.entry_date),
        "entry_number": entry.entry_number,
        "status": entry.status,
        "total_debit": float(total_debit),
        "total_credit": float(total_credit),
        "line_count": len(lines),
    }
