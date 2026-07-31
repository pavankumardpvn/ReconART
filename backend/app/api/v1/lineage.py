"""Data Lineage — trace how data flows through the reconciliation pipeline."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.dependencies import get_current_tenant, get_current_user
from app.exceptions import BadRequestError, NotFoundError
from app.models.data_source import DataSource
from app.models.matching import Exception_, MatchPair, ReconRun
from app.models.reconciliation import Reconciliation
from app.models.tenant import Tenant
from app.models.transform import Group, Join, Union, UnionMember

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class LineageNode(BaseModel):
    id: str
    type: str
    label: str
    metadata: dict


class LineageEdge(BaseModel):
    source: str  # 'from' is a Python keyword
    target: str  # 'to' for the same reason
    label: str


class LineageGraph(BaseModel):
    nodes: list[LineageNode]
    edges: list[LineageEdge]


class ImpactItem(BaseModel):
    id: str
    name: str
    recon_type: str | None
    status: str
    role: str  # "left_source" | "right_source" | "via_union" | "via_group"


class ImpactAnalysis(BaseModel):
    data_source_id: str
    data_source_name: str
    affected_reconciliations: list[ImpactItem]


# ---------------------------------------------------------------------------
# Entity type mapping
# ---------------------------------------------------------------------------

VALID_ENTITY_TYPES = {
    "data_source", "reconciliation", "run", "exception", "match_pair", "union", "group",
}


# ---------------------------------------------------------------------------
# Lineage builder helpers
# ---------------------------------------------------------------------------

def _ds_node(ds: DataSource) -> LineageNode:
    return LineageNode(
        id=f"ds_{ds.id}",
        type="data_source",
        label=ds.name,
        metadata={
            "source_type": ds.source_type,
            "status": ds.status,
            "row_count": ds.row_count,
        },
    )


def _recon_node(r: Reconciliation) -> LineageNode:
    return LineageNode(
        id=f"recon_{r.id}",
        type="reconciliation",
        label=r.name,
        metadata={
            "recon_type": r.recon_type or "",
            "status": r.status,
        },
    )


def _run_node(run: ReconRun) -> LineageNode:
    return LineageNode(
        id=f"run_{run.id}",
        type="run",
        label=f"Run {str(run.created_at.date()) if run.created_at else 'N/A'}",
        metadata={
            "status": run.status,
            "match_rate": float(run.match_rate) if run.match_rate else None,
            "matched_count": run.matched_count,
            "exception_count": run.exception_count,
        },
    )


def _union_node(u: Union) -> LineageNode:
    return LineageNode(
        id=f"union_{u.id}",
        type="union",
        label=u.name,
        metadata={"description": u.description or ""},
    )


def _group_node(g: Group) -> LineageNode:
    return LineageNode(
        id=f"group_{g.id}",
        type="group",
        label=g.name,
        metadata={
            "group_by": g.group_by_columns or [],
            "aggregations": g.aggregations or [],
        },
    )


# ---------------------------------------------------------------------------
# GET /lineage/{entity_type}/{entity_id}
# ---------------------------------------------------------------------------

@router.get("/{entity_type}/{entity_id}", response_model=LineageGraph)
async def get_lineage(
    entity_type: str,
    entity_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    if entity_type not in VALID_ENTITY_TYPES:
        raise BadRequestError(
            f"Invalid entity_type '{entity_type}'. Must be one of: {', '.join(sorted(VALID_ENTITY_TYPES))}"
        )

    nodes: dict[str, LineageNode] = {}
    edges: list[LineageEdge] = []

    if entity_type == "data_source":
        await _lineage_for_data_source(db, tenant, entity_id, nodes, edges)
    elif entity_type == "reconciliation":
        await _lineage_for_reconciliation(db, tenant, entity_id, nodes, edges)
    elif entity_type == "run":
        await _lineage_for_run(db, tenant, entity_id, nodes, edges)
    elif entity_type == "exception":
        await _lineage_for_exception(db, tenant, entity_id, nodes, edges)
    elif entity_type == "union":
        await _lineage_for_union(db, tenant, entity_id, nodes, edges)
    elif entity_type == "group":
        await _lineage_for_group(db, tenant, entity_id, nodes, edges)
    else:
        # match_pair — trace back via its run
        await _lineage_for_match_pair(db, tenant, entity_id, nodes, edges)

    return LineageGraph(nodes=list(nodes.values()), edges=edges)


# ---------------------------------------------------------------------------
# Lineage for Data Source — trace forward
# ---------------------------------------------------------------------------

async def _lineage_for_data_source(
    db: AsyncSession, tenant: Tenant, ds_id: UUID,
    nodes: dict, edges: list,
):
    # Get the data source
    result = await db.execute(
        select(DataSource).where(DataSource.id == ds_id, DataSource.tenant_id == tenant.id)
    )
    ds = result.scalar_one_or_none()
    if not ds:
        raise NotFoundError("Data source")
    nodes[f"ds_{ds.id}"] = _ds_node(ds)

    # Find unions this source belongs to
    result = await db.execute(
        select(UnionMember).where(UnionMember.data_source_id == ds_id)
    )
    union_members = list(result.scalars().all())
    for um in union_members:
        result = await db.execute(
            select(Union).where(Union.id == um.union_id, Union.tenant_id == tenant.id)
        )
        union = result.scalar_one_or_none()
        if union:
            nid = f"union_{union.id}"
            if nid not in nodes:
                nodes[nid] = _union_node(union)
            edges.append(LineageEdge(source=f"ds_{ds.id}", target=nid, label="member"))

    # Find groups that use this source
    result = await db.execute(
        select(Group).where(Group.source_id == ds_id, Group.tenant_id == tenant.id)
    )
    groups = list(result.scalars().all())
    for g in groups:
        nid = f"group_{g.id}"
        if nid not in nodes:
            nodes[nid] = _group_node(g)
        edges.append(LineageEdge(source=f"ds_{ds.id}", target=nid, label="source"))

    # Find reconciliations using this source directly
    result = await db.execute(
        select(Reconciliation).where(
            Reconciliation.tenant_id == tenant.id,
            Reconciliation.deleted_at.is_(None),
            (Reconciliation.left_source_id == ds_id) | (Reconciliation.right_source_id == ds_id),
        )
    )
    recons = list(result.scalars().all())
    for r in recons:
        nid = f"recon_{r.id}"
        if nid not in nodes:
            nodes[nid] = _recon_node(r)
        role = "left_source" if r.left_source_id == ds_id else "right_source"
        edges.append(LineageEdge(source=f"ds_{ds.id}", target=nid, label=role))

        # Add recent runs for each recon
        run_result = await db.execute(
            select(ReconRun)
            .where(ReconRun.reconciliation_id == r.id, ReconRun.tenant_id == tenant.id)
            .order_by(ReconRun.created_at.desc())
            .limit(3)
        )
        for run in run_result.scalars().all():
            run_nid = f"run_{run.id}"
            if run_nid not in nodes:
                nodes[run_nid] = _run_node(run)
            edges.append(LineageEdge(source=nid, target=run_nid, label="run"))


# ---------------------------------------------------------------------------
# Lineage for Reconciliation — trace both directions
# ---------------------------------------------------------------------------

async def _lineage_for_reconciliation(
    db: AsyncSession, tenant: Tenant, recon_id: UUID,
    nodes: dict, edges: list,
):
    result = await db.execute(
        select(Reconciliation).where(
            Reconciliation.id == recon_id,
            Reconciliation.tenant_id == tenant.id,
            Reconciliation.deleted_at.is_(None),
        )
    )
    recon = result.scalar_one_or_none()
    if not recon:
        raise NotFoundError("Reconciliation")
    nodes[f"recon_{recon.id}"] = _recon_node(recon)

    # Trace back to left source
    if recon.left_source_id:
        res = await db.execute(
            select(DataSource).where(DataSource.id == recon.left_source_id, DataSource.tenant_id == tenant.id)
        )
        left_ds = res.scalar_one_or_none()
        if left_ds:
            nid = f"ds_{left_ds.id}"
            nodes[nid] = _ds_node(left_ds)
            edges.append(LineageEdge(source=nid, target=f"recon_{recon.id}", label="left_source"))

    # Trace back to right source
    if recon.right_source_id:
        res = await db.execute(
            select(DataSource).where(DataSource.id == recon.right_source_id, DataSource.tenant_id == tenant.id)
        )
        right_ds = res.scalar_one_or_none()
        if right_ds:
            nid = f"ds_{right_ds.id}"
            nodes[nid] = _ds_node(right_ds)
            edges.append(LineageEdge(source=nid, target=f"recon_{recon.id}", label="right_source"))

    # Trace forward to runs
    run_result = await db.execute(
        select(ReconRun)
        .where(ReconRun.reconciliation_id == recon.id, ReconRun.tenant_id == tenant.id)
        .order_by(ReconRun.created_at.desc())
        .limit(5)
    )
    for run in run_result.scalars().all():
        run_nid = f"run_{run.id}"
        nodes[run_nid] = _run_node(run)
        edges.append(LineageEdge(source=f"recon_{recon.id}", target=run_nid, label="run"))

        # Count exceptions per run
        exc_result = await db.execute(
            select(Exception_)
            .where(Exception_.run_id == run.id, Exception_.tenant_id == tenant.id)
            .limit(1)
        )
        if exc_result.scalar_one_or_none():
            exc_nid = f"exceptions_{run.id}"
            nodes[exc_nid] = LineageNode(
                id=exc_nid,
                type="exceptions_group",
                label=f"Exceptions ({run.exception_count})",
                metadata={"run_id": str(run.id), "count": run.exception_count},
            )
            edges.append(LineageEdge(source=run_nid, target=exc_nid, label="exceptions"))


# ---------------------------------------------------------------------------
# Lineage for Run — trace back to recon then sources
# ---------------------------------------------------------------------------

async def _lineage_for_run(
    db: AsyncSession, tenant: Tenant, run_id: UUID,
    nodes: dict, edges: list,
):
    result = await db.execute(
        select(ReconRun).where(ReconRun.id == run_id, ReconRun.tenant_id == tenant.id)
    )
    run = result.scalar_one_or_none()
    if not run:
        raise NotFoundError("Reconciliation run")
    nodes[f"run_{run.id}"] = _run_node(run)

    # Trace back to reconciliation
    await _lineage_for_reconciliation(db, tenant, run.reconciliation_id, nodes, edges)
    edges.append(LineageEdge(source=f"recon_{run.reconciliation_id}", target=f"run_{run.id}", label="run"))


# ---------------------------------------------------------------------------
# Lineage for Exception — trace back through run
# ---------------------------------------------------------------------------

async def _lineage_for_exception(
    db: AsyncSession, tenant: Tenant, exc_id: UUID,
    nodes: dict, edges: list,
):
    result = await db.execute(
        select(Exception_).where(Exception_.id == exc_id, Exception_.tenant_id == tenant.id)
    )
    exc = result.scalar_one_or_none()
    if not exc:
        raise NotFoundError("Exception")

    exc_nid = f"exc_{exc.id}"
    nodes[exc_nid] = LineageNode(
        id=exc_nid,
        type="exception",
        label=f"{exc.exception_type} ({exc.severity})",
        metadata={
            "status": exc.status,
            "side": exc.side,
            "exception_type": exc.exception_type,
            "severity": exc.severity,
        },
    )

    # Trace back through run
    await _lineage_for_run(db, tenant, exc.run_id, nodes, edges)
    edges.append(LineageEdge(source=f"run_{exc.run_id}", target=exc_nid, label="exception"))


# ---------------------------------------------------------------------------
# Lineage for Union — show member sources and downstream recons
# ---------------------------------------------------------------------------

async def _lineage_for_union(
    db: AsyncSession, tenant: Tenant, union_id: UUID,
    nodes: dict, edges: list,
):
    result = await db.execute(
        select(Union).where(Union.id == union_id, Union.tenant_id == tenant.id)
    )
    union = result.scalar_one_or_none()
    if not union:
        raise NotFoundError("Union")
    nodes[f"union_{union.id}"] = _union_node(union)

    # Get member sources
    result = await db.execute(
        select(UnionMember).where(UnionMember.union_id == union_id)
    )
    for um in result.scalars().all():
        res = await db.execute(
            select(DataSource).where(DataSource.id == um.data_source_id, DataSource.tenant_id == tenant.id)
        )
        ds = res.scalar_one_or_none()
        if ds:
            nid = f"ds_{ds.id}"
            nodes[nid] = _ds_node(ds)
            edges.append(LineageEdge(source=nid, target=f"union_{union.id}", label="member"))


# ---------------------------------------------------------------------------
# Lineage for Group
# ---------------------------------------------------------------------------

async def _lineage_for_group(
    db: AsyncSession, tenant: Tenant, group_id: UUID,
    nodes: dict, edges: list,
):
    result = await db.execute(
        select(Group).where(Group.id == group_id, Group.tenant_id == tenant.id)
    )
    grp = result.scalar_one_or_none()
    if not grp:
        raise NotFoundError("Group")
    nodes[f"group_{grp.id}"] = _group_node(grp)

    # Source
    res = await db.execute(
        select(DataSource).where(DataSource.id == grp.source_id, DataSource.tenant_id == tenant.id)
    )
    ds = res.scalar_one_or_none()
    if ds:
        nid = f"ds_{ds.id}"
        nodes[nid] = _ds_node(ds)
        edges.append(LineageEdge(source=nid, target=f"group_{grp.id}", label="source"))


# ---------------------------------------------------------------------------
# Lineage for MatchPair — trace back via run
# ---------------------------------------------------------------------------

async def _lineage_for_match_pair(
    db: AsyncSession, tenant: Tenant, mp_id: UUID,
    nodes: dict, edges: list,
):
    result = await db.execute(
        select(MatchPair).where(MatchPair.id == mp_id, MatchPair.tenant_id == tenant.id)
    )
    mp = result.scalar_one_or_none()
    if not mp:
        raise NotFoundError("Match pair")

    mp_nid = f"mp_{mp.id}"
    nodes[mp_nid] = LineageNode(
        id=mp_nid,
        type="match_pair",
        label=f"Match ({mp.match_status})",
        metadata={
            "confidence_score": float(mp.confidence_score) if mp.confidence_score else None,
            "left_amount": float(mp.left_amount) if mp.left_amount else None,
            "right_amount": float(mp.right_amount) if mp.right_amount else None,
            "difference": float(mp.difference) if mp.difference else None,
        },
    )

    await _lineage_for_run(db, tenant, mp.run_id, nodes, edges)
    edges.append(LineageEdge(source=f"run_{mp.run_id}", target=mp_nid, label="match"))


# ---------------------------------------------------------------------------
# GET /impact/{data_source_id} — Impact analysis
# ---------------------------------------------------------------------------

@router.get("/impact/{data_source_id}", response_model=ImpactAnalysis)
async def get_impact_analysis(
    data_source_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    # Get the data source
    result = await db.execute(
        select(DataSource).where(DataSource.id == data_source_id, DataSource.tenant_id == tenant.id)
    )
    ds = result.scalar_one_or_none()
    if not ds:
        raise NotFoundError("Data source")

    affected: list[ImpactItem] = []
    seen_recon_ids: set[str] = set()

    # Direct usage as left or right source
    result = await db.execute(
        select(Reconciliation).where(
            Reconciliation.tenant_id == tenant.id,
            Reconciliation.deleted_at.is_(None),
            (Reconciliation.left_source_id == data_source_id) | (Reconciliation.right_source_id == data_source_id),
        )
    )
    for r in result.scalars().all():
        rid = str(r.id)
        if rid not in seen_recon_ids:
            seen_recon_ids.add(rid)
            role = "left_source" if r.left_source_id == data_source_id else "right_source"
            affected.append(ImpactItem(
                id=rid, name=r.name, recon_type=r.recon_type, status=r.status, role=role,
            ))

    # Via unions — find unions this source is a member of, then find recons using those unions
    result = await db.execute(
        select(UnionMember).where(UnionMember.data_source_id == data_source_id)
    )
    union_members = list(result.scalars().all())
    for um in union_members:
        # Get the union itself to find its name
        ures = await db.execute(
            select(Union).where(Union.id == um.union_id, Union.tenant_id == tenant.id)
        )
        union = ures.scalar_one_or_none()
        if not union:
            continue

        # Find materialized data sources named after this union, then find recons using them
        ds_res = await db.execute(
            select(DataSource).where(
                DataSource.tenant_id == tenant.id,
                DataSource.source_type == "union",
                DataSource.name == union.name,
            )
        )
        for materialized_ds in ds_res.scalars().all():
            recon_res = await db.execute(
                select(Reconciliation).where(
                    Reconciliation.tenant_id == tenant.id,
                    Reconciliation.deleted_at.is_(None),
                    (Reconciliation.left_source_id == materialized_ds.id)
                    | (Reconciliation.right_source_id == materialized_ds.id),
                )
            )
            for r in recon_res.scalars().all():
                rid = str(r.id)
                if rid not in seen_recon_ids:
                    seen_recon_ids.add(rid)
                    affected.append(ImpactItem(
                        id=rid, name=r.name, recon_type=r.recon_type, status=r.status,
                        role=f"via_union ({union.name})",
                    ))

    # Via groups
    result = await db.execute(
        select(Group).where(Group.source_id == data_source_id, Group.tenant_id == tenant.id)
    )
    for grp in result.scalars().all():
        ds_res = await db.execute(
            select(DataSource).where(
                DataSource.tenant_id == tenant.id,
                DataSource.source_type == "group",
                DataSource.name == grp.name,
            )
        )
        for materialized_ds in ds_res.scalars().all():
            recon_res = await db.execute(
                select(Reconciliation).where(
                    Reconciliation.tenant_id == tenant.id,
                    Reconciliation.deleted_at.is_(None),
                    (Reconciliation.left_source_id == materialized_ds.id)
                    | (Reconciliation.right_source_id == materialized_ds.id),
                )
            )
            for r in recon_res.scalars().all():
                rid = str(r.id)
                if rid not in seen_recon_ids:
                    seen_recon_ids.add(rid)
                    affected.append(ImpactItem(
                        id=rid, name=r.name, recon_type=r.recon_type, status=r.status,
                        role=f"via_group ({grp.name})",
                    ))

    return ImpactAnalysis(
        data_source_id=str(data_source_id),
        data_source_name=ds.name,
        affected_reconciliations=affected,
    )
