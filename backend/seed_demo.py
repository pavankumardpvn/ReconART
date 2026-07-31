"""Seed script that populates a demo tenant with sample data and reconciliations.

Usage:
    cd backend && python seed_demo.py

Prerequisites:
    - PostgreSQL running with the reconart database migrated (alembic upgrade head)
    - .env file in the backend directory (or project root) with DATABASE_URL
"""

from __future__ import annotations

import asyncio
import csv
import os
import sys
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

# ---------------------------------------------------------------------------
# Ensure the backend package is importable when running the script directly
# ---------------------------------------------------------------------------
BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.connectors.file_connector import FileConnector
from app.database import Base, async_session_factory, engine
from app.models.data_source import DataSource, DataSourceColumn, DataSourceRow
from app.models.matching import ReconRun
from app.models.reconciliation import Reconciliation, ReconRule, ReconRuleCondition
from app.models.tenant import Tenant
from app.services.matching_engine import MatchingEngine

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
SAMPLE_DATA_DIR = BACKEND_DIR.parent / "sample-data"

DEMO_TENANT = {
    "name": "Demo Corp",
    "slug": "demo",
    "clerk_org_id": "demo_org",
}

DATA_FILES = [
    {
        "filename": "bank_statement.csv",
        "name": "Bank Statement - January 2024",
        "description": "Monthly bank statement with all transactions",
    },
    {
        "filename": "company_ledger.csv",
        "name": "Company Ledger - January 2024",
        "description": "General ledger entries for January 2024",
    },
    {
        "filename": "stripe_settlements.csv",
        "name": "Stripe Settlements - January 2024",
        "description": "Stripe payout settlement records",
    },
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def get_or_create_tenant(db: AsyncSession) -> Tenant:
    """Return the demo tenant, creating it if it does not exist."""
    result = await db.execute(
        select(Tenant).where(Tenant.slug == DEMO_TENANT["slug"])
    )
    tenant = result.scalar_one_or_none()

    if tenant is not None:
        print(f"  Tenant '{tenant.name}' already exists (id={tenant.id}). Reusing.")
        return tenant

    tenant = Tenant(
        name=DEMO_TENANT["name"],
        slug=DEMO_TENANT["slug"],
        clerk_org_id=DEMO_TENANT["clerk_org_id"],
        plan="pro",
    )
    db.add(tenant)
    await db.flush()
    print(f"  Created tenant '{tenant.name}' (id={tenant.id})")
    return tenant


async def ingest_file(
    db: AsyncSession,
    tenant: Tenant,
    file_info: dict,
) -> DataSource:
    """Parse a CSV file via FileConnector and persist DataSource + columns + rows."""
    filepath = SAMPLE_DATA_DIR / file_info["filename"]

    # Check whether this data source already exists for the tenant
    result = await db.execute(
        select(DataSource).where(
            DataSource.tenant_id == tenant.id,
            DataSource.name == file_info["name"],
        )
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        print(f"  Data source '{existing.name}' already exists (id={existing.id}). Skipping.")
        return existing

    # Use the project's FileConnector to parse the file
    connector = FileConnector(str(filepath))
    df = await connector.fetch_data()
    schema = await connector.get_schema()

    # Create DataSource record
    ds = DataSource(
        tenant_id=tenant.id,
        name=file_info["name"],
        description=file_info["description"],
        source_type="file_upload",
        connector_type="csv",
        status="ready",
        row_count=len(df),
        file_path=str(filepath),
        original_filename=file_info["filename"],
        file_size_bytes=filepath.stat().st_size,
    )
    db.add(ds)
    await db.flush()

    # Create DataSourceColumn records
    for col_def in schema:
        col = DataSourceColumn(
            data_source_id=ds.id,
            tenant_id=tenant.id,
            name=col_def["name"],
            display_name=col_def["name"].replace("_", " ").title(),
            data_type=col_def["data_type"],
            ordinal_position=col_def["ordinal_position"],
        )
        db.add(col)

    # Create DataSourceRow records
    rows = df.to_dict(orient="records")
    for idx, row_data in enumerate(rows):
        # Convert any non-serialisable values to strings
        clean_data = {}
        for k, v in row_data.items():
            if hasattr(v, "item"):  # numpy scalar
                clean_data[k] = v.item()
            elif v is None or (isinstance(v, float) and v != v):  # NaN check
                clean_data[k] = None
            else:
                clean_data[k] = v
        row = DataSourceRow(
            data_source_id=ds.id,
            tenant_id=tenant.id,
            row_number=idx + 1,
            data=clean_data,
        )
        db.add(row)

    await db.flush()
    print(f"  Ingested '{file_info['name']}': {len(rows)} rows, {len(schema)} columns (id={ds.id})")
    return ds


async def create_reconciliation_with_rules(
    db: AsyncSession,
    tenant: Tenant,
    name: str,
    description: str,
    left_source: DataSource,
    right_source: DataSource,
    left_label: str,
    right_label: str,
    rules_config: list[dict],
    tolerance_amount: Decimal = Decimal("0"),
    tolerance_percent: Decimal = Decimal("0"),
) -> Reconciliation:
    """Create a Reconciliation with its rules and conditions, skipping if it exists."""
    result = await db.execute(
        select(Reconciliation).where(
            Reconciliation.tenant_id == tenant.id,
            Reconciliation.name == name,
        )
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        print(f"  Reconciliation '{existing.name}' already exists (id={existing.id}). Skipping.")
        return existing

    recon = Reconciliation(
        tenant_id=tenant.id,
        name=name,
        description=description,
        left_source_id=left_source.id,
        right_source_id=right_source.id,
        left_source_label=left_label,
        right_source_label=right_label,
        status="active",
        tolerance_amount=tolerance_amount,
        tolerance_percent=tolerance_percent,
    )
    db.add(recon)
    await db.flush()

    for rule_cfg in rules_config:
        rule = ReconRule(
            tenant_id=tenant.id,
            reconciliation_id=recon.id,
            name=rule_cfg["name"],
            match_type=rule_cfg["match_type"],
            priority=rule_cfg["priority"],
            is_active=True,
        )
        db.add(rule)
        await db.flush()

        for cond_cfg in rule_cfg["conditions"]:
            cond = ReconRuleCondition(
                rule_id=rule.id,
                left_column=cond_cfg["left_column"],
                right_column=cond_cfg["right_column"],
                comparison=cond_cfg["comparison"],
                tolerance_value=cond_cfg.get("tolerance_value"),
                fuzzy_threshold=cond_cfg.get("fuzzy_threshold"),
                is_key=cond_cfg.get("is_key", False),
            )
            db.add(cond)

    await db.flush()
    print(f"  Created reconciliation '{name}' with {len(rules_config)} rule(s) (id={recon.id})")
    return recon


async def run_reconciliation(
    db: AsyncSession,
    tenant: Tenant,
    recon: Reconciliation,
) -> None:
    """Create a ReconRun and execute the matching engine."""
    run = ReconRun(
        reconciliation_id=recon.id,
        tenant_id=tenant.id,
        status="pending",
        triggered_by="seed_demo",
    )
    db.add(run)
    await db.flush()

    engine = MatchingEngine(db)
    stats = await engine.run(recon.id, run.id)

    print(f"  Run complete for '{recon.name}':")
    print(f"    Left rows:      {stats.left_total}")
    print(f"    Right rows:     {stats.right_total}")
    print(f"    Matched pairs:  {stats.matched}")
    print(f"    Unmatched left: {stats.unmatched_left}")
    print(f"    Unmatched right:{stats.unmatched_right}")
    print(f"    Exceptions:     {stats.exceptions}")
    print(f"    Match rate:     {stats.match_rate}%")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def main() -> None:
    print("=" * 60)
    print("  Recon ART - Demo Seed Script")
    print("=" * 60)

    # Verify sample data directory exists
    if not SAMPLE_DATA_DIR.exists():
        print(f"\nERROR: Sample data directory not found: {SAMPLE_DATA_DIR}")
        sys.exit(1)

    async with async_session_factory() as db:
        try:
            # ------------------------------------------------------------------
            # 1. Create demo tenant
            # ------------------------------------------------------------------
            print("\n[1/4] Setting up demo tenant...")
            tenant = await get_or_create_tenant(db)

            # ------------------------------------------------------------------
            # 2. Ingest sample data files
            # ------------------------------------------------------------------
            print("\n[2/4] Ingesting sample data files...")
            data_sources: dict[str, DataSource] = {}
            for file_info in DATA_FILES:
                ds = await ingest_file(db, tenant, file_info)
                data_sources[file_info["filename"]] = ds

            bank = data_sources["bank_statement.csv"]
            ledger = data_sources["company_ledger.csv"]
            stripe = data_sources["stripe_settlements.csv"]

            # ------------------------------------------------------------------
            # 3. Create reconciliations
            # ------------------------------------------------------------------
            print("\n[3/4] Creating reconciliations...")

            # Recon 1: Bank vs Ledger - exact match on reference
            bank_vs_ledger = await create_reconciliation_with_rules(
                db=db,
                tenant=tenant,
                name="Bank vs Ledger - January 2024",
                description="Reconcile bank statement transactions against general ledger entries using reference numbers.",
                left_source=bank,
                right_source=ledger,
                left_label="Bank Statement",
                right_label="Company Ledger",
                rules_config=[
                    {
                        "name": "Exact Reference Match",
                        "match_type": "exact",
                        "priority": 1,
                        "conditions": [
                            {
                                "left_column": "reference",
                                "right_column": "reference_number",
                                "comparison": "exact",
                                "is_key": True,
                            },
                            {
                                "left_column": "amount",
                                "right_column": "debit",
                                "comparison": "exact",
                                "is_key": False,
                            },
                        ],
                    },
                ],
            )

            # Recon 2: Stripe vs Bank - tolerance match on amounts
            stripe_vs_bank = await create_reconciliation_with_rules(
                db=db,
                tenant=tenant,
                name="Stripe vs Bank - January 2024",
                description="Reconcile Stripe settlement payouts against bank statement deposits with tolerance matching.",
                left_source=stripe,
                right_source=bank,
                left_label="Stripe Settlements",
                right_label="Bank Statement",
                tolerance_amount=Decimal("1.00"),
                rules_config=[
                    {
                        "name": "Amount Tolerance Match",
                        "match_type": "tolerance",
                        "priority": 1,
                        "conditions": [
                            {
                                "left_column": "arrival_date",
                                "right_column": "date",
                                "comparison": "exact",
                                "is_key": True,
                            },
                            {
                                "left_column": "net_amount",
                                "right_column": "amount",
                                "comparison": "tolerance_abs",
                                "tolerance_value": Decimal("1.00"),
                                "is_key": False,
                            },
                        ],
                    },
                ],
            )

            # ------------------------------------------------------------------
            # 4. Run reconciliations
            # ------------------------------------------------------------------
            print("\n[4/4] Running reconciliations...")

            print(f"\n  --- {bank_vs_ledger.name} ---")
            await run_reconciliation(db, tenant, bank_vs_ledger)

            print(f"\n  --- {stripe_vs_bank.name} ---")
            await run_reconciliation(db, tenant, stripe_vs_bank)

            # Commit everything
            await db.commit()

            print("\n" + "=" * 60)
            print("  Demo seeding complete!")
            print("=" * 60)
            print("\n  You can now log in and explore the demo data.")
            print("  Tenant: Demo Corp (slug: demo)")
            print()

        except Exception:
            await db.rollback()
            raise


if __name__ == "__main__":
    asyncio.run(main())
