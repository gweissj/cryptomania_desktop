from __future__ import annotations

import logging
from typing import Any, Callable, Dict

from .api import KursachApi
from .config import AppConfig
from .state import DesktopStateStore


LOG = logging.getLogger(__name__)


class CommandError(Exception):
    """Raised when a device command cannot be fulfilled."""


class DeviceCommandDispatcher:
    def __init__(
        self,
        api: KursachApi,
        state_store: DesktopStateStore,
        config: AppConfig,
        *,
        auto_confirm: bool | None = None,
    ) -> None:
        self.api = api
        self.state_store = state_store
        self.config = config
        self.auto_confirm = auto_confirm if auto_confirm is not None else config.auto_confirm_sales
        self._handlers: Dict[str, Callable[[Dict[str, Any]], str]] = {
            "LOGIN_ON_DESKTOP": self._handle_login,
            "OPEN_DESKTOP_DASHBOARD": self._handle_dashboard,
            "EXECUTE_DESKTOP_SELL": self._handle_execute_sell,
        }

    def handle(self, command: Dict[str, Any]) -> str:
        action = (command.get("action") or "").upper()
        payload = command.get("payload") or {}
        LOG.info("Processing command %s | action=%s payload=%s", command.get("id"), action, payload)
        handler = self._handlers.get(action)
        if handler is None:
            raise CommandError(f"Unsupported action: {action or '<empty>'}")
        return handler(command)

    # Individual handlers
    def _handle_login(self, command: Dict[str, Any]) -> str:
        payload = command.get("payload") or {}
        token = payload.get("access_token")
        if not token:
            raise CommandError("LOGIN_ON_DESKTOP payload does not contain access_token")
        self.state_store.set_token(token)
        self.api.set_token(token)
        LOG.info("Stored access token from mobile command")
        return "Access token saved"

    def _handle_dashboard(self, command: Dict[str, Any]) -> str:
        self._require_token()
        dashboard = self.api.get_dashboard()
        sell_overview = self.api.get_sell_overview()
        print_dashboard(dashboard, sell_overview)
        return "Dashboard rendered"

    def _handle_execute_sell(self, command: Dict[str, Any]) -> str:
        self._require_token()
        payload = command.get("payload") or {}
        asset_id = payload.get("asset_id")
        quantity = payload.get("quantity")
        amount_usd = payload.get("amount_usd")
        price_source = payload.get("source", "coincap")
        if not asset_id:
            raise CommandError("EXECUTE_DESKTOP_SELL payload is missing asset_id")
        if quantity is None and amount_usd is None:
            raise CommandError("EXECUTE_DESKTOP_SELL payload requires quantity or amount_usd")

        preview = self.api.preview_sell(
            asset_id=asset_id,
            quantity=quantity,
            amount_usd=amount_usd,
            price_source=price_source,
        )
        print_preview(preview)

        if not self._confirm(
            f"Sell {preview.get('quantity')} {preview.get('symbol')} for {preview.get('proceeds')} USD?"
        ):
            raise CommandError("User rejected sell command")

        result = self.api.execute_sell(
            asset_id=asset_id,
            quantity=quantity,
            amount_usd=amount_usd,
            price_source=price_source,
        )
        print_sell_result(result)
        return (
            f"Sold {result.get('quantity')} {result.get('symbol')} "
            f"for {result.get('received')} USD"
        )

    def _confirm(self, message: str) -> bool:
        if self.auto_confirm:
            LOG.info("Auto-confirm enabled: %s", message)
            return True
        answer = input(f"{message} [y/N]: ").strip().lower()
        return answer in {"y", "yes"}

    def _require_token(self) -> None:
        if not self.state_store.state.access_token:
            raise CommandError(
                "Desktop is not authenticated. Run the login command or send LOGIN_ON_DESKTOP from mobile."
            )


def format_money(value: Any) -> str:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value)
    return f"{number:,.2f}"


def format_quantity(value: Any) -> str:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value)
    return f"{number:,.6f}".rstrip("0").rstrip(".")


def print_dashboard(dashboard: Dict[str, Any], sell_overview: Dict[str, Any]) -> None:
    currency = dashboard.get("currency", "USD")
    print("\n=== Desktop Dashboard ===")
    print(
        f"Portfolio balance: {format_money(dashboard.get('portfolio_balance'))} {currency} "
        f"(cash {format_money(dashboard.get('cash_balance'))})"
    )
    print("Market movers loaded:", len(dashboard.get("market_movers", [])))
    print("--- Sellable holdings ---")
    holdings = sell_overview.get("holdings") or []
    if not holdings:
        print("No holdings available for sale.")
    for asset in holdings:
        symbol = asset.get("symbol")
        qty = format_quantity(asset.get("quantity"))
        price = format_money(asset.get("current_price"))
        value = format_money(asset.get("current_value"))
        pnl = format_money(asset.get("unrealized_pnl"))
        pnl_pct = asset.get("unrealized_pnl_pct", 0.0)
        print(
            f"- {symbol}: qty {qty} | price ${price} | value ${value} | PnL ${pnl} ({pnl_pct:.2f}%)"
        )
    print("==========================\n")


def print_preview(preview: Dict[str, Any]) -> None:
    print("\n>>> Sell preview")
    print(
        f"Asset: {preview.get('name')} ({preview.get('symbol')}) | Source: {preview.get('price_source')}"
    )
    print(
        f"Quantity: {format_quantity(preview.get('quantity'))} of {format_quantity(preview.get('available_quantity'))} available"
    )
    print(
        f"Unit price: ${format_money(preview.get('unit_price'))} | Proceeds: ${format_money(preview.get('proceeds'))}"
    )


def print_sell_result(result: Dict[str, Any]) -> None:
    print("\n*** Sell executed ***")
    print(
        f"Sold {format_quantity(result.get('quantity'))} {result.get('symbol')} @ ${format_money(result.get('price'))}"
    )
    print(
        f"Received ${format_money(result.get('received'))} | Cash balance: ${format_money(result.get('cash_balance'))}"
    )
    print(f"Total balance: ${format_money(result.get('total_balance'))}")
    pnl = result.get("realized_pnl")
    if pnl is not None:
        print(f"Realized PnL: ${format_money(pnl)}")
    print("*************************\n")


__all__ = [
    "CommandError",
    "DeviceCommandDispatcher",
    "format_money",
    "format_quantity",
    "print_dashboard",
    "print_preview",
    "print_sell_result",
]
