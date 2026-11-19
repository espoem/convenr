from http import HTTPStatus
from typing import Any, cast
from urllib.parse import quote

import httpx2

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.problem import Problem
from ...types import UNSET, Response, Unset


def _get_kwargs(
    id: str,
    *,
    if_none_match: str | Unset = UNSET,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}
    if not isinstance(if_none_match, Unset):
        headers["If-None-Match"] = if_none_match

    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/events/{id}/final.ics".format(
            id=quote(str(id), safe=""),
        ),
    }

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx2.Response
) -> Any | Problem | str | None:
    if response.status_code == 200:
        response_200 = response.text
        return response_200

    if response.status_code == 304:
        response_304 = cast(Any, None)
        return response_304

    if response.status_code == 400:
        response_400 = Problem.from_dict(response.json())

        return response_400

    if response.status_code == 404:
        response_404 = Problem.from_dict(response.json())

        return response_404

    if response.status_code == 500:
        response_500 = Problem.from_dict(response.json())

        return response_500

    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: AuthenticatedClient | Client, response: httpx2.Response
) -> Response[Any | Problem | str]:
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
    if_none_match: str | Unset = UNSET,
) -> Response[Any | Problem | str]:
    """Download the final time as a calendar file

     An iCalendar file with one event: the name, the description followed by the share link, and the
    final time in UTC. It never holds the admin link or a participant's name. Its `UID` comes from the
    event id and its `SEQUENCE` grows with every pick or change, so a calendar that imports a later file
    replaces the earlier entry. This is the only answer of the API that is not JSON.

    Args:
        id (str):
        if_none_match (str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx2.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Any | Problem | str]
    """

    kwargs = _get_kwargs(
        id=id,
        if_none_match=if_none_match,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    id: str,
    *,
    client: AuthenticatedClient | Client,
    if_none_match: str | Unset = UNSET,
) -> Any | Problem | str | None:
    """Download the final time as a calendar file

     An iCalendar file with one event: the name, the description followed by the share link, and the
    final time in UTC. It never holds the admin link or a participant's name. Its `UID` comes from the
    event id and its `SEQUENCE` grows with every pick or change, so a calendar that imports a later file
    replaces the earlier entry. This is the only answer of the API that is not JSON.

    Args:
        id (str):
        if_none_match (str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx2.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Any | Problem | str
    """

    return sync_detailed(
        id=id,
        client=client,
        if_none_match=if_none_match,
    ).parsed


async def asyncio_detailed(
    id: str,
    *,
    client: AuthenticatedClient | Client,
    if_none_match: str | Unset = UNSET,
) -> Response[Any | Problem | str]:
    """Download the final time as a calendar file

     An iCalendar file with one event: the name, the description followed by the share link, and the
    final time in UTC. It never holds the admin link or a participant's name. Its `UID` comes from the
    event id and its `SEQUENCE` grows with every pick or change, so a calendar that imports a later file
    replaces the earlier entry. This is the only answer of the API that is not JSON.

    Args:
        id (str):
        if_none_match (str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx2.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Any | Problem | str]
    """

    kwargs = _get_kwargs(
        id=id,
        if_none_match=if_none_match,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    id: str,
    *,
    client: AuthenticatedClient | Client,
    if_none_match: str | Unset = UNSET,
) -> Any | Problem | str | None:
    """Download the final time as a calendar file

     An iCalendar file with one event: the name, the description followed by the share link, and the
    final time in UTC. It never holds the admin link or a participant's name. Its `UID` comes from the
    event id and its `SEQUENCE` grows with every pick or change, so a calendar that imports a later file
    replaces the earlier entry. This is the only answer of the API that is not JSON.

    Args:
        id (str):
        if_none_match (str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx2.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Any | Problem | str
    """

    return (
        await asyncio_detailed(
            id=id,
            client=client,
            if_none_match=if_none_match,
        )
    ).parsed
