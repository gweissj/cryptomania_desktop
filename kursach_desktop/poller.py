from __future__ import annotations

import logging
import time
from typing import Any, Dict, Iterable, Optional

from .api import ApiError, KursachApi
from .commands import CommandError, DeviceCommandDispatcher
from .config import AppConfig
from .state import DesktopStateStore


LOG = logging.getLogger(__name__)


class CommandPoller:
    def __init__(
        self,
        api: KursachApi,
        dispatcher: DeviceCommandDispatcher,
        state_store: DesktopStateStore,
        config: AppConfig,
    ) -> None:
        self.api = api
        self.dispatcher = dispatcher
        self.state_store = state_store
        self.config = config

    def run(self, *, once: bool = False, interval: Optional[int] = None) -> None:
        sleep_seconds = interval or self.config.poll_interval_seconds
        LOG.info(
            "Starting poll loop: target=%s device_id=%s interval=%ss",
            self.config.target_device,
            self.config.device_id,
            sleep_seconds,
        )
        while True:
            try:
                response = self.api.poll_commands(
                    target_device=self.config.target_device,
                    target_device_id=self.config.device_id,
                    limit=10,
                )
            except ApiError as exc:
                LOG.error("Failed to poll device commands: %s", exc)
                if once:
                    break
                time.sleep(sleep_seconds)
                continue

            commands = response.get("commands") or []
            polled_at = response.get("polled_at")
            if polled_at:
                self.state_store.state.last_polled_at = polled_at
                self.state_store.save()
            if not commands:
                LOG.info("Polled at %s: no pending commands", polled_at)
            for command in commands:
                self._handle_command(command)
            if once:
                break
            time.sleep(sleep_seconds)

    def _handle_command(self, command: Dict[str, Any]) -> None:
        command_id = command.get("id")
        action = command.get("action")
        payload = command.get("payload")
        LOG.info("Received command #%s action=%s", command_id, action)
        print(f"Received command #{command_id} -> {action} | payload={payload}")
        try:
            result_text = self.dispatcher.handle(command)
        except (CommandError, ApiError) as exc:
            LOG.error("Command %s failed: %s", command_id, exc)
            self._ack(command_id, "FAILED")
            return
        except Exception:
            LOG.exception("Unexpected error while handling command %s", command_id)
            self._ack(command_id, "FAILED")
            return

        LOG.info("Command %s completed: %s", command_id, result_text)
        self.state_store.state.last_command_id = command_id
        self.state_store.save()
        self._ack(command_id, "ACKNOWLEDGED")

    def _ack(self, command_id: Any, status: str) -> None:
        if command_id is None:
            return
        try:
            self.api.acknowledge_command(int(command_id), status)
        except (ApiError, ValueError) as exc:
            LOG.error("Failed to ACK command %s: %s", command_id, exc)
