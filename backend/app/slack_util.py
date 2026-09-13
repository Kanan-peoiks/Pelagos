"""Best-effort Slack notification for newly-detected high-risk incidents.

Uses a plain Slack "Incoming Webhook" URL (no OAuth, no extra dependency —
stdlib urllib is enough for a single POST). Left blank, this is a silent
no-op — safe default for local dev / before a workspace webhook exists.
"""

import json
import urllib.request

from app import models
from app.config import settings


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

    payload = json.dumps({"text": text}).encode("utf-8")
    request = urllib.request.Request(
        settings.slack_webhook_url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=5) as response:
        response.read()
