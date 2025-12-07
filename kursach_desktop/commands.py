from __future__ import annotations

import logging
from typing import Any, Callable, Dict, List, Tuple

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
            "REQUEST_DESKTOP_SELL": self._handle_request_desktop_sell,
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

    def _handle_request_desktop_sell(self, command: Dict[str, Any]) -> str:
        self._require_token()
        payload = command.get("payload") or {}
        try:
            return self._interactive_sell(payload)
        except KeyboardInterrupt as exc:
            raise CommandError("Interactive sell cancelled by user") from exc

    def _interactive_sell(self, payload: Dict[str, Any]) -> str:
        overview = self.api.get_sell_overview()
        holdings: List[Dict[str, Any]] = overview.get("holdings") or []
        if not holdings:
            raise CommandError("No holdings available for sale.")

        asset = self._prompt_asset_selection(holdings, payload)
        source = self._prompt_price_source(payload.get("source") or "coincap")
        quantity, amount_usd = self._prompt_sale_amount(asset, payload)

        preview = self.api.preview_sell(
            asset_id=str(asset.get("id") or ""),
            quantity=quantity,
            amount_usd=amount_usd,
            price_source=source,
        )
        print_preview(preview)

        if not self._confirm(
            f"Sell {format_quantity(preview.get('quantity'))} {preview.get('symbol')} "
            f"for ${format_money(preview.get('proceeds'))}?"
        ):
            raise CommandError("User rejected sell request")

        result = self.api.execute_sell(
            asset_id=str(asset.get("id") or ""),
            quantity=quantity,
            amount_usd=amount_usd,
            price_source=source,
        )
        print_sell_result(result)
        proceeds = format_money(result.get("received"))
        symbol = result.get("symbol")
        return f"Interactive sell complete: {symbol} -> ${proceeds}"

    def _prompt_asset_selection(
        self,
        holdings: List[Dict[str, Any]],
        payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        preferred_id = str(payload.get("preferred_asset_id") or "").lower()
        preferred_symbol = str(payload.get("preferred_symbol") or "").lower()

        print("\nChoose asset to sell:")
        for idx, asset in enumerate(holdings, start=1):
            symbol = asset.get("symbol")
            name = asset.get("name")
            qty = format_quantity(asset.get("quantity"))
            price = format_money(asset.get("current_price"))
            print(f"  [{idx}] {symbol} ({name}) qty {qty} @ ${price}")

        default_index = 1
        for idx, asset in enumerate(holdings, start=1):
            asset_id = str(asset.get("id") or "").lower()
            symbol = str(asset.get("symbol") or "").lower()
            if preferred_id and asset_id == preferred_id:
                default_index = idx
                break
            if preferred_symbol and symbol == preferred_symbol:
                default_index = idx
                break

        while True:
            raw = input(f"Select asset [default {default_index}]: ").strip()
            if not raw:
                return holdings[default_index - 1]
            if raw.isdigit():
                idx = int(raw)
                if 1 <= idx <= len(holdings):
                    return holdings[idx - 1]
            normalized = raw.lower()
            for asset in holdings:
                asset_id = str(asset.get("id") or "").lower()
                symbol = str(asset.get("symbol") or "").lower()
                if normalized in {asset_id, symbol}:
                    return asset
            print("Invalid selection. Enter the number, id, or symbol of the asset.")

    def _prompt_price_source(self, default_source: str) -> str:
        default = default_source.lower() if default_source.lower() in {"coincap", "coingecko"} else "coincap"
        while True:
            value = input(
                f"Price source [coincap/coingecko] (default {default}): "
            ).strip().lower()
            if not value:
                return default
            if value in {"coincap", "coingecko"}:
                return value
            print("Enter either 'coincap' or 'coingecko'.")

    def _prompt_sale_amount(
        self,
        asset: Dict[str, Any],
        payload: Dict[str, Any],
    ) -> Tuple[float | None, float | None]:
        available = float(asset.get("quantity") or 0.0)
        if available <= 0:
            raise CommandError("Selected asset has zero quantity.")

        suggested_quantity = payload.get("suggested_quantity")
        quantity_default = min(float(suggested_quantity or available), available)

        price = float(asset.get("current_price") or 0.0)
        max_amount = price * available if price > 0 else None
        suggested_amount = payload.get("suggested_amount_usd")
        amount_default = (
            min(float(suggested_amount or (max_amount or 0.0)), max_amount)
            if max_amount
            else None
        )

        usd_allowed = max_amount is not None and max_amount > 0
        default_mode = "a" if (amount_default and not suggested_quantity and usd_allowed) else "q"

        if not usd_allowed:
            print("Price is unavailable, sale will be configured by quantity.")
            return self._prompt_quantity(available, quantity_default)

        while True:
            choice = input(
                f"Sell by [q]uantity or [a]mount in USD? [default {default_mode}]: "
            ).strip().lower()
            if not choice:
                choice = default_mode
            if choice in {"q", "quantity"}:
                return self._prompt_quantity(available, quantity_default)
            if choice in {"a", "amount", "usd"}:
                return self._prompt_amount(max_amount, amount_default)
            print("Please enter 'q' or 'a'.")

    def _prompt_quantity(self, available: float, default_value: float) -> Tuple[float, None]:
        default_display = format_quantity(default_value)
        while True:
            raw = input(
                f"Quantity to sell (<= {format_quantity(available)}) [default {default_display}]: "
            ).strip()
            if not raw:
                qty = default_value
            else:
                try:
                    qty = float(raw)
                except ValueError:
                    print("Enter a numeric quantity.")
                    continue
            if qty <= 0:
                print("Quantity must be greater than zero.")
                continue
            if qty > available:
                print("Quantity cannot exceed the available amount.")
                continue
            return qty, None

    def _prompt_amount(self, max_amount: float, default_value: float | None) -> Tuple[None, float]:
        default_display = format_money(default_value or max_amount)
        while True:
            raw = input(
                f"USD amount to sell (<= ${format_money(max_amount)}) [default {default_display}]: "
            ).strip()
            if not raw:
                amount = default_value or max_amount
            else:
                try:
                    amount = float(raw)
                except ValueError:
                    print("Enter a numeric USD amount.")
                    continue
            if amount <= 0:
                print("Amount must be greater than zero.")
                continue
            if amount > max_amount:
                print("Amount cannot exceed the full position value.")
                continue
            return None, amount

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
