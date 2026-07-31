"""Notification service -- Slack, Microsoft Teams, and email channels.

All channels are optional.  If a webhook URL is not configured, the
corresponding send function is a no-op.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def format_notification(event: str, data: dict) -> str:
    """Build a human-readable notification message for the given event."""
    if event == "recon_completed":
        match_rate = data.get("match_rate", "N/A")
        name = data.get("name", "Reconciliation")
        matched = data.get("matched_count", 0)
        exceptions = data.get("exception_count", 0)
        return (
            f"Reconciliation completed: {name}\n"
            f"Match rate: {match_rate}% | Matched: {matched} | Exceptions: {exceptions}"
        )
    elif event == "recon_failed":
        name = data.get("name", "Reconciliation")
        error = data.get("error", "Unknown error")
        return f"Reconciliation FAILED: {name}\nError: {error}"
    elif event == "dispute_created":
        title = data.get("title", "Untitled")
        priority = data.get("priority", "medium")
        return f"New dispute created: {title} (Priority: {priority})"
    elif event == "exception_escalated":
        exc_id = data.get("exception_id", "N/A")
        return f"Exception escalated -- ID: {exc_id}"
    else:
        return f"Recon ART notification -- {event}: {data}"


async def send_slack_notification(webhook_url: str, message: str) -> bool:
    """Send a notification to Slack via incoming webhook."""
    if not webhook_url:
        return False
    try:
        import httpx

        async with httpx.AsyncClient() as client:
            resp = await client.post(webhook_url, json={"text": message}, timeout=10)
            resp.raise_for_status()
        logger.info("Slack notification sent")
        return True
    except Exception:
        logger.exception("Failed to send Slack notification")
        return False


async def send_teams_notification(webhook_url: str, message: str) -> bool:
    """Send a notification to Microsoft Teams via incoming webhook."""
    if not webhook_url:
        return False
    try:
        import httpx

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                webhook_url,
                json={
                    "@type": "MessageCard",
                    "summary": "Recon ART Notification",
                    "text": message,
                },
                timeout=10,
            )
            resp.raise_for_status()
        logger.info("Teams notification sent")
        return True
    except Exception:
        logger.exception("Failed to send Teams notification")
        return False


async def notify(event: str, data: dict, *, slack_webhook_url: str = "", teams_webhook_url: str = "") -> dict:
    """Fan-out a notification to all configured channels.

    Parameters
    ----------
    event : str
        Event type (e.g. ``recon_completed``, ``dispute_created``).
    data : dict
        Event payload used to build the notification text.
    slack_webhook_url : str
        Slack incoming-webhook URL (empty string to skip).
    teams_webhook_url : str
        Teams incoming-webhook URL (empty string to skip).

    Returns
    -------
    dict
        Per-channel delivery status.
    """
    message = format_notification(event, data)
    results: dict[str, bool] = {}

    if slack_webhook_url:
        results["slack"] = await send_slack_notification(slack_webhook_url, message)
    if teams_webhook_url:
        results["teams"] = await send_teams_notification(teams_webhook_url, message)

    if not results:
        logger.info("No notification channels configured for event=%s", event)

    return results
