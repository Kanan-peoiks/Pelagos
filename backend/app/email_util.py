"""Minimal transactional email sender (Gmail SMTP via an app password).

No third-party email API — stdlib smtplib is enough for this project's
volume (password-reset emails only). If SMTP isn't configured (local dev
without credentials), emails are logged instead of sent so the flow still
works end-to-end for testing.
"""

import html
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import settings

logger = logging.getLogger("seasentry.email")


def send_email(to: str, subject: str, html_body: str) -> None:
    if not settings.smtp_user or not settings.smtp_password:
        logger.warning("SMTP not configured — logging email instead of sending.\nTo: %s\nSubject: %s\n%s", to, subject, html_body)
        return

    message = MIMEMultipart("alternative")
    message["Subject"] = subject
    message["From"] = settings.smtp_user
    message["To"] = to
    message.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
        server.starttls()
        server.login(settings.smtp_user, settings.smtp_password)
        server.sendmail(settings.smtp_user, [to], message.as_string())


def send_password_reset_email(to: str, reset_url: str) -> None:
    send_email(
        to=to,
        subject="Reset your SeaSentry password",
        html_body=f"""
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
          <h2 style="color:#2B2D42;">Reset your password</h2>
          <p>Someone requested a password reset for your SeaSentry account. If this
          wasn't you, you can safely ignore this email.</p>
          <p>
            <a href="{reset_url}"
               style="display:inline-block;background:#81B29A;color:#fff;
                      padding:10px 18px;border-radius:8px;text-decoration:none;
                      font-weight:600;">
              Reset password
            </a>
          </p>
          <p style="color:#666;font-size:12px;">This link expires in 30 minutes.
          If the button doesn't work, copy this link: {reset_url}</p>
        </div>
        """,
    )


def send_feedback_thanks_email(to: str, name: str, kind: str, message: str) -> None:
    safe_name = html.escape(name)
    safe_kind = html.escape(kind)
    safe_message = html.escape(message)
    send_email(
        to=to,
        subject="Thanks for your feedback — SeaSentry",
        html_body=f"""
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
          <h2 style="color:#2B2D42;">Thanks, {safe_name}!</h2>
          <p>We received your {safe_kind} and appreciate you taking the time to send it:</p>
          <blockquote style="margin:12px 0;padding:12px 16px;border-left:3px solid #81B29A;
                              background:#FBF9F5;color:#2B2D42;font-style:italic;">
            {safe_message}
          </blockquote>
          <p style="color:#666;font-size:12px;">— The SeaSentry team</p>
        </div>
        """,
    )
