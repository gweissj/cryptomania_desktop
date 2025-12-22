import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useLocation } from "react-router-dom";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import Sparkline from "../components/Sparkline";
import { createPortal } from "react-dom";

export default function Trade() {
  const [mode, setMode] = useState("buy");

  const [assets, setAssets] = useState([]);
  const [buySearch, setBuySearch] = useState("");
  const [selectedBuy, setSelectedBuy] = useState(null);
  const [buyQuotes, setBuyQuotes] = useState([]);
  const [buySource, setBuySource] = useState("coincap");
  const [buyAmount, setBuyAmount] = useState("");
  const [buyLoading, setBuyLoading] = useState(false);
  const [buyMessage, setBuyMessage] = useState("");
  const [buyError, setBuyError] = useState("");

  const [sellHoldings, setSellHoldings] = useState([]);
  const [selectedSell, setSelectedSell] = useState(null);
  const [sellSource, setSellSource] = useState("coincap");
  const [sellMode, setSellMode] = useState("quantity");
  const [sellAmount, setSellAmount] = useState("");
  const [sellLoading, setSellLoading] = useState(false);
  const [sellMessage, setSellMessage] = useState("");
  const [sellError, setSellError] = useState("");
  const [sellQuotes, setSellQuotes] = useState([]);

  const [sellPreview, setSellPreview] = useState(null);
  const [sellPayload, setSellPayload] = useState(null);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmCountdown, setConfirmCountdown] = useState(5);
  const confirmTimerRef = useRef(null);

  const [historyData, setHistoryData] = useState([]);
  const [historyRange, setHistoryRange] = useState(1);
  const [historyError, setHistoryError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);

  const location = useLocation();
  const initialAssetId = location.state?.assetId || null;

  const rangeOptions = [
    { label: "1D", value: 1 },
    { label: "7D", value: 7 },
    { label: "1M", value: 30 },
    { label: "1Y", value: 365 },
    { label: "ALL", value: 365 },
  ];

  const currentAsset = selectedBuy || selectedSell;

  const loadHistory = async (assetId, days) => {
    if (!assetId) {
      setHistoryData([]);
      return;
    }
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const res = await api.getHistory(assetId, days);
      const hist = (res || []).map((p) => ({
        time: new Date(p.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        price: p.price,
      }));
      setHistoryData(hist);
    } catch (e) {
      setHistoryError(e.message || "Failed to load history");
      setHistoryData([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadData = async () => {
    try {
      const [assetsData, sellOverview] = await Promise.all([
        api.getAssets({ limit: 30 }),
        api.getSellOverview(),
      ]);

      setAssets(assetsData || []);
      setSellHoldings(sellOverview?.holdings || []);

      if (initialAssetId) {
        const foundBuy = (assetsData || []).find(
          (a) => a.id === initialAssetId
        );
        if (foundBuy) {
          await selectBuyAsset(foundBuy, { silent: true });
        }
        const foundSell = (sellOverview?.holdings || []).find(
          (h) => h.id === initialAssetId
        );
        if (foundSell) {
          await selectSellAsset(foundSell);
          setMode("sell");
        }
      }
    } catch (e) {
      setBuyError(e.message || "Failed to load trade data");
    }
  };

  useEffect(() => {
    loadData();
  }, [initialAssetId]);

  useEffect(() => {
    if (currentAsset) {
      loadHistory(currentAsset.id, historyRange);
    } else {
      setHistoryData([]);
    }
  }, [currentAsset, historyRange]);

  const selectBuyAsset = async (asset, { silent = false } = {}) => {
    setSelectedBuy(asset);
    setSelectedSell(null);
    setBuyAmount("");
    if (!silent) {
      setBuyMessage("");
      setBuyError("");
    }
    setBuySource("coincap");
    try {
      const qs = await api.getQuotes(asset.id);
      setBuyQuotes(qs);
    } catch (e) {
      setBuyQuotes([]);
      setBuyError(e.message || "Failed to load quotes");
    }
  };

  const handleBuy = async () => {
    if (!selectedBuy || !buyAmount) return;
    const amountNum = parseFloat(buyAmount);
    if (!amountNum || amountNum <= 0) return;

    setBuyLoading(true);
    setBuyMessage("");
    setBuyError("");
    try {
      const res = await api.buyAsset({
        asset_id: selectedBuy.id,
        amount_usd: amountNum,
        source: buySource,
      });
      setBuyMessage(
        `Bought ${res.quantity.toFixed(6)} ${res.symbol} at $${res.price.toFixed(
          2
        )}`
      );
      setBuyAmount("");
    } catch (e) {
      setBuyError(e.message || "Buy failed");
    } finally {
      setBuyLoading(false);
    }
  };

  const selectSellAsset = async (asset) => {
    setSelectedSell(asset);
    setSelectedBuy(null);
    setSellAmount("");
    setSellMessage("");
    setSellError("");
    setSellSource("coincap");
    setSellMode("quantity");
    try {
      const qs = await api.getQuotes(asset.id);
      setSellQuotes(qs);
    } catch (e) {
      setSellQuotes([]);
      setSellError(e.message || "Failed to load quotes");
    }
  };

  const openSellConfirm = async () => {
    if (!selectedSell || !sellAmount) return;
    const amountNum = parseFloat(sellAmount);
    if (!amountNum || amountNum <= 0) return;

    const payload = {
      asset_id: selectedSell.id,
      source: sellSource,
    };
    if (sellMode === "quantity") {
      payload.quantity = amountNum;
    } else {
      payload.amount_usd = amountNum;
    }

    try {
      const preview = await api.previewSell(payload);
      setSellPreview(preview);
      setSellPayload(payload);
      setConfirmCountdown(5);
      setConfirmVisible(true);

      if (confirmTimerRef.current) {
        clearInterval(confirmTimerRef.current);
      }
      confirmTimerRef.current = setInterval(() => {
        setConfirmCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(confirmTimerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (e) {
      setSellError(e.message || "Preview failed");
    }
  };

  const closeSellConfirm = () => {
    setConfirmVisible(false);
    setSellPreview(null);
    setSellPayload(null);
    if (confirmTimerRef.current) {
      clearInterval(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
  };

  const handleSellConfirmed = async () => {
    if (!sellPayload) return;

    setSellLoading(true);
    setSellMessage("");
    setSellError("");
    try {
      const res = await api.executeSell(sellPayload);
      setSellMessage(
        `Sold ${res.quantity.toFixed(6)} ${res.symbol} for $${res.received.toFixed(
          2
        )}`
      );
      setSellAmount("");

      const overview = await api.getSellOverview();
      setSellHoldings(overview?.holdings || []);
      const stillOwned = overview.holdings.find(
        (h) => h.id === selectedSell?.id
      );
      if (!stillOwned) {
        setSelectedSell(null);
        setSellQuotes([]);
      } else {
        await selectSellAsset(stillOwned);
      }
    } catch (e) {
      setSellError(e.message || "Sell failed");
    } finally {
      setSellLoading(false);
      closeSellConfirm();
    }
  };

  const filteredBuyAssets = assets.filter((a) =>
    (a.name + a.symbol).toLowerCase().includes(buySearch.toLowerCase())
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Trade</h1>

      <div className="inline-flex rounded-2xl bg-gray-100 p-1 mb-4">
        <button
          onClick={() => setMode("buy")}
          className={
            "px-4 py-2 text-sm font-semibold rounded-2xl " +
            (mode === "buy"
              ? "bg-white shadow text-gray-900"
              : "text-gray-500")
          }
        >
          Buy
        </button>
        <button
          onClick={() => setMode("sell")}
          className={
            "px-4 py-2 text-sm font-semibold rounded-2xl " +
            (mode === "sell"
              ? "bg-white shadow text-gray-900"
              : "text-gray-500")
          }
        >
          Sell
        </button>
      </div>

      {mode === "buy" ? (
        <BuySection
          assets={filteredBuyAssets}
          buySearch={buySearch}
          setBuySearch={setBuySearch}
          selected={selectedBuy}
          buyQuotes={buyQuotes}
          buySource={buySource}
          setBuySource={setBuySource}
          buyAmount={buyAmount}
          setBuyAmount={setBuyAmount}
          buyLoading={buyLoading}
          buyMessage={buyMessage}
          buyError={buyError}
          selectBuyAsset={selectBuyAsset}
          handleBuy={handleBuy}
          historyData={historyData}
          historyRange={historyRange}
          setHistoryRange={setHistoryRange}
          historyError={historyError}
          historyLoading={historyLoading}
          rangeOptions={rangeOptions}
        />
      ) : (
        <SellSection
          holdings={sellHoldings}
          selected={selectedSell}
          sellSource={sellSource}
          setSellSource={setSellSource}
          sellMode={sellMode}
          setSellMode={setSellMode}
          sellAmount={sellAmount}
          setSellAmount={setSellAmount}
          sellLoading={sellLoading}
          sellMessage={sellMessage}
          sellError={sellError}
          selectSellAsset={selectSellAsset}
          openSellConfirm={openSellConfirm}
          confirmVisible={confirmVisible}
          confirmCountdown={confirmCountdown}
          sellPreview={sellPreview}
          onConfirm={handleSellConfirmed}
          onCancel={closeSellConfirm}
          sellQuotes={sellQuotes}
          historyData={historyData}
          historyRange={historyRange}
          setHistoryRange={setHistoryRange}
          historyError={historyError}
          historyLoading={historyLoading}
          rangeOptions={rangeOptions}
        />
      )}

      {confirmVisible &&
        sellPreview &&
        createPortal(
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-3xl p-6 w-full max-w-md space-y-4">
              <h2 className="text-lg font-bold text-gray-900">
                Confirm sell
              </h2>
              <p className="text-sm text-gray-600">
                Asset:{" "}
                <span className="font-semibold">
                  {sellPreview.name} ({sellPreview.symbol})
                </span>
              </p>
              <p className="text-sm text-gray-600">
                Quantity:{" "}
                <span className="font-semibold">
                  {sellPreview.quantity} of {sellPreview.available_quantity}
                </span>
              </p>
              <p className="text-sm text-gray-600">
                Unit price:{" "}
                <span className="font-semibold">
                  ${sellPreview.unit_price.toFixed(2)}
                </span>
              </p>
              <p className="text-sm text-gray-600">
                You will receive:{" "}
                <span className="font-semibold text-green-700">
                  ${sellPreview.proceeds.toFixed(2)}
                </span>
              </p>
              <p className="text-xs text-gray-500">
                You can confirm in {confirmCountdown} seconds.
              </p>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={closeSellConfirm}
                  className="flex-1 py-2 rounded-2xl border border-gray-300 text-gray-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSellConfirmed}
                  disabled={confirmCountdown > 0 || sellLoading}
                  className="flex-1 py-2 rounded-2xl bg-red-600 text-white font-semibold disabled:opacity-50"
                >
                  {confirmCountdown > 0
                    ? `Confirm (${confirmCountdown})`
                    : sellLoading
                    ? "Processing..."
                    : "Confirm sell"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

function BuySection(props) {
  const {
    assets,
    buySearch,
    setBuySearch,
    selected,
    buyQuotes,
    buySource,
    setBuySource,
    buyAmount,
    setBuyAmount,
    buyLoading,
    buyMessage,
    buyError,
    selectBuyAsset,
    handleBuy,
    historyData,
    historyRange,
    setHistoryRange,
    historyError,
    historyLoading,
    rangeOptions,
  } = props;

  const sparkData = historyData.map((p) => p.price);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="font-semibold text-gray-700">Available</p>
        </div>
        <input
          type="text"
          placeholder="Search assets"
          value={buySearch}
          onChange={(e) => setBuySearch(e.target.value)}
          className="w-full mb-4 p-3 rounded-2xl bg-gray-50 border border-gray-200 outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {assets.map((asset) => {
            const isSelected = selected?.id === asset.id;
            const rowSpark = isSelected && sparkData.length ? sparkData : null;

            return (
              <button
                key={asset.id}
                onClick={() => selectBuyAsset(asset)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border text-left ${
                  isSelected
                    ? "bg-indigo-50 border-indigo-200"
                    : "bg-gray-50 border-gray-100 hover:bg-gray-100"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center font-semibold text-indigo-700">
                    {asset.symbol?.[0]}
                  </div>
                  <div>
                    <div className="font-semibold text-sm">{asset.name}</div>
                    <div className="text-xs text-gray-500">
                      {asset.symbol}/USD
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {rowSpark && <Sparkline data={rowSpark} />}
                  <div className="font-semibold text-sm">
                    $
                    {asset.current_price?.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  </div>
                  <div
                    className={
                      "text-xs " +
                      (asset.change_24h_pct >= 0
                        ? "text-green-500"
                        : "text-red-500")
                    }
                  >
                    {asset.change_24h_pct >= 0 ? "+" : ""}
                    {asset.change_24h_pct.toFixed(2)}%
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <>
          <PriceHistoryBlock
            asset={selected}
            historyData={historyData}
            historyRange={historyRange}
            setHistoryRange={setHistoryRange}
            historyError={historyError}
            historyLoading={historyLoading}
            rangeOptions={rangeOptions}
          />

          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-gray-500">Selected asset</p>
                <p className="text-lg font-semibold">
                  {selected.name} ({selected.symbol}/USD)
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {buyQuotes.map((q) => (
                <button
                  key={q.source}
                  onClick={() => setBuySource(q.source)}
                  className={`rounded-2xl p-3 border text-left ${
                    buySource === q.source
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200"
                  }`}
                >
                  <p className="font-semibold uppercase">{q.source}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {q.source === "coincap"
                      ? "Cheaper now"
                      : "Alternative price source"}
                  </p>
                  <p className="text-lg font-bold mt-2">
                    ${q.price.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </button>
              ))}
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-1">
                Amount in USD
              </label>
              <input
                type="number"
                min="0"
                value={buyAmount}
                onChange={(e) => setBuyAmount(e.target.value)}
                className="w-full p-3 rounded-2xl bg-gray-50 border border-gray-200 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {buyError && (
              <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-2xl">
                {buyError}
              </div>
            )}
            {buyMessage && (
              <div className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-2xl">
                {buyMessage}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleBuy}
                disabled={!buyAmount || buyLoading}
                className="flex-1 py-3 rounded-2xl bg-indigo-900 text-white font-semibold disabled:opacity-50"
              >
                {buyLoading ? "Processing..." : "Buy now"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SellSection(props) {
  const {
    holdings,
    selected,
    sellSource,
    setSellSource,
    sellMode,
    setSellMode,
    sellAmount,
    setSellAmount,
    sellLoading,
    sellMessage,
    sellError,
    selectSellAsset,
    openSellConfirm,
    confirmVisible,
    confirmCountdown,
    sellPreview,
    onConfirm,
    onCancel,
    sellQuotes,
    historyData,
    historyRange,
    setHistoryRange,
    historyError,
    historyLoading,
    rangeOptions,
  } = props;

  const sparkData = historyData.map((p) => p.price);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="font-semibold text-gray-700">
            Holdings (available to sell)
          </p>
        </div>

        {holdings.length === 0 ? (
          <p className="text-sm text-gray-500">
            You have no assets to sell yet.
          </p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {holdings.map((h) => {
              const isSelected = selected?.id === h.id;
              const pnl = Number(h.unrealized_pnl ?? 0);
              const pnlPct = Number(h.unrealized_pnl_pct ?? 0);
              const pnlClass =
                pnlPct >= 0 ? "text-green-500" : "text-red-500";
              const rowSpark = isSelected && sparkData.length ? sparkData : null;

              return (
                <button
                  key={h.id}
                  onClick={() => selectSellAsset(h)}
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
                      <div className="font-semibold text-sm">
                        {h.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {h.symbol?.toUpperCase()} · {h.quantity} pcs
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {rowSpark && <Sparkline data={rowSpark} />}
                    <div className="font-semibold text-sm">
                      ${h.current_value?.toLocaleString()}
                    </div>
                    <div className={"text-xs " + pnlClass}>
                      {pnlPct >= 0 ? "+" : ""}
                      {pnlPct.toFixed(2)}% (
                      {pnl >= 0 ? "+" : "-"}$
                      {Math.abs(pnl).toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                      )
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selected && (
        <>
          <PriceHistoryBlock
            asset={selected}
            historyData={historyData}
            historyRange={historyRange}
            setHistoryRange={setHistoryRange}
            historyError={historyError}
            historyLoading={historyLoading}
            rangeOptions={rangeOptions}
          />

          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-gray-500">Selected asset</p>
                <p className="text-lg font-semibold">
                  {selected.name} ({selected.symbol}/USD)
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Available: {selected.quantity} pcs
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(sellQuotes && sellQuotes.length
                ? sellQuotes
                : [{ source: "coincap" }, { source: "coingecko" }]
              ).map((q, idx) => {
                const src = q.source || (idx === 0 ? "coincap" : "coingecko");
                const price = q.price;
                return (
                  <button
                    key={src}
                    onClick={() => setSellSource(src)}
                    className={`rounded-2xl p-3 border text-left ${
                      sellSource === src
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200"
                    }`}
                  >
                    <p className="font-semibold uppercase">
                      {src.toUpperCase()}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {src === "coincap"
                        ? "Cheaper now"
                        : "Alternative price source"}
                    </p>
                    {price != null && (
                      <p className="text-lg font-bold mt-2">
                        $
                        {price.toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-3 text-sm">
              <button
                onClick={() => setSellMode("quantity")}
                className={
                  "px-3 py-1 rounded-full border " +
                  (sellMode === "quantity"
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-gray-100 text-gray-700 border-gray-200")
                }
              >
                By quantity
              </button>
              <button
                onClick={() => setSellMode("usd")}
                className={
                  "px-3 py-1 rounded-full border " +
                  (sellMode === "usd"
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-gray-100 text-gray-700 border-gray-200")
                }
              >
                By USD amount
              </button>
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-1">
                {sellMode === "quantity"
                  ? "Quantity to sell"
                  : "Amount in USD"}
              </label>
              <input
                type="number"
                min="0"
                value={sellAmount}
                onChange={(e) => setSellAmount(e.target.value)}
                className="w-full p-3 rounded-2xl bg-gray-50 border border-gray-200 outline-none focus:ring-2 focus:ring-blue-500"
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

            <div className="flex gap-3">
              <button
                onClick={openSellConfirm}
                disabled={!sellAmount || sellLoading}
                className="flex-1 py-3 rounded-2xl bg-red-600 text-white font-semibold disabled:opacity-50"
              >
                Sell now
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PriceHistoryBlock({
  asset,
  historyData,
  historyRange,
  setHistoryRange,
  historyError,
  historyLoading,
  rangeOptions,
}) {
  if (!asset || !historyData.length) return null;

  return (
    <div className="bg-slate-900 rounded-3xl p-4 space-y-3 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">
          {asset.name} price
        </p>
        <div className="flex gap-1 text-xs">
          {rangeOptions.map((r) => (
            <button
              key={r.value}
              onClick={() => setHistoryRange(r.value)}
              className={
                "px-2 py-1 rounded-full " +
                (historyRange === r.value
                  ? "bg-white text-slate-900"
                  : "bg-slate-800 text-slate-200")
              }
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {historyError && (
        <p className="text-xs text-red-400">{historyError}</p>
      )}
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={historyData}>
            <XAxis dataKey="time" hide />
            <YAxis domain={["dataMin", "dataMax"]} hide />
            <Tooltip
              contentStyle={{
                fontSize: "0.75rem",
                backgroundColor: "rgba(15,23,42,0.9)",
                borderRadius: "0.75rem",
                border: "1px solid rgba(148,163,184,0.4)",
              }}
              labelStyle={{ color: "#e5e7eb" }}
              itemStyle={{ color: "#22c55e" }}
              formatter={(value) => [
                `$${Number(value).toFixed(2)}`,
                "Price",
              ]}
              labelFormatter={(label) => label}
            />
            <Line
              type="monotone"
              dataKey="price"
              stroke="#22c55e"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {historyLoading && (
        <p className="text-xs text-slate-300">Loading history…</p>
      )}
    </div>
  );
}