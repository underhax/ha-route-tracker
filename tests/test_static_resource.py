from typing import cast
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from aiohttp import web

from custom_components.route_tracker import (
    FRONTEND_CACHE_CONTROL,
    RouteTrackerStaticResource,
)


class _StubResource(RouteTrackerStaticResource):
    """Expose the parent's protected handler for isolated verification."""

    async def invoke_parent_handle(self, request: web.Request) -> web.StreamResponse:
        return await self._handle(request)


@pytest.mark.parametrize("content_encoding", [None, "br", "gzip"])
async def test_static_resource_requires_revalidation(
    content_encoding: str | None,
) -> None:
    """Ensure every frontend representation is validated before reuse."""
    headers = {
        "ETag": '"frontend-version"',
        "Last-Modified": "Mon, 01 Jun 2026 00:00:00 GMT",
    }
    if content_encoding is not None:
        headers["Content-Encoding"] = content_encoding
    upstream_response = web.Response(headers=headers)
    request = cast(web.Request, MagicMock(spec=web.Request))
    resource = _StubResource("/route_tracker", "/tmp")

    fake_handle = AsyncMock(return_value=upstream_response)

    with patch.object(web.StaticResource, "_handle", fake_handle):
        result = await resource.invoke_parent_handle(request)

    assert result is upstream_response
    assert result.headers["Cache-Control"] == FRONTEND_CACHE_CONTROL
    assert result.headers["ETag"] == '"frontend-version"'
    assert result.headers["Last-Modified"] == "Mon, 01 Jun 2026 00:00:00 GMT"
    assert result.headers.get("Content-Encoding") == content_encoding
