"""Email notification service — sends via SMTP if configured, logs otherwise."""

from __future__ import annotations

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import settings

logger = logging.getLogger(__name__)


def _smtp_configured() -> bool:
    """Return True if SMTP settings are present."""
    return bool(settings.smtp_host and settings.smtp_port)


def send_email(to: str, subject: str, body: str) -> bool:
    """Send an email via SMTP.

    If SMTP is not configured, logs the intent and returns False.
    Returns True on successful send.
    """
    if not _smtp_configured():
        logger.info(
            "Email not configured, skipping notification — to=%s subject=%s",
            to,
            subject,
        )
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = settings.smtp_from_email or settings.smtp_user
        msg["To"] = to
        msg.attach(MIMEText(body, "html"))

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            if settings.smtp_port != 25:
                server.starttls()
            if settings.smtp_user and settings.smtp_password:
                server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)

        logger.info("Email sent to %s — subject=%s", to, subject)
        return True

    except Exception:
        logger.exception("Failed to send email to %s", to)
        return False


def send_recon_complete_notification(schedule: dict, run: dict) -> bool:
    """Send a formatted email about a completed reconciliation run."""
    to = schedule.get("notify_email", "")
    if not to:
        logger.info("No notify_email on schedule, skipping notification")
        return False

    subject = f"Reconciliation Complete: {schedule.get('name', 'Unnamed')}"
    body = f"""
    <html>
    <body style="font-family: sans-serif; color: #333;">
        <h2>Reconciliation Run Completed</h2>
        <table style="border-collapse: collapse; width: 100%; max-width: 500px;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Schedule</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">{schedule.get('name', 'N/A')}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Status</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">{run.get('status', 'N/A')}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Match Rate</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">{run.get('match_rate', 'N/A')}%</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Matched</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">{run.get('matched_count', 0)}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Unmatched Left</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">{run.get('unmatched_left', 0)}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Unmatched Right</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">{run.get('unmatched_right', 0)}</td></tr>
        </table>
        <p style="color: #888; font-size: 12px; margin-top: 24px;">
            Sent by Recon ART
        </p>
    </body>
    </html>
    """
    return send_email(to, subject, body)


def send_recon_failure_notification(schedule: dict, run: dict, error: str) -> bool:
    """Send a failure notification for a reconciliation run."""
    to = schedule.get("notify_email", "")
    if not to:
        logger.info("No notify_email on schedule, skipping failure notification")
        return False

    subject = f"Reconciliation FAILED: {schedule.get('name', 'Unnamed')}"
    body = f"""
    <html>
    <body style="font-family: sans-serif; color: #333;">
        <h2 style="color: #dc2626;">Reconciliation Run Failed</h2>
        <table style="border-collapse: collapse; width: 100%; max-width: 500px;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Schedule</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">{schedule.get('name', 'N/A')}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Run ID</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">{run.get('id', 'N/A')}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Error</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #eee; color: #dc2626;">{error}</td></tr>
        </table>
        <p style="color: #888; font-size: 12px; margin-top: 24px;">
            Sent by Recon ART
        </p>
    </body>
    </html>
    """
    return send_email(to, subject, body)


def send_invite_email(to: str, org_name: str, inviter_name: str | None = None) -> bool:
    """Send a workspace invitation email."""
    subject = f"You've been invited to {org_name} on Recon ART"
    inviter = inviter_name or "A team member"
    body = f"""
    <html>
    <body style="font-family: sans-serif; color: #333;">
        <h2>You're Invited!</h2>
        <p>{inviter} has invited you to join <strong>{org_name}</strong> on Recon ART.</p>
        <p>Recon ART is an automated reconciliation platform. Sign in to get started.</p>
        <p style="color: #888; font-size: 12px; margin-top: 24px;">
            Sent by Recon ART
        </p>
    </body>
    </html>
    """
    return send_email(to, subject, body)
