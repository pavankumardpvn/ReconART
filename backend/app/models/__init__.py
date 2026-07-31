"""SQLAlchemy models for Recon ART.

Import every model here so that Alembic's ``target_metadata = Base.metadata``
picks up all tables automatically.
"""

from app.models.accounting import AccountingEntry, AccountingEntryLine, JournalTemplate
from app.models.audit import AuditLog
from app.models.data_source import DataSource, DataSourceColumn, DataSourceRow, SourceFile
from app.models.export import ExportJob
from app.models.matching import Exception_, MatchPair, MatchPairItem, ReconRun
from app.models.reconciliation import Reconciliation, ReconRule, ReconRuleCondition
from app.models.schedule import Schedule
from app.models.segment import Segment, SegmentRule
from app.models.sweep import Compensation, Consolidation, Sweep
from app.models.tenant import Tenant, TenantMember
from app.models.transform import CalculatedColumn, Group, Join, Union, UnionMember
from app.models.dispute import Dispute
from app.models.notebook import SavedNotebookQuery
from app.models.workflow import Attachment, Comment, ReconciliationSignoff, ReconciliationTask

__all__ = [
    # Tenant
    "Tenant",
    "TenantMember",
    # Data sources
    "DataSource",
    "DataSourceColumn",
    "DataSourceRow",
    "SourceFile",
    # Transforms
    "CalculatedColumn",
    "Union",
    "UnionMember",
    "Join",
    "Group",
    # Segments
    "Segment",
    "SegmentRule",
    # Reconciliation
    "Reconciliation",
    "ReconRule",
    "ReconRuleCondition",
    # Matching
    "ReconRun",
    "MatchPair",
    "MatchPairItem",
    "Exception_",
    # Accounting
    "JournalTemplate",
    "AccountingEntry",
    "AccountingEntryLine",
    # Sweep / Compensation / Consolidation
    "Sweep",
    "Compensation",
    "Consolidation",
    # Schedule
    "Schedule",
    # Export
    "ExportJob",
    # Audit
    "AuditLog",
    # Workflow
    "ReconciliationSignoff",
    "ReconciliationTask",
    "Comment",
    "Attachment",
    # Dispute
    "Dispute",
    # Notebook
    "SavedNotebookQuery",
]
