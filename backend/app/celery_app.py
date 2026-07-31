from celery import Celery

from app.config import settings

celery = Celery(
    "reconart",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)

celery.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)

celery.autodiscover_tasks(["app.tasks"])
celery.conf.update(
    include=[
        "app.tasks.reconciliation_tasks",
        "app.tasks.export_tasks",
        "app.tasks.data_source_tasks",
        "app.tasks.schedule_tasks",
    ],
)

# Beat schedule — periodic tasks
celery.conf.beat_schedule = {
    "check-schedules": {
        "task": "tasks.check_schedules",
        "schedule": 60.0,  # every 60 seconds
    },
}
