"""End-to-end test: upload sample data, create reconciliation, run matching engine."""

import asyncio
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.connectors.file_connector import FileConnector
from app.models.data_source import DataSource, DataSourceColumn, DataSourceRow
from app.models.matching import ReconRun
from app.models.reconciliation import Reconciliation, ReconRule, ReconRuleCondition
from app.models.tenant import Tenant
from app.services.matching_engine import MatchingEngine


async def main():
    engine = create_async_engine(settings.database_url, echo=False)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async with factory() as db:
        # 1. Create a test tenant
        print("1. Creating test tenant...")
        tenant = Tenant(
            clerk_org_id="test_org_e2e",
            name="E2E Test Corp",
            slug="e2e-test",
        )
        db.add(tenant)
        await db.flush()
        print(f"   Tenant: {tenant.id}")

        # 2. Upload bank statement
        print("2. Uploading bank_statement.csv...")
        bank_connector = FileConnector(str(Path("../sample-data/bank_statement.csv").resolve()))
        bank_df = await bank_connector.fetch_data()
        bank_schema = await bank_connector.get_schema()

        bank_source = DataSource(
            tenant_id=tenant.id,
            name="Bank Statement",
            source_type="file_upload",
            connector_type="csv",
            status="active",
            row_count=len(bank_df),
            original_filename="bank_statement.csv",
        )
        db.add(bank_source)
        await db.flush()

        for col in bank_schema:
            db.add(DataSourceColumn(
                data_source_id=bank_source.id,
                tenant_id=tenant.id,
                name=col["name"],
                display_name=col["name"],
                data_type=col["data_type"],
                ordinal_position=col["ordinal_position"],
            ))

        records = bank_df.where(bank_df.notna(), None).to_dict(orient="records")
        for idx, row in enumerate(records):
            safe = {k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in row.items()}
            db.add(DataSourceRow(
                data_source_id=bank_source.id,
                tenant_id=tenant.id,
                row_number=idx + 1,
                data=safe,
            ))
        await db.flush()
        print(f"   Bank source: {bank_source.id} ({len(bank_df)} rows, {len(bank_schema)} columns)")

        # 3. Upload company ledger
        print("3. Uploading company_ledger.csv...")
        ledger_connector = FileConnector(str(Path("../sample-data/company_ledger.csv").resolve()))
        ledger_df = await ledger_connector.fetch_data()
        ledger_schema = await ledger_connector.get_schema()

        ledger_source = DataSource(
            tenant_id=tenant.id,
            name="Company Ledger",
            source_type="file_upload",
            connector_type="csv",
            status="active",
            row_count=len(ledger_df),
            original_filename="company_ledger.csv",
        )
        db.add(ledger_source)
        await db.flush()

        for col in ledger_schema:
            db.add(DataSourceColumn(
                data_source_id=ledger_source.id,
                tenant_id=tenant.id,
                name=col["name"],
                display_name=col["name"],
                data_type=col["data_type"],
                ordinal_position=col["ordinal_position"],
            ))

        records = ledger_df.where(ledger_df.notna(), None).to_dict(orient="records")
        for idx, row in enumerate(records):
            safe = {k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in row.items()}
            db.add(DataSourceRow(
                data_source_id=ledger_source.id,
                tenant_id=tenant.id,
                row_number=idx + 1,
                data=safe,
            ))
        await db.flush()
        print(f"   Ledger source: {ledger_source.id} ({len(ledger_df)} rows, {len(ledger_schema)} columns)")

        # 4. Create reconciliation
        print("4. Creating reconciliation...")
        recon = Reconciliation(
            tenant_id=tenant.id,
            name="Bank vs Ledger - January 2024",
            description="Match bank transactions against internal ledger",
            recon_type="bank_vs_ledger",
            left_source_id=bank_source.id,
            right_source_id=ledger_source.id,
            left_source_label="Bank Statement",
            right_source_label="Company Ledger",
            status="active",
        )
        db.add(recon)
        await db.flush()
        print(f"   Reconciliation: {recon.id}")

        # 5. Create matching rule: exact match on reference number
        print("5. Creating matching rule (exact match on reference)...")
        rule = ReconRule(
            reconciliation_id=recon.id,
            tenant_id=tenant.id,
            priority=1,
            name="Match by Reference Number",
            match_type="exact",
            is_active=True,
        )
        db.add(rule)
        await db.flush()

        # Key condition: bank reference = ledger reference_number
        key_condition = ReconRuleCondition(
            rule_id=rule.id,
            left_column="reference",
            right_column="reference_number",
            comparison="exact",
            is_key=True,
        )
        db.add(key_condition)
        await db.flush()
        print(f"   Rule: {rule.id} (reference <-> reference_number)")

        # 6. Create a run and execute the matching engine
        print("6. Running reconciliation...")
        run = ReconRun(
            reconciliation_id=recon.id,
            tenant_id=tenant.id,
            status="pending",
            triggered_by="e2e_test",
        )
        db.add(run)
        await db.flush()

        matching_engine = MatchingEngine(db)
        stats = await matching_engine.run(recon.id, run.id)

        print()
        print("=" * 60)
        print("  RECONCILIATION RESULTS")
        print("=" * 60)
        print(f"  Left (Bank) rows:    {stats.left_total}")
        print(f"  Right (Ledger) rows: {stats.right_total}")
        print(f"  Matched pairs:       {stats.matched}")
        print(f"  Unmatched left:      {stats.unmatched_left}")
        print(f"  Unmatched right:     {stats.unmatched_right}")
        print(f"  Exceptions:          {stats.exceptions}")
        print(f"  Match rate:          {stats.match_rate}%")
        print("=" * 60)

        if stats.matched > 0:
            print("\n  SUCCESS: Matching engine is working correctly!")
        else:
            print("\n  WARNING: No matches found — check column names/data")

        await db.commit()


if __name__ == "__main__":
    asyncio.run(main())
