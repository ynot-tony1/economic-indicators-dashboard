"""
Cost guard: stops the Cloud SQL instance once the project's budget is spent.

GCP budgets only *alert* - they never stop spending on their own. The budget
publishes a status message to a Pub/Sub topic several times a day; a push
subscription delivers each one here. When costAmount >= budgetAmount this
service sets the instance's activation policy to NEVER (i.e. stops it).

Cloud SQL is the only paid component, so stopping it caps the spend while the
rest of the app (Cloud Run, BigQuery, Scheduler - all free tier) keeps running.
Billing data lags by hours, so the cap is approximate, not to-the-penny.

Env: PROJECT_ID, SQL_INSTANCE, PORT (set by Cloud Run).
A message attribute dry_run=true logs the decision without acting (for tests).
"""

from __future__ import annotations

import base64
import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

import google.auth
from google.auth.transport.requests import AuthorizedSession

PROJECT_ID = os.environ["PROJECT_ID"]
SQL_INSTANCE = os.environ["SQL_INSTANCE"]
SQLADMIN = f"https://sqladmin.googleapis.com/v1/projects/{PROJECT_ID}/instances/{SQL_INSTANCE}"


def session() -> AuthorizedSession:
    credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    return AuthorizedSession(credentials)


def handle_budget_message(envelope: dict) -> str:
    message = envelope.get("message") or {}
    attributes = message.get("attributes") or {}
    status = json.loads(base64.b64decode(message.get("data", "")) or b"{}")

    cost = float(status.get("costAmount", 0))
    budget = float(status.get("budgetAmount", 0))
    name = status.get("budgetDisplayName", "?")
    if budget <= 0 or cost < budget:
        return f"under budget: {name} {cost:.2f}/{budget:.2f} - no action"

    dry_run = attributes.get("dry_run") == "true"
    if dry_run:
        return f"OVER budget: {name} {cost:.2f}/{budget:.2f} - dry run, would stop {SQL_INSTANCE}"

    s = session()
    current = s.get(SQLADMIN).json().get("settings", {}).get("activationPolicy")
    if current == "NEVER":
        return f"OVER budget: {name} {cost:.2f}/{budget:.2f} - {SQL_INSTANCE} already stopped"
    resp = s.patch(SQLADMIN, json={"settings": {"activationPolicy": "NEVER"}})
    resp.raise_for_status()
    return f"OVER budget: {name} {cost:.2f}/{budget:.2f} - stopping {SQL_INSTANCE}"


class Handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:  # noqa: N802 (stdlib naming)
        length = int(self.headers.get("Content-Length", 0))
        try:
            result = handle_budget_message(json.loads(self.rfile.read(length) or b"{}"))
            code = 200
        except Exception as exc:  # non-2xx makes Pub/Sub retry the delivery
            result, code = f"error: {exc!r}", 500
        print(result, flush=True)
        self.send_response(code)
        self.end_headers()
        self.wfile.write(result.encode())

    def log_message(self, *args) -> None:  # silence default access log
        pass


if __name__ == "__main__":
    HTTPServer(("0.0.0.0", int(os.environ.get("PORT", "8080"))), Handler).serve_forever()
