from pathlib import Path
import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, SessionLocal, engine
from .routers import agents, goals, graph, network, pipeline, research, sync, person_data, personal_profile

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

Base.metadata.create_all(bind=engine)

app = FastAPI(title="YourWeb")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("FRONTEND_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(goals.router)
app.include_router(graph.router)
app.include_router(sync.router)
app.include_router(agents.router)
app.include_router(pipeline.router)
app.include_router(research.router)
app.include_router(network.router)
app.include_router(person_data.router)
app.include_router(personal_profile.router)


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
