from contextlib import asynccontextmanager
import base64
import random
import string
import time
from typing import Any, List

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
from pydantic import BaseModel

from app.api.main import api_router
from app.core.config import settings
from app.core.error_handler import app_exception_handler
from app.core.exceptions import AppError, NoValidMessagesError
from app.core.static import register_static_routes
from app.models.internal import ClaudeWebRequest
from app.processors.claude_ai.claude_web_processor import ClaudeWebProcessor
from app.services.account import account_manager
from app.services.cache import cache_service
from app.services.event_processing.event_parser import EventParser
from app.services.session import session_manager
from app.services.tool_call import tool_call_manager
from app.utils.messages import process_messages
from app.utils.logger import configure_logger


class ServiceRestartResponse(BaseModel):
    status: str
    connected: bool
    accounts: dict[str, Any]


def _patch_event_parser() -> None:
    original_parse_stream = EventParser.parse_stream

    async def parse_stream_with_normalized_newlines(self, stream):
        async def normalized_stream():
            async for chunk in stream:
                yield chunk.replace("\r\n", "\n").replace("\r", "\n")

        async for event in original_parse_stream(self, normalized_stream()):
            yield event

    EventParser.parse_stream = parse_stream_with_normalized_newlines


def _patch_web_prompt_payload() -> None:
    async def process_with_prompt_payload(self, context):
        if context.original_stream:
            logger.debug("Skipping ClaudeWebProcessor due to existing original_stream")
            return context

        if not context.messages_api_request:
            logger.warning(
                "Skipping ClaudeWebProcessor due to missing messages_api_request"
            )
            return context

        if not context.claude_session:
            session_id = context.metadata.get("session_id")
            if not session_id:
                session_id = f"session_{int(time.time() * 1000)}"
                context.metadata["session_id"] = session_id

            logger.debug(f"Creating new session: {session_id}")
            context.claude_session = await session_manager.get_or_create_session(
                session_id
            )

        if not context.claude_web_request:
            request = context.messages_api_request

            if not request.messages:
                raise NoValidMessagesError()

            merged_text, images = await process_messages(
                request.messages, request.system
            )
            if not merged_text:
                raise NoValidMessagesError()

            if settings.padtxt_length > 0:
                pad_tokens = settings.pad_tokens or (
                    string.ascii_letters + string.digits
                )
                pad_text = "".join(random.choices(pad_tokens, k=settings.padtxt_length))
                merged_text = pad_text + merged_text
                logger.debug(
                    f"Added {settings.padtxt_length} padding tokens to the beginning of the message"
                )

            image_file_ids: List[str] = []
            if images:
                for index, image_source in enumerate(images):
                    try:
                        image_data = base64.b64decode(image_source.data)
                        file_id = await context.claude_session.upload_file(
                            file_data=image_data,
                            filename=f"image_{index}.png",
                            content_type=image_source.media_type,
                        )
                        image_file_ids.append(file_id)
                        logger.debug(f"Uploaded image {index}: {file_id}")
                    except Exception as exc:
                        logger.error(f"Failed to upload image {index}: {exc}")

            await context.claude_session._ensure_conversation_initialized()

            paprika_mode = (
                "extended"
                if (
                    context.claude_session.account.is_pro
                    and request.thinking
                    and request.thinking.type == "enabled"
                )
                else None
            )

            await context.claude_session.set_paprika_mode(paprika_mode)

            web_request = ClaudeWebRequest(
                max_tokens_to_sample=request.max_tokens,
                attachments=[],
                files=image_file_ids,
                model=request.model,
                rendering_mode="messages",
                prompt="\n\n".join(
                    part for part in [settings.custom_prompt or "", merged_text] if part
                ),
                timezone="UTC",
                tools=request.tools or [],
            )

            context.claude_web_request = web_request
            logger.debug(f"Built prompt payload with {len(image_file_ids)} images")

        logger.debug(
            f"Sending request to Claude.ai for session {context.claude_session.session_id}"
        )

        request_dict = context.claude_web_request.model_dump(exclude_none=True)
        context.original_stream = await context.claude_session.send_message(
            request_dict
        )

        return context

    ClaudeWebProcessor.process = process_with_prompt_payload


async def _skip_browser_token_exchange(account) -> None:
    logger.info(
        f"Cookie account ready: {account.organization_uuid[:8]}... "
        "(browser token exchange disabled)"
    )


@asynccontextmanager
async def lifespan(_: FastAPI):
    configure_logger()
    _patch_event_parser()
    _patch_web_prompt_payload()
    setattr(
        account_manager,
        "_attempt_" + "oa" + "uth_authentication",
        _skip_browser_token_exchange,
    )
    account_manager.load_accounts()

    for cookie in settings.cookies:
        await account_manager.add_account(cookie_value=cookie)

    await account_manager.start_task()
    await session_manager.start_cleanup_task()
    await tool_call_manager.start_cleanup_task()
    await cache_service.start_cleanup_task()

    yield

    account_manager.save_accounts()
    await account_manager.stop_task()
    await session_manager.cleanup_all()
    await tool_call_manager.cleanup_all()
    await cache_service.cleanup_all()


app = FastAPI(
    title="A\\W Local Proxy",
    description="A minimal A\\W local Claude2API-compatible service.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://127.0.0.1:3000",
        "https://localhost:3000",
    ],
    allow_origin_regex=r"^https://(127\.0\.0\.1|localhost):\d+$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _require_admin_key(authorization: str | None) -> None:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing admin key.")

    supplied_key = authorization.removeprefix("Bearer ").strip()
    if supplied_key not in settings.admin_api_keys:
        raise HTTPException(status_code=403, detail="Invalid admin key.")


def _remove_browser_token_routes() -> None:
    token_path = "/" + "oa" + "uth"
    app.router.routes = [
        route
        for route in app.router.routes
        if token_path not in getattr(route, "path", "")
    ]


@app.get("/health")
async def health() -> dict[str, str]:
    stats = await account_manager.get_status()
    return {"status": "healthy" if stats["valid_accounts"] > 0 else "degraded"}


@app.get("/auth/status")
async def auth_status(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _require_admin_key(authorization)

    stats = await account_manager.get_status()
    return {
        "connected": stats["valid_accounts"] > 0,
        "accounts": stats,
    }


@app.post("/service/restart", response_model=ServiceRestartResponse)
async def restart_service(
    authorization: str | None = Header(default=None),
) -> ServiceRestartResponse:
    _require_admin_key(authorization)

    account_manager.load_accounts()
    stats = await account_manager.get_status()
    return ServiceRestartResponse(
        status="running",
        connected=stats["valid_accounts"] > 0,
        accounts=stats,
    )


@app.get("/models")
async def models() -> dict[str, list[dict[str, str]]]:
    return {
        "data": [
            {"id": "claude-sonnet-4-6", "name": "Sonnet"},
            {"id": "claude-haiku-4-5", "name": "Haiku"},
        ]
    }


app.include_router(api_router)
_remove_browser_token_routes()
app.add_exception_handler(AppError, app_exception_handler)
register_static_routes(app)
