from __future__ import annotations

import logging
from dataclasses import dataclass
from getpass import getpass
from typing import Optional

import typer

from .api import ApiError, KursachApi
from .commands import (
    DeviceCommandDispatcher,
    format_money,
    format_quantity,
    print_dashboard,
    print_preview,
    print_sell_result,
)
from .config import AppConfig, load_config
from .poller import CommandPoller
from .state import DesktopStateStore


app = typer.Typer(add_completion=False, help="Desktop companion for kursach backend")
sell_app = typer.Typer(help="Sell workflow commands")
app.add_typer(sell_app, name="sell")


@dataclass
class AppContext:
    config: AppConfig
    api: KursachApi
    state_store: DesktopStateStore


def _get_context(ctx: typer.Context) -> AppContext:
    if ctx.obj is None:
        raise typer.BadParameter("Application context not initialised")
    return ctx.obj  # type: ignore[return-value]


@app.callback()
def main(
    ctx: typer.Context,
    verbose: bool = typer.Option(
        False,
        "--verbose",
        "-v",
        help="Enable debug logs",
        flag_value=True,
    ),
) -> None:
    config = load_config()
    base_url = config.normalized_base_url()
    state_store = DesktopStateStore()
    api = KursachApi(base_url, token=state_store.state.access_token, verify_ssl=config.verify_ssl)
    ctx.obj = AppContext(config=config, api=api, state_store=state_store)
    log_level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(level=log_level, format="%(asctime)s [%(levelname)s] %(message)s")
    ctx.call_on_close(api.close)


@app.command()
def status(ctx: typer.Context) -> None:
    context = _get_context(ctx)
    cfg = context.config
    typer.echo("Desktop client status:")
    typer.echo(f"  API base URL: {cfg.normalized_base_url()}")
    typer.echo(f"  Target device: {cfg.target_device}")
    typer.echo(f"  Device id: {cfg.device_id}")
    typer.echo(
        f"  Token stored: {'yes' if context.state_store.state.access_token else 'no'}"
    )
    if context.state_store.state.last_polled_at:
        typer.echo(f"  Last poll: {context.state_store.state.last_polled_at}")
    if context.state_store.state.last_command_id:
        typer.echo(f"  Last command #: {context.state_store.state.last_command_id}")


@app.command()
def login(
    ctx: typer.Context,
    email: Optional[str] = typer.Option(None, "--email", prompt=True),
    password: Optional[str] = typer.Option(None, "--password", prompt=False, hide_input=True),
) -> None:
    context = _get_context(ctx)
    if not password:
        password = getpass("Password: ")
    try:
        result = context.api.login(email=email or "", password=password)
    except ApiError as exc:
        typer.secho(f"Login failed: {exc}", fg=typer.colors.RED)
        raise typer.Exit(code=1) from exc
    token = result.get("access_token")
    if token:
        context.state_store.set_token(token)
    typer.echo("Login successful. Token saved for desktop use.")


@app.command()
def logout(ctx: typer.Context) -> None:
    context = _get_context(ctx)
    try:
        context.api.logout()
    except ApiError as exc:
        typer.secho(f"Logout failed: {exc}", fg=typer.colors.RED)
        raise typer.Exit(code=1) from exc
    context.state_store.clear_token()
    typer.echo("Logged out and local token removed.")


@app.command()
def dashboard(ctx: typer.Context) -> None:
    context = _get_context(ctx)
    _ensure_authenticated(context)
    try:
        dash = context.api.get_dashboard()
        sell_overview = context.api.get_sell_overview()
    except ApiError as exc:
        typer.secho(f"Failed to fetch dashboard: {exc}", fg=typer.colors.RED)
        raise typer.Exit(code=1) from exc
    print_dashboard(dash, sell_overview)


@sell_app.command("overview")
def sell_overview(ctx: typer.Context) -> None:
    context = _get_context(ctx)
    _ensure_authenticated(context)
    try:
        overview = context.api.get_sell_overview()
    except ApiError as exc:
        typer.secho(f"Failed to load sell overview: {exc}", fg=typer.colors.RED)
        raise typer.Exit(code=1) from exc

    holdings = overview.get("holdings") or []
    typer.echo("Sellable assets:")
    if not holdings:
        typer.echo("  (none)")
        return
    for asset in holdings:
        typer.echo(
            f"- {asset.get('symbol')} ({asset.get('id')}): qty {format_quantity(asset.get('quantity'))}, "
            f"current ${format_money(asset.get('current_price'))}, value ${format_money(asset.get('current_value'))}"
        )


@sell_app.command("preview")
def sell_preview(
    ctx: typer.Context,
    asset_id: str = typer.Option(..., help="Asset id to sell"),
    quantity: Optional[float] = typer.Option(None, help="Quantity of the asset to sell"),
    amount_usd: Optional[float] = typer.Option(None, help="Alternatively sell by USD amount"),
    source: str = typer.Option("coincap", help="Price source: coincap or coingecko"),
) -> None:
    context = _get_context(ctx)
    _ensure_authenticated(context)
    if quantity is None and amount_usd is None:
        raise typer.BadParameter("Provide quantity or amount_usd")
    try:
        preview = context.api.preview_sell(
            asset_id=asset_id,
            quantity=quantity,
            amount_usd=amount_usd,
            price_source=source,
        )
    except ApiError as exc:
        typer.secho(f"Preview failed: {exc}", fg=typer.colors.RED)
        raise typer.Exit(code=1) from exc
    print_preview(preview)


@sell_app.command("execute")
def sell_execute(
    ctx: typer.Context,
    asset_id: str = typer.Option(..., help="Asset id to sell"),
    quantity: Optional[float] = typer.Option(None, help="Quantity of the asset to sell"),
    amount_usd: Optional[float] = typer.Option(None, help="Sell by USD amount"),
    source: str = typer.Option("coincap", help="Price source"),
    skip_preview: bool = typer.Option(False, help="Skip preview step", flag_value=True),
) -> None:
    context = _get_context(ctx)
    _ensure_authenticated(context)
    if quantity is None and amount_usd is None:
        raise typer.BadParameter("Provide quantity or amount_usd")

    preview = None
    if not skip_preview:
        try:
            preview = context.api.preview_sell(
                asset_id=asset_id,
                quantity=quantity,
                amount_usd=amount_usd,
                price_source=source,
            )
        except ApiError as exc:
            typer.secho(f"Preview failed: {exc}", fg=typer.colors.RED)
            raise typer.Exit(code=1) from exc
        print_preview(preview)
        if not typer.confirm("Execute this sell?", default=False):
            typer.echo("Cancelled.")
            raise typer.Exit(code=0)

    try:
        result = context.api.execute_sell(
            asset_id=asset_id,
            quantity=quantity,
            amount_usd=amount_usd,
            price_source=source,
        )
    except ApiError as exc:
        typer.secho(f"Sell failed: {exc}", fg=typer.colors.RED)
        raise typer.Exit(code=1) from exc
    print_sell_result(result)


@app.command()
def poll(
    ctx: typer.Context,
    once: bool = typer.Option(False, help="Run a single poll cycle and exit", flag_value=True),
    interval: Optional[int] = typer.Option(None, help="Override poll interval in seconds"),
    auto_confirm_flag: bool = typer.Option(
        False,
        "--auto-confirm",
        help="Force auto execution of EXECUTE_DESKTOP_SELL commands.",
        is_flag=True,
        flag_value=True,
    ),
    ask_flag: bool = typer.Option(
        False,
        "--ask-before-sell",
        help="Always ask before executing EXECUTE_DESKTOP_SELL commands.",
        is_flag=True,
        flag_value=True,
    ),
) -> None:
    context = _get_context(ctx)
    if auto_confirm_flag and ask_flag:
        raise typer.BadParameter("Use only one of --auto-confirm or --ask-before-sell")
    auto_confirm: Optional[bool] = None
    if auto_confirm_flag:
        auto_confirm = True
    elif ask_flag:
        auto_confirm = False
    dispatcher = DeviceCommandDispatcher(
        context.api,
        context.state_store,
        context.config,
        auto_confirm=auto_confirm,
    )
    poller = CommandPoller(context.api, dispatcher, context.state_store, context.config)
    poller.run(once=once, interval=interval)


def _ensure_authenticated(context: AppContext) -> None:
    if not context.state_store.state.access_token:
        typer.secho("Desktop client is not authenticated. Run `python -m kursach_desktop login`.", fg=typer.colors.RED)
        raise typer.Exit(code=1)


if __name__ == "__main__":
    app()
