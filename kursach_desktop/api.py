from __future__ import annotations

import logging
from typing import Any, Dict, Optional

import httpx


LOG = logging.getLogger(__name__)


class ApiError(RuntimeError):
    def __init__(self, status_code: int, message: str, payload: Any | None = None) -> None:
        super().__init__(f"HTTP {status_code}: {message}")
        self.status_code = status_code
        self.payload = payload


class KursachApi:
    def __init__(
        self,
        base_url: str,
        token: str | None = None,
        verify_ssl: bool = False,
        timeout: float = 20.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self._token = token
        self._client = httpx.Client(
            base_url=self.base_url,
            timeout=timeout,
            headers={"accept": "application/json"},
            verify=verify_ssl,
        )

    def close(self) -> None:
        self._client.close()

    def set_token(self, token: str | None) -> None:
        self._token = token

    def _request(self, method: str, url: str, **kwargs: Any) -> Any:
        headers = kwargs.pop("headers", {})
        request_headers = {"accept": "application/json"}
        if self._token:
            request_headers["Authorization"] = f"Bearer {self._token}"
        request_headers.update(headers)
        try:
            response = self._client.request(method, url, headers=request_headers, **kwargs)
        except httpx.HTTPError as exc:
            raise ApiError(-1, f"Network error: {exc}") from exc

        if response.is_error:
            message = _extract_error_message(response)
            raise ApiError(response.status_code, message, payload=_safe_json(response))

        if response.status_code == 204:
            return None

        return _safe_json(response)

    # Auth
    def login(self, *, email: str, password: str) -> Dict[str, Any]:
        data = self._request("POST", "/auth/login", json={"email": email, "password": password})
        token = data.get("access_token") if isinstance(data, dict) else None
        if not token:
            raise ApiError(500, "Login succeeded but token missing", payload=data)
        self.set_token(token)
        return data

    def logout(self) -> None:
        self._request("POST", "/auth/logout")
        self.set_token(None)

    def get_dashboard(self) -> Dict[str, Any]:
        return self._request("GET", "/crypto/dashboard")

    def get_sell_overview(self) -> Dict[str, Any]:
        return self._request("GET", "/crypto/sell/overview")

    def preview_sell(
        self,
        *,
        asset_id: str,
        quantity: float | None,
        amount_usd: float | None,
        price_source: str,
    ) -> Dict[str, Any]:
        body: Dict[str, Any] = {"asset_id": asset_id, "source": price_source}
        if quantity is not None:
            body["quantity"] = quantity
        if amount_usd is not None:
            body["amount_usd"] = amount_usd
        return self._request("POST", "/crypto/sell/preview", json=body)

    def execute_sell(
        self,
        *,
        asset_id: str,
        quantity: float | None,
        amount_usd: float | None,
        price_source: str,
    ) -> Dict[str, Any]:
        body: Dict[str, Any] = {"asset_id": asset_id, "source": price_source}
        if quantity is not None:
            body["quantity"] = quantity
        if amount_usd is not None:
            body["amount_usd"] = amount_usd
        return self._request("POST", "/crypto/sell", json=body)

    def poll_commands(
        self,
        *,
        target_device: str,
        target_device_id: str | None,
        limit: int = 10,
    ) -> Dict[str, Any]:
        params = {"target_device": target_device, "limit": limit}
        if target_device_id:
            params["target_device_id"] = target_device_id
        return self._request("GET", "/crypto/device-commands/poll", params=params)

    def acknowledge_command(self, command_id: int, status: str) -> Dict[str, Any]:
        return self._request(
            "POST",
            f"/crypto/device-commands/{command_id}/ack",
            json={"status": status},
        )

    def get_transactions(self) -> Any:
        return self._request("GET", "/crypto/transactions")


def _safe_json(response: httpx.Response) -> Any:
    try:
        return response.json()
    except ValueError:
        LOG.debug("Response is not JSON: %s", response.text)
        return response.text


def _extract_error_message(response: httpx.Response) -> str:
    payload = _safe_json(response)
    if isinstance(payload, dict):
        detail = payload.get("detail") or payload.get("message")
        if isinstance(detail, str):
            return detail
    return response.text or "Unexpected API error"


__all__ = ["ApiError", "KursachApi"]
