import argparse
import json
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from aw_proxy import app as proxy_app


ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_STATIC_DIR = ROOT_DIR / "addin" / "dist"
DEFAULT_CONFIG_FILE = Path(__file__).resolve().parent / "runtime.json"


def _read_runtime_config(config_file: Path) -> dict[str, str]:
    if not config_file.exists():
        return {"baseUrl": "/aw-proxy", "apiKey": "", "adminKey": ""}

    try:
        payload = json.loads(config_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"Invalid config JSON: {exc}") from exc

    return {
        "baseUrl": "/aw-proxy",
        "apiKey": str(payload.get("apiKey") or ""),
        "adminKey": str(payload.get("adminKey") or ""),
    }


def create_app(static_dir: Path = DEFAULT_STATIC_DIR, config_file: Path = DEFAULT_CONFIG_FILE) -> FastAPI:
    static_dir = static_dir.resolve()
    config_file = config_file.resolve()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        async with proxy_app.router.lifespan_context(proxy_app):
            yield

    app = FastAPI(
        title="A\\W Local Server",
        description="A\\W single local server for the Word task pane and proxy API.",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "https://127.0.0.1:5201",
            "https://localhost:5201",
        ],
        allow_origin_regex=r"^https://(127\.0\.0\.1|localhost):\d+$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/config.json")
    async def runtime_config() -> dict[str, str]:
        return _read_runtime_config(config_file)

    @app.get("/health")
    async def server_health() -> dict[str, str]:
        return {"status": "healthy"}

    app.mount("/aw-proxy", proxy_app)

    if not static_dir.exists():
        @app.get("/")
        async def missing_static_root() -> dict[str, str]:
            return {
                "status": "missing_static",
                "staticDir": str(static_dir),
                "hint": "Run npm run build before starting aw_server.",
            }
    else:
        index_file = static_dir / "index.html"

        @app.get("/")
        async def index() -> FileResponse:
            return FileResponse(index_file)

        app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")

    return app


app = create_app()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the A\\W single local server.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=5201)
    parser.add_argument("--static-dir", type=Path, default=DEFAULT_STATIC_DIR)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG_FILE)
    parser.add_argument("--cert", type=Path)
    parser.add_argument("--cert-key", type=Path)
    args = parser.parse_args()

    uvicorn.run(
        create_app(args.static_dir, args.config),
        host=args.host,
        port=args.port,
        ssl_certfile=str(args.cert) if args.cert else None,
        ssl_keyfile=str(args.cert_key) if args.cert_key else None,
    )


if __name__ == "__main__":
    main()
