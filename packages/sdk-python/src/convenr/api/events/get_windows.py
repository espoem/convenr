from http import HTTPStatus
from typing import Any, cast
from urllib.parse import quote

import httpx2

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.problem import Problem
from ...models.windows import Windows
from ...types import UNSET, Response, Unset


def _get_kwargs(
    id: str,
    *,
    min_minutes: int | Unset = UNSET,
    min_people: int | Unset = UNSET,
    if_none_match: str | Unset = UNSET,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}
    if not isinstance(if_none_match, Unset):
        headers["If-None-Match"] = if_none_match

    params: dict[str, Any] = {}

    params["minMinutes"] = min_minutes

    params["minPeople"] = min_people

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/events/{id}/windows".format(
            id=quote(str(id), safe=""),
        ),
        "params": params,
    }

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx2.Response
) -> Any | Problem | Windows | None:
    if response.status_code == 200:
        response_200 = Windows.from_dict(response.json())

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
) -> Response[Any | Problem | Windows]:
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
    min_minutes: int | Unset = UNSET,
    min_people: int | Unset = UNSET,
    if_none_match: str | Unset = UNSET,
) -> Response[Any | Problem | Windows]:
    """Best windows

     Up to five runs of consecutive slots when the most people are available, as the event page lists
    them. A dated event's windows are taken per day in its reference zone. The `ETag` is the version of
    the event; send it in `If-None-Match` to get `304` while nothing changed.

    Args:
        id (str):
        min_minutes (int | Unset):
        min_people (int | Unset):
        if_none_match (str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx2.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Any | Problem | Windows]
    """

    kwargs = _get_kwargs(
        id=id,
        min_minutes=min_minutes,
        min_people=min_people,
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
    min_minutes: int | Unset = UNSET,
    min_people: int | Unset = UNSET,
    if_none_match: str | Unset = UNSET,
) -> Any | Problem | Windows | None:
    """Best windows

     Up to five runs of consecutive slots when the most people are available, as the event page lists
    them. A dated event's windows are taken per day in its reference zone. The `ETag` is the version of
    the event; send it in `If-None-Match` to get `304` while nothing changed.

    Args:
        id (str):
        min_minutes (int | Unset):
        min_people (int | Unset):
        if_none_match (str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx2.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Any | Problem | Windows
    """

    return sync_detailed(
        id=id,
        client=client,
        min_minutes=min_minutes,
        min_people=min_people,
        if_none_match=if_none_match,
    ).parsed


async def asyncio_detailed(
    id: str,
    *,
    client: AuthenticatedClient | Client,
    min_minutes: int | Unset = UNSET,
    min_people: int | Unset = UNSET,
    if_none_match: str | Unset = UNSET,
) -> Response[Any | Problem | Windows]:
    """Best windows

     Up to five runs of consecutive slots when the most people are available, as the event page lists
    them. A dated event's windows are taken per day in its reference zone. The `ETag` is the version of
    the event; send it in `If-None-Match` to get `304` while nothing changed.

    Args:
        id (str):
        min_minutes (int | Unset):
        min_people (int | Unset):
        if_none_match (str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx2.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Any | Problem | Windows]
    """

    kwargs = _get_kwargs(
        id=id,
        min_minutes=min_minutes,
        min_people=min_people,
        if_none_match=if_none_match,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    id: str,
    *,
    client: AuthenticatedClient | Client,
    min_minutes: int | Unset = UNSET,
    min_people: int | Unset = UNSET,
    if_none_match: str | Unset = UNSET,
) -> Any | Problem | Windows | None:
    """Best windows

     Up to five runs of consecutive slots when the most people are available, as the event page lists
    them. A dated event's windows are taken per day in its reference zone. The `ETag` is the version of
    the event; send it in `If-None-Match` to get `304` while nothing changed.

    Args:
        id (str):
        min_minutes (int | Unset):
        min_people (int | Unset):
        if_none_match (str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx2.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Any | Problem | Windows
    """

    return (
        await asyncio_detailed(
            id=id,
            client=client,
            min_minutes=min_minutes,
            min_people=min_people,
            if_none_match=if_none_match,
        )
    ).parsed
