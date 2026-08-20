"""Main API router that aggregates all v1 sub-routers."""

from fastapi import APIRouter

from app.api.v1 import (
    accounting,
    aging,
    ai_chat,
    analytics,
    anomalies,
    api_keys,
    audit,
    calculated_columns,
    compliance,
    connectors,
    currency,
    dashboard,
    data_query,
    data_sources,
    disputes,
    events,
    exceptions,
    exports,
    groups,
    health,
    joins,
    lineage,
    notebook,
    reconciliations,
    resources,
    schedules,
    segments,
    sweeps,
    templates,
    tenants,
    unions,
    workflow,
)

api_router = APIRouter()

import logging as _log
_log.getLogger(__name__).info("ai_chat module loaded: %s, routes: %s", ai_chat, [r.path for r in ai_chat.router.routes])

api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(resources.router, prefix="/resources", tags=["resources"])
api_router.include_router(data_sources.router, prefix="/data-sources", tags=["data-sources"])
api_router.include_router(reconciliations.router, prefix="/reconciliations", tags=["reconciliations"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
api_router.include_router(exports.router, prefix="/exports", tags=["exports"])
api_router.include_router(segments.router, prefix="/segments", tags=["segments"])
api_router.include_router(schedules.router, prefix="/schedules", tags=["schedules"])
api_router.include_router(exceptions.router, prefix="/exceptions", tags=["exceptions"])
api_router.include_router(accounting.router, prefix="/accounting", tags=["accounting"])
api_router.include_router(connectors.router, prefix="/connectors", tags=["connectors"])
api_router.include_router(sweeps.router, prefix="/sweeps", tags=["sweeps"])
api_router.include_router(tenants.router, prefix="/tenants", tags=["tenants"])
api_router.include_router(audit.router, prefix="/audit", tags=["audit"])
api_router.include_router(templates.router, prefix="/templates", tags=["templates"])
api_router.include_router(calculated_columns.router, prefix="/calculated-columns", tags=["calculated-columns"])
api_router.include_router(unions.router, prefix="/unions", tags=["unions"])
api_router.include_router(joins.router, prefix="/joins", tags=["joins"])
api_router.include_router(groups.router, prefix="/groups", tags=["groups"])
api_router.include_router(data_query.router, prefix="/data", tags=["data-query"])
api_router.include_router(workflow.router, prefix="/workflow", tags=["workflow"])
api_router.include_router(compliance.router, prefix="/compliance", tags=["compliance"])
api_router.include_router(aging.router, prefix="/aging", tags=["aging"])
api_router.include_router(anomalies.router, prefix="/anomalies", tags=["anomalies"])
api_router.include_router(currency.router, prefix="/currency", tags=["currency"])
api_router.include_router(disputes.router, prefix="/disputes", tags=["disputes"])
api_router.include_router(analytics.router, prefix="/analytics", tags=["analytics"])
api_router.include_router(api_keys.router, prefix="/api-keys", tags=["api-keys"])
api_router.include_router(notebook.router, prefix="/notebook", tags=["notebook"])
api_router.include_router(lineage.router, prefix="/lineage", tags=["lineage"])
api_router.include_router(events.router, prefix="/events", tags=["events"])
api_router.include_router(ai_chat.router, prefix="/ai", tags=["ai"])
