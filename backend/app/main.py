from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import models  # noqa: F401 -- import registers ORM tables with Base
from app.config import settings
from app.database import Base, engine
from app.routers import admin, auth, detect, feedback, incidents, reports, vessels

Base.metadata.create_all(bind=engine)

app = FastAPI(title="SeaSentry API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(incidents.router)
app.include_router(detect.router)
app.include_router(reports.router)
app.include_router(feedback.router)
app.include_router(admin.router)
app.include_router(vessels.router)


@app.get("/health")
def health():
    return {"status": "ok"}
