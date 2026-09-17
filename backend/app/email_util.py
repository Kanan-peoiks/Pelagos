"""Minimal transactional email sender (Gmail SMTP via an app password).

No third-party email API — stdlib smtplib is enough for this project's
volume. If SMTP isn't configured (local dev without credentials), or the
send fails for any reason, the email is logged instead of raising — every
caller here is a best-effort notification, never something that should
block the request that triggered it.
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

    # Explicit timeout: without one, a blocked/filtered outbound connection
    # (some PaaS hosts restrict outbound SMTP ports) hangs the request
    # forever instead of failing — this is a best-effort send either way.
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
        server.starttls()
        server.login(settings.smtp_user, settings.smtp_password)
        server.sendmail(settings.smtp_user, [to], message.as_string())


def _card(inner_html: str) -> str:
    return f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#2B2D42;">
      {inner_html}
    </div>
    """


def _quote(text: str) -> str:
    return f"""
    <blockquote style="margin:12px 0;padding:12px 16px;border-left:3px solid #81B29A;
                        background:#FBF9F5;color:#2B2D42;font-style:italic;">
      {text}
    </blockquote>
    """


def _divider() -> str:
    return '<hr style="border:none;border-top:1px solid #E6E2DA;margin:24px 0;" />'


def send_password_reset_email(to: str, reset_url: str) -> None:
    send_email(
        to=to,
        subject="Reset your SeaSentry password",
        html_body=_card(f"""
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
        """),
    )


def send_feedback_thanks_email(to: str, name: str, kind: str, message: str) -> None:
    """Sent the moment feedback/a suggestion/a question is submitted.
    Bilingual (English + Azerbaijani) in one email; questions get a
    "we'll get back to you" line instead of the generic thank-you."""
    safe_name = html.escape(name)
    safe_message = html.escape(message)
    is_question = kind == "question"

    if is_question:
        subject = "We received your question — SeaSentry"
        en = f"""
          <h2 style="color:#2B2D42;">Thanks, {safe_name}!</h2>
          <p>We've received your question and someone from the SeaSentry team will get
          back to you with an answer soon.</p>
          <p style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.05em;">Your question</p>
          {_quote(safe_message)}
        """
        az = f"""
          <h2 style="color:#2B2D42;">Təşəkkürlər, {safe_name}!</h2>
          <p>Sualınızı aldıq — SeaSentry komandasından biri tezliklə sizə cavab verəcək.</p>
          <p style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.05em;">Sualınız</p>
          {_quote(safe_message)}
        """
    else:
        subject = "Thanks for your feedback — SeaSentry"
        kind_label = "suggestion" if kind == "suggestion" else "feedback"
        kind_label_az = "təklifiniz" if kind == "suggestion" else "rəyiniz"
        en = f"""
          <h2 style="color:#2B2D42;">Thanks, {safe_name}!</h2>
          <p>We appreciate you taking the time to share your {kind_label} with us —
          we've read it and will take it into account.</p>
          {_quote(safe_message)}
        """
        az = f"""
          <h2 style="color:#2B2D42;">Təşəkkürlər, {safe_name}!</h2>
          <p>{kind_label_az.capitalize()} üçün vaxt ayırıb bizimlə paylaşdığınıza görə
          təşəkkür edirik — onu oxuduq və nəzərə alacağıq.</p>
          {_quote(safe_message)}
        """

    send_email(
        to=to,
        subject=subject,
        html_body=_card(f"""
          {en}
          {_divider()}
          {az}
          <p style="color:#666;font-size:12px;margin-top:24px;">— The SeaSentry team / SeaSentry komandası</p>
        """),
    )


def send_two_factor_code_email(to: str, name: str, code: str) -> None:
    """Sent on every admin login — the 6-digit code required to complete
    it. Bilingual, same style as the other transactional emails."""
    safe_name = html.escape(name)
    send_email(
        to=to,
        subject=f"Your SeaSentry login code: {code}",
        html_body=_card(f"""
          <h2 style="color:#2B2D42;">Hi {safe_name}, here's your login code</h2>
          <p>Enter this code to finish signing in to your admin account. It expires in
          10 minutes. If you didn't try to sign in, you can ignore this email.</p>
          <p style="font-size:32px;font-weight:700;letter-spacing:0.15em;color:#2B2D42;
                    text-align:center;margin:20px 0;">{code}</p>
          {_divider()}
          <h2 style="color:#2B2D42;">Salam {safe_name}, giriş kodunuz budur</h2>
          <p>Admin hesabınıza girişi tamamlamaq üçün bu kodu daxil edin. Kodun etibarlılıq
          müddəti 10 dəqiqədir. Əgər bu cəhd sizə aid deyilsə, bu e-poçtu nəzərə almaya bilərsiniz.</p>
          <p style="font-size:32px;font-weight:700;letter-spacing:0.15em;color:#2B2D42;
                    text-align:center;margin:20px 0;">{code}</p>
          <p style="color:#666;font-size:12px;margin-top:24px;">— The SeaSentry team / SeaSentry komandası</p>
        """),
    )


def send_feedback_reply_email(to: str, name: str, original_message: str, reply_message: str) -> None:
    """Sent when an admin answers a submitted question/feedback from the
    admin panel. Bilingual, same as the initial thank-you email."""
    safe_name = html.escape(name)
    safe_original = html.escape(original_message)
    safe_reply = html.escape(reply_message)

    send_email(
        to=to,
        subject="Reply to your question — SeaSentry",
        html_body=_card(f"""
          <h2 style="color:#2B2D42;">Hi {safe_name}, here's our reply</h2>
          <p style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.05em;">Your question</p>
          {_quote(safe_original)}
          <p style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.05em;">Our answer</p>
          {_quote(safe_reply)}
          {_divider()}
          <h2 style="color:#2B2D42;">Salam {safe_name}, cavabımız budur</h2>
          <p style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.05em;">Sualınız</p>
          {_quote(safe_original)}
          <p style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.05em;">Cavabımız</p>
          {_quote(safe_reply)}
          <p style="color:#666;font-size:12px;margin-top:24px;">— The SeaSentry team / SeaSentry komandası</p>
        """),
    )
