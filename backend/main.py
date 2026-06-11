from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from dotenv import load_dotenv
import os

load_dotenv()

from core.models import load_all_models
from routers import jobs
from routers.admin import router as admin_router
from routers.services import router as services_router
from routers.stream import router as stream_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_all_models()
    yield


app = FastAPI(
    title="CV SaaS API",
    version="1.0.0",
    lifespan=lifespan,
)

origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(jobs.router, prefix="/jobs", tags=["jobs"])
app.include_router(services_router, prefix="/services", tags=["services"])
app.include_router(stream_router, prefix="/stream", tags=["stream"])
app.include_router(admin_router, prefix="/admin", tags=["admin"])


@app.get("/health")
def health():
    return {"status": "ok"}
