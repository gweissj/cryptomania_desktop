import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import {
  AlertCircle,
  CheckCircle2,
  PauseCircle,
  PhoneCall,
  PlayCircle,
} from "lucide-react";

const POLL_INTERVAL_MS = 5000;

const formatMoney = (value) => {
  const num = Number(value ?? 0);
  if (Number.isNaN(num)) return String(value ?? "");
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatQty = (value) => {
  const num = Number(value ?? 0);
  if (Number.isNaN(num)) return String(value ?? "");
  return num.toLocaleString(undefined, {
    maximumFractionDigits: 6,
  });
};

export default function Sell() {
  const [isListening, setIsListening] = useState(true);
  const pollTimerRef = useRef(null);
  const pollBusyRef = useRef(false);

  const [pollError, setPollError] = useState("");
  const [status, setStatus] = useState(null); // { type, text }
  const [activeCommand, setActiveCommand] = useState(null);
  const [pendingPreferredAsset, setPendingPreferredAsset] = useState(null);

  const [holdings, setHoldings] = useState([]);
  const [cashBalance, setCashBalance] = useState(null);
  const [currency, setCurrency] = useState("USD");
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [sellSource, setSellSource] = useState("coincap");
  const [sellMode, setSellMode] = useState("quantity");
  const [sellAmount, setSellAmount] = useState("");
  const [sellQuotes, setSellQuotes] = useState([]);
  const [sellPreview, setSellPreview] = useState(null);
  const [sellPayload, setSellPayload] = useState(null);
  const [sellLoading, setSellLoading] = useState(false);
  const [sellMessage, setSellMessage] = useState("");
  const [sellError, setSellError] = useState("");
  const [overviewLoading, setOverviewLoading] = useState(true);

  useEffect(() => {
    loadOverview();
  }, []);

  useEffect(() => {
    if (selectedAsset) {
      loadQuotes(selectedAsset.id);
    } else {
      setSellQuotes([]);
    }
    // reset preview when selection changes
    setSellPreview(null);
    setSellPayload(null);
  }, [selectedAsset]);

  useEffect(() => {
    setSellPreview(null);
    setSellPayload(null);
  }, [sellMode, sellAmount, sellSource]);

  useEffect(() => {
    if (!isListening) {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }
    const tick = async () => {
      await pollCommands();
    };
    tick();
    pollTimerRef.current = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [isListening]);

  useEffect(() => {
    if (!pendingPreferredAsset || !holdings.length) return;
    const preferred = holdings.find((h) => h.id === pendingPreferredAsset);
    if (preferred) {
      setSelectedAsset(preferred);
    }
    setPendingPreferredAsset(null);
  }, [pendingPreferredAsset, holdings]);

  const loadOverview = async () => {
    setOverviewLoading(true);
    setSellError("");
    try {
      const overview = await api.getSellOverview();
      const items = overview?.holdings || [];
      setHoldings(items);
      setCashBalance(overview?.cash_balance ?? null);
      setCurrency(overview?.currency || "USD");

      const matched =
        (selectedAsset &&
          items.find((item) => item.id === selectedAsset.id)) ||
        null;
      if (matched) {
        setSelectedAsset(matched);
      } else if (items.length) {
        setSelectedAsset(items[0]);
      } else {
        setSelectedAsset(null);
      }
    } catch (e) {
      setSellError(e.message || "Не удалось загрузить активы для продажи");
      setHoldings([]);
      setSelectedAsset(null);
    } finally {
      setOverviewLoading(false);
    }
  };

  const loadQuotes = async (assetId) => {
    try {
      const quotes = await api.getQuotes(assetId);
      setSellQuotes(quotes || []);
    } catch {
      setSellQuotes([]);
    }
  };

  const pollCommands = async () => {
    if (pollBusyRef.current) return;
    pollBusyRef.current = true;
    try {
      setPollError("");
      const res = await api.pollDeviceCommands({
        target_device: "desktop",
        limit: 5,
      });
      const commands = res?.commands || [];
      for (const command of commands) {
        await handleCommand(command);
      }
    } catch (e) {
      setPollError(e.message || "Не удалось опросить сервер");
    } finally {
      pollBusyRef.current = false;
    }
  };

  const handleCommand = async (command) => {
    const action = (command?.action || "").toUpperCase();
    if (!action) {
      await acknowledge(command?.id, "FAILED");
      return;
    }

    if (action === "EXECUTE_DESKTOP_SELL") {
      await handleExecuteSellCommand(command);
      return;
    }
    if (action === "LOGIN_ON_DESKTOP") {
      await handleLoginCommand(command);
      return;
    }
    if (action === "OPEN_DESKTOP_DASHBOARD") {
      await handleDashboardCommand(command);
      return;
    }
    if (action === "REQUEST_DESKTOP_SELL") {
      handleRequestSellCommand(command);
      return;
    }

    await acknowledge(command.id, "FAILED");
  };

  const acknowledge = async (id, statusValue) => {
    if (!id) return;
    try {
      await api.acknowledgeDeviceCommand(id, statusValue);
    } catch {
      // swallow ack errors, they will show in logs server-side
    }
  };

  const handleLoginCommand = async (command) => {
    const token = command?.payload?.access_token;
    if (!token) {
      setStatus({
        type: "error",
        text: "Команда LOGIN_ON_DESKTOP не содержит токен.",
      });
      await acknowledge(command?.id, "FAILED");
      return;
    }
    localStorage.setItem("access_token", token);
    setStatus({
      type: "success",
      text: "Токен с мобильного сохранен. Продолжаем работу.",
    });
    await acknowledge(command?.id, "ACKNOWLEDGED");
    await loadOverview();
  };

  const handleDashboardCommand = async (command) => {
    await loadOverview();
    setStatus({
      type: "info",
      text: "Получена команда с телефона: дашборд обновлен.",
    });
    await acknowledge(command?.id, "ACKNOWLEDGED");
  };

  const handleExecuteSellCommand = async (command) => {
    const payload = command?.payload || {};
    const assetId = payload.asset_id;
    const quantity = payload.quantity;
    const amountUsd = payload.amount_usd;
    const source = payload.source || "coincap";

    if (!assetId || (quantity == null && amountUsd == null)) {
      setStatus({
        type: "error",
        text: "Не хватает данных в команде EXECUTE_DESKTOP_SELL.",
      });
      await acknowledge(command?.id, "FAILED");
      return;
    }

    setStatus({
      type: "info",
      text: `Запрос с телефона: продаем ${assetId} (${source}).`,
    });

    try {
      await api.previewSell({
        asset_id: assetId,
        quantity,
        amount_usd: amountUsd,
        source,
      });
      const res = await api.executeSell({
        asset_id: assetId,
        quantity,
        amount_usd: amountUsd,
        source,
      });
      setStatus({
        type: "success",
        text: `Продажа выполнена: ${formatQty(res.quantity)} ${res.symbol} → $${formatMoney(
          res.received
        )}.`,
      });
      await acknowledge(command?.id, "ACKNOWLEDGED");
      await loadOverview();
    } catch (e) {
      setStatus({
        type: "error",
        text:
          e.message || "Не удалось выполнить продажу по команде с телефона.",
      });
      await acknowledge(command?.id, "FAILED");
    }
  };

  const handleRequestSellCommand = (command) => {
    const payload = command?.payload || {};
    setActiveCommand(command);
    setIsListening(false);
    setStatus({
      type: "info",
      text: "Получен запрос на продажу с мобильного. Заполните форму ниже.",
    });

    if (payload.source) {
      setSellSource(payload.source);
    }
    if (payload.preferred_asset_id) {
      setPendingPreferredAsset(payload.preferred_asset_id);
    }
    if (payload.suggested_quantity) {
      setSellMode("quantity");
      setSellAmount(String(payload.suggested_quantity));
    } else if (payload.suggested_amount_usd) {
      setSellMode("usd");
      setSellAmount(String(payload.suggested_amount_usd));
    }
  };

  const buildSellPayload = () => {
    if (!selectedAsset) {
      setSellError("Выберите актив для продажи.");
      return null;
    }
    const amountNum = parseFloat(sellAmount);
    if (!amountNum || amountNum <= 0) {
      setSellError("Введите количество или сумму продажи.");
      return null;
    }
    const payload = {
      asset_id: selectedAsset.id,
      source: sellSource,
    };
    if (sellMode === "quantity") {
      payload.quantity = amountNum;
    } else {
      payload.amount_usd = amountNum;
    }
    return payload;
  };

  const handlePreview = async () => {
    const payload = buildSellPayload();
    if (!payload) return;

    setSellLoading(true);
    setSellMessage("");
    setSellError("");
    try {
      const preview = await api.previewSell(payload);
      setSellPreview(preview);
      setSellPayload(payload);
    } catch (e) {
      setSellError(e.message || "Не удалось получить предпросмотр.");
      setSellPreview(null);
      setSellPayload(null);
    } finally {
      setSellLoading(false);
    }
  };

  const handleExecuteManualSell = async () => {
    const payload = sellPayload || buildSellPayload();
    if (!payload) return;

    setSellLoading(true);
    setSellMessage("");
    setSellError("");
    try {
      const res = await api.executeSell(payload);
      setSellMessage(
        `Продано ${formatQty(res.quantity)} ${res.symbol} на $${formatMoney(
          res.received
        )}. Баланс: $${formatMoney(res.cash_balance)}.`
      );
      setSellAmount("");
      setSellPreview(null);
      setSellPayload(null);
      await loadOverview();

      if (activeCommand && activeCommand.action === "REQUEST_DESKTOP_SELL") {
        await acknowledge(activeCommand.id, "ACKNOWLEDGED");
        setActiveCommand(null);
      }
    } catch (e) {
      setSellError(e.message || "Не удалось выполнить продажу.");
      if (activeCommand && activeCommand.action === "REQUEST_DESKTOP_SELL") {
        await acknowledge(activeCommand.id, "FAILED");
      }
    } finally {
      setSellLoading(false);
    }
  };

  const cancelActiveCommand = async () => {
    if (!activeCommand) return;
    await acknowledge(activeCommand.id, "FAILED");
    setActiveCommand(null);
  };

  const listeningBanner = isListening ? (
    <div className="bg-white border border-indigo-100 rounded-3xl shadow-sm p-6 flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <PhoneCall className="text-indigo-700" size={24} />
        <div>
          <p className="text-lg font-semibold text-indigo-900">
            ожидание запроса на продажу валюты
          </p>
          <p className="text-sm text-gray-600">
            ПК-клиент слушает сервер каждые 5 секунд и автоматически
            исполняет команды, отправленные с телефона.
          </p>
          {pollError && (
            <p className="text-sm text-red-600 mt-1">{pollError}</p>
          )}
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        <button
          onClick={() => setIsListening(false)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-red-50 text-red-700 border border-red-200 font-semibold"
        >
          <PauseCircle size={18} />
          Остановить прослушку
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Продажа через ПК-клиент
          </h1>
          <p className="text-sm text-gray-600">
            Слушаем команды с мобильного и позволяем продавать вручную при
            остановке прослушки.
          </p>
        </div>
        <button
          onClick={() => setIsListening((v) => !v)}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl font-semibold border ${
            isListening
              ? "bg-red-50 text-red-700 border-red-200"
              : "bg-indigo-50 text-indigo-900 border-indigo-200"
          }`}
        >
          {isListening ? (
            <>
              <PauseCircle size={18} /> Остановить прослушку
            </>
          ) : (
            <>
              <PlayCircle size={18} /> Снова слушать сервер
            </>
          )}
        </button>
      </div>

      {status && (
        <div
          className={`flex items-start gap-2 p-3 rounded-2xl border ${
            status.type === "error"
              ? "bg-red-50 border-red-200 text-red-700"
              : status.type === "success"
              ? "bg-green-50 border-green-200 text-green-700"
              : "bg-indigo-50 border-indigo-200 text-indigo-900"
          }`}
        >
          {status.type === "error" ? (
            <AlertCircle size={18} />
          ) : status.type === "success" ? (
            <CheckCircle2 size={18} />
          ) : (
            <PhoneCall size={18} />
          )}
          <span className="text-sm">{status.text}</span>
        </div>
      )}

      {isListening && listeningBanner}

      {!isListening && (
        <div className="space-y-3">
          {activeCommand && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-indigo-900 font-semibold">
                <PhoneCall size={18} /> Команда с мобильного ждет исполнения
              </div>
              <p className="text-sm text-indigo-800">
                Action: {activeCommand.action}. После продажи отправим
                подтверждение обратно.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={cancelActiveCommand}
                  className="px-3 py-2 rounded-xl border border-indigo-300 text-indigo-900 text-sm"
                >
                  Отклонить запрос
                </button>
                <button
                  onClick={() => setIsListening(false)}
                  className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-sm"
                >
                  Продолжить ручную продажу
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold text-gray-800">Активы для продажи</p>
              <p className="text-sm text-gray-500">
                Баланс кошелька: ${formatMoney(cashBalance)} {currency}
              </p>
            </div>
            {overviewLoading ? (
              <p className="text-sm text-gray-500">Загрузка портфеля...</p>
            ) : holdings.length === 0 ? (
              <p className="text-sm text-gray-500">
                Нет активов, доступных для продажи.
              </p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {holdings.map((h) => {
                  const isSelected = selectedAsset?.id === h.id;
                  const pnlClass =
                    (h.unrealized_pnl_pct || 0) >= 0
                      ? "text-green-600"
                      : "text-red-600";
                  return (
                    <button
                      key={h.id}
                      onClick={() => {
                        setSelectedAsset(h);
                        setSellAmount("");
                        setSellMessage("");
                        setSellError("");
                      }}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border text-left ${
                        isSelected
                          ? "bg-indigo-50 border-indigo-200"
                          : "bg-gray-50 border-gray-100 hover:bg-gray-100"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center font-semibold text-indigo-700">
                          {h.symbol?.[0]}
                        </div>
                        <div>
                          <div className="font-semibold text-sm">{h.name}</div>
                          <div className="text-xs text-gray-500">
                            {h.symbol?.toUpperCase()} · {formatQty(h.quantity)}{" "}
                            pcs
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-sm">
                          ${formatMoney(h.current_value)}
                        </div>
                        <div className={`text-xs ${pnlClass}`}>
                          {formatMoney(h.unrealized_pnl)} ({formatMoney(
                            h.unrealized_pnl_pct
                          )}
                          %)
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 space-y-4">
            {selectedAsset ? (
              <>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm text-gray-500">Выбранный актив</p>
                    <p className="text-lg font-semibold">
                      {selectedAsset.name} ({selectedAsset.symbol}/USD)
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Доступно: {formatQty(selectedAsset.quantity)} pcs
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(sellQuotes && sellQuotes.length
                    ? sellQuotes
                    : [{ source: "coincap" }, { source: "coingecko" }]
                  ).map((q, idx) => {
                    const src =
                      q.source || (idx === 0 ? "coincap" : "coingecko");
                    const price = q.price;
                    return (
                      <button
                        key={src}
                        onClick={() => setSellSource(src)}
                        className={`rounded-2xl p-3 border text-left ${
                          sellSource === src
                            ? "border-indigo-500 bg-indigo-50"
                            : "border-gray-200"
                        }`}
                      >
                        <p className="font-semibold uppercase">{src}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          Источник цены для сделки
                        </p>
                        {price != null && (
                          <p className="text-lg font-bold mt-2">
                            ${formatMoney(price)}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="flex gap-3 text-sm">
                  <button
                    onClick={() => setSellMode("quantity")}
                    className={`px-3 py-1 rounded-full border ${
                      sellMode === "quantity"
                        ? "bg-gray-900 text-white border-gray-900"
                        : "bg-gray-100 text-gray-700 border-gray-200"
                    }`}
                  >
                    По количеству
                  </button>
                  <button
                    onClick={() => setSellMode("usd")}
                    className={`px-3 py-1 rounded-full border ${
                      sellMode === "usd"
                        ? "bg-gray-900 text-white border-gray-900"
                        : "bg-gray-100 text-gray-700 border-gray-200"
                    }`}
                  >
                    По сумме (USD)
                  </button>
                </div>

                <div>
                  <label className="block text-sm text-gray-500 mb-1">
                    {sellMode === "quantity"
                      ? "Количество к продаже"
                      : "Сумма в USD"}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={sellAmount}
                    onChange={(e) => setSellAmount(e.target.value)}
                    className="w-full p-3 rounded-2xl bg-gray-50 border border-gray-200 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {sellError && (
                  <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-2xl">
                    {sellError}
                  </div>
                )}
                {sellMessage && (
                  <div className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-2xl">
                    {sellMessage}
                  </div>
                )}

                {sellPreview && (
                  <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 space-y-1 text-sm text-indigo-900">
                    <p className="font-semibold">Предпросмотр</p>
                    <p>
                      Количество: {formatQty(sellPreview.quantity)} из{" "}
                      {formatQty(sellPreview.available_quantity)}
                    </p>
                    <p>
                      Цена за единицу: ${formatMoney(sellPreview.unit_price)} (
                      {sellPreview.price_source})
                    </p>
                    <p className="font-semibold">
                      Вы получите: ${formatMoney(sellPreview.proceeds)}
                    </p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={handlePreview}
                    disabled={sellLoading}
                    className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-800 font-semibold border border-gray-200 disabled:opacity-50"
                  >
                    {sellLoading ? "..." : "Предпросмотр"}
                  </button>
                  <button
                    onClick={handleExecuteManualSell}
                    disabled={sellLoading}
                    className="flex-1 py-3 rounded-2xl bg-red-600 text-white font-semibold disabled:opacity-50"
                  >
                    {sellLoading ? "Обработка..." : "Продать"}
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500">
                Выберите актив слева, чтобы настроить продажу.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
