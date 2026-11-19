from http import HTTPStatus
from typing import Any
from urllib.parse import quote

import httpx2

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.join_request import JoinRequest
from ...models.joined import Joined
from ...models.problem import Problem
from ...types import Response


def _get_kwargs(
    id: str,
    *,
    body: JoinRequest,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/events/{id}/participants".format(
            id=quote(str(id), safe=""),
        ),
    }

    _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx2.Response
) -> Joined | Problem | None:
    if response.status_code == 200:
        response_200 = Joined.from_dict(response.json())

        return response_200

    if response.status_code == 400:
        response_400 = Problem.from_dict(response.json())

        return response_400

    if response.status_code == 403:
        response_403 = Problem.from_dict(response.json())

        return response_403

    if response.status_code == 404:
        response_404 = Problem.from_dict(response.json())

        return response_404

    if response.status_code == 409:
        response_409 = Problem.from_dict(response.json())

        return response_409

    if response.status_code == 413:
        response_413 = Problem.from_dict(response.json())

        return response_413

    if response.status_code == 415:
        response_415 = Problem.from_dict(response.json())

        return response_415

    if response.status_code == 422:
        response_422 = Problem.from_dict(response.json())

        return response_422

    if response.status_code == 429:
        response_429 = Problem.from_dict(response.json())

        return response_429

    if response.status_code == 500:
        response_500 = Problem.from_dict(response.json())

        return response_500

    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: AuthenticatedClient | Client, response: httpx2.Response
) -> Response[Joined | Problem]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    id: str,
    *,
    client: AuthenticatedClient | Client,
    body: JoinRequest,
) -> Response[Joined | Problem]:
    """Join an event

     Joins under a display name and returns a participant token. A name that is already used gives a
    token for that participant; when the name has a password, send it as `password`. To protect a new
    name, send `newPassword`.

    Args:
        id (str):
        body (JoinRequest): A join. At most one of `password` and `newPassword`.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx2.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Joined | Problem]
    """

    kwargs = _get_kwargs(
        id=id,
        body=body,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    id: str,
    *,
    client: AuthenticatedClient | Client,
    body: JoinRequest,
) -> Joined | Problem | None:
    """Join an event

     Joins under a display name and returns a participant token. A name that is already used gives a
    token for that participant; when the name has a password, send it as `password`. To protect a new
    name, send `newPassword`.

    Args:
        id (str):
        body (JoinRequest): A join. At most one of `password` and `newPassword`.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx2.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Joined | Problem
    """

    return sync_detailed(
        id=id,
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    id: str,
    *,
    client: AuthenticatedClient | Client,
    body: JoinRequest,
) -> Response[Joined | Problem]:
    """Join an event

     Joins under a display name and returns a participant token. A name that is already used gives a
    token for that participant; when the name has a password, send it as `password`. To protect a new
    name, send `newPassword`.

    Args:
        id (str):
        body (JoinRequest): A join. At most one of `password` and `newPassword`.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx2.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Joined | Problem]
    """

    kwargs = _get_kwargs(
        id=id,
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    id: str,
    *,
    client: AuthenticatedClient | Client,
    body: JoinRequest,
) -> Joined | Problem | None:
    """Join an event

     Joins under a display name and returns a participant token. A name that is already used gives a
    token for that participant; when the name has a password, send it as `password`. To protect a new
    name, send `newPassword`.

    Args:
        id (str):
        body (JoinRequest): A join. At most one of `password` and `newPassword`.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx2.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Joined | Problem
    """

    return (
        await asyncio_detailed(
            id=id,
            client=client,
            body=body,
        )
    ).parsed
