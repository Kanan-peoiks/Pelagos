"""Best-effort Slack notification for newly-detected high-risk incidents.

Uses a plain Slack "Incoming Webhook" URL (no OAuth, no extra dependency —
stdlib urllib is enough for a single POST). Left blank, this is a silent
no-op — safe default for local dev / before a workspace webhook exists.
"""

import json
import urllib.request

from app import models
from app.config import settings


def _post_to_slack(text: str) -> None:
    payload = json.dumps({"text": text}).encode("utf-8")
    request = urllib.request.Request(
        settings.slack_webhook_url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=5) as response:
        response.read()


def send_slack_incident_alert(incident: "models.Incident") -> None:
    if not settings.slack_webhook_url:
        return

    incident_url = f"{settings.frontend_url.rstrip('/')}/incidents?open={incident.id}"
    text = (
        f":rotating_light: *New {incident.risk} risk incident detected* — "
        f"{incident.display_id} · {incident.title}\n"
        f"Location: {incident.location}\n"
        f"Estimated area: {incident.area_m2:.0f} m² · Model confidence: {incident.ai_probability * 100:.0f}%\n"
        f"<{incident_url}|View in SeaSentry>"
    )
    _post_to_slack(text)


def send_slack_escalation_alert(incident: "models.Incident", operator_name: str) -> None:
    """Sent when a human specialist explicitly escalates an incident (the
    "Escalate" decision action) — distinct from send_slack_incident_alert
    above, which fires automatically on creation. Escalation previously only
    changed on-screen text ("Escalated to senior duty officer") without
    actually notifying anyone; this makes that claim true."""
    if not settings.slack_webhook_url:
        return

    incident_url = f"{settings.frontend_url.rstrip('/')}/incidents?open={incident.id}"
    text = (
        f":triangular_flag_on_post: *Incident escalated for senior review* — "
        f"{incident.display_id} · {incident.title}\n"
        f"Escalated by: {operator_name} · Risk: {incident.risk}\n"
        f"Location: {incident.location}\n"
        f"<{incident_url}|View in SeaSentry>"
    )
    _post_to_slack(text)
