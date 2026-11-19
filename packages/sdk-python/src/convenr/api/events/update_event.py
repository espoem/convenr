from http import HTTPStatus
from typing import Any
from urllib.parse import quote

import httpx2

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.event import Event
from ...models.problem import Problem
from ...models.update_event_request import UpdateEventRequest
from ...types import Response


def _get_kwargs(
    id: str,
    *,
    body: UpdateEventRequest,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "patch",
        "url": "/events/{id}".format(
            id=quote(str(id), safe=""),
        ),
    }

    _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx2.Response
) -> Event | Problem | None:
    if response.status_code == 200:
        response_200 = Event.from_dict(response.json())

        return response_200

    if response.status_code == 400:
        response_400 = Problem.from_dict(response.json())

        return response_400

    if response.status_code == 401:
        response_401 = Problem.from_dict(response.json())

        return response_401

    if response.status_code == 403:
        response_403 = Problem.from_dict(response.json())

        return response_403

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

    if response.status_code == 500:
        response_500 = Problem.from_dict(response.json())

        return response_500

    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: AuthenticatedClient | Client, response: httpx2.Response
) -> Response[Event | Problem]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    id: str,
    *,
    client: AuthenticatedClient,
    body: UpdateEventRequest,
) -> Response[Event | Problem]:
    """Change an event

     Changes the fields the request names and keeps the others. A schedule is replaced as a whole. When
    the change would remove slots that participants chose, it is refused with `confirmation_required`;
    repeat it with `confirmedLosing` set to the `losing` of that problem.

    Args:
        id (str):
        body (UpdateEventRequest): The fields to change. A field left out keeps its value.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx2.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Event | Problem]
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
    client: AuthenticatedClient,
    body: UpdateEventRequest,
) -> Event | Problem | None:
    """Change an event

     Changes the fields the request names and keeps the others. A schedule is replaced as a whole. When
    the change would remove slots that participants chose, it is refused with `confirmation_required`;
    repeat it with `confirmedLosing` set to the `losing` of that problem.

    Args:
        id (str):
        body (UpdateEventRequest): The fields to change. A field left out keeps its value.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx2.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Event | Problem
    """

    return sync_detailed(
        id=id,
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    id: str,
    *,
    client: AuthenticatedClient,
    body: UpdateEventRequest,
) -> Response[Event | Problem]:
    """Change an event

     Changes the fields the request names and keeps the others. A schedule is replaced as a whole. When
    the change would remove slots that participants chose, it is refused with `confirmation_required`;
    repeat it with `confirmedLosing` set to the `losing` of that problem.

    Args:
        id (str):
        body (UpdateEventRequest): The fields to change. A field left out keeps its value.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx2.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Event | Problem]
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
    client: AuthenticatedClient,
    body: UpdateEventRequest,
) -> Event | Problem | None:
    """Change an event

     Changes the fields the request names and keeps the others. A schedule is replaced as a whole. When
    the change would remove slots that participants chose, it is refused with `confirmation_required`;
    repeat it with `confirmedLosing` set to the `losing` of that problem.

    Args:
        id (str):
        body (UpdateEventRequest): The fields to change. A field left out keeps its value.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx2.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Event | Problem
    """

    return (
        await asyncio_detailed(
            id=id,
            client=client,
            body=body,
        )
    ).parsed
