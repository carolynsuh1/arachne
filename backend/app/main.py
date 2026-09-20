from pathlib import Path
import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, SessionLocal, engine
from .internal_key import install_internal_key_guard
from .routers import followups, agents, brain_dumps, copilot, goals, graph, interactions, meetings, network, pipeline, research, sync, transcription, person_data, personal_profile, voice

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

Base.metadata.create_all(bind=engine)


def ensure_columns() -> None:
    """create_all() never alters existing tables; add columns introduced after a database was created."""
    with engine.begin() as conn:
        people_columns = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(people)")}
        if "university" not in people_columns:
            conn.exec_driver_sql("ALTER TABLE people ADD COLUMN university VARCHAR DEFAULT ''")


ensure_columns()

app = FastAPI(title="YourWeb")

# Off unless INTERNAL_API_KEY is set. Installed before CORS so CORS stays outermost and 401s get CORS headers.
install_internal_key_guard(app, os.getenv("INTERNAL_API_KEY", ""))


app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv(
        "FRONTEND_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000",
    ).split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(followups.router)
app.include_router(goals.router)
app.include_router(graph.router)
app.include_router(sync.router)
app.include_router(agents.router)
app.include_router(pipeline.router)
app.include_router(research.router)
app.include_router(network.router)
app.include_router(person_data.router)
app.include_router(personal_profile.router)
app.include_router(interactions.router)
app.include_router(copilot.router)
app.include_router(brain_dumps.router)
app.include_router(transcription.router)
app.include_router(meetings.router)
app.include_router(voice.router)


@app.on_event("startup")
def load_network_on_startup():
    db = SessionLocal()
    try:
        sync.startup_sync(db)
    finally:
        db.close()


@app.get("/health")
def health():
    return {"ok": True}
