from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:///./seasentry.db"
    jwt_secret: str = "dev-only-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24
    cors_origins: str = "http://localhost:3000"
    # Comma-separated emails that are auto-promoted to the "admin" role the
    # moment they register or log in — see auth.py's _maybe_promote_admin().
    admin_emails: str = ""
    # Gate for the email-code 2FA step on admin login (see auth.py's
    # _send_two_factor_challenge). Defaults OFF so deploys never depend on
    # SMTP being reachable — flip to true once the sender account is
    # confirmed working, no code change needed, just this env var.
    require_admin_2fa: bool = False

    # Gmail SMTP for password-reset emails (app password, not the account
    # password). Left blank, forgot-password requests are logged instead of
    # sent — safe default for local dev without credentials configured.
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    # Used to build the link inside the reset-password email.
    frontend_url: str = "http://localhost:3000"

    # Slack "Incoming Webhook" URL for high-risk incident alerts (see
    # slack_util.py). Left blank, alerts are silently skipped — safe default
    # until a workspace webhook is configured.
    slack_webhook_url: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def admin_email_list(self) -> list[str]:
        return [e.strip().lower() for e in self.admin_emails.split(",") if e.strip()]


settings = Settings()
