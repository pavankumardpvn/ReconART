from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://reconart:reconart_dev@localhost:5432/reconart"
    database_url_sync: str = "postgresql://reconart:reconart_dev@localhost:5432/reconart"
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/1"

    clerk_secret_key: str = ""
    clerk_jwks_url: str = ""

    storage_backend: str = "local"
    storage_path: str = "./uploads"

    # S3 / S3-compatible storage (used when storage_backend = "s3")
    s3_bucket: str = ""
    s3_region: str = ""
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_endpoint_url: str = ""

    # SMTP settings for email notifications (optional — logs if not set)
    smtp_host: str = ""
    smtp_port: int = 0
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""

    # Notification webhooks (optional — Slack / Microsoft Teams)
    slack_webhook_url: str = ""
    teams_webhook_url: str = ""

    gemini_api_key: str = ""
    health_check_email: str = ""

    app_env: str = "development"
    app_secret_key: str = "change-me"
    cors_origins: str = "http://localhost:3000"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
