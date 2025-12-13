import { useEffect, useState } from "react";
import { api } from "../api";
import { useLocation } from "react-router-dom";

export default function Trade() {
  const [assets, setAssets] = useState([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [quotes, setQuotes] = useState([]);
  const [source, setSource] = useState("coincap");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const location = useLocation();
  const initialAssetId = location.state?.assetId || null;

  const loadAssets = async () => {
    try {
      const data = await api.getAssets({ limit: 30 });
      setAssets(data || []);

      if (initialAssetId && data && data.length > 0) {
        const initial = data.find((a) => a.id === initialAssetId);
        if (initial) {
          await selectAsset(initial);
        }
      }
    } catch (e) {
      setError(e.message || "Failed to load assets");
    }
  };

  useEffect(() => {
    loadAssets();
  }, [initialAssetId]);

  const filtered = assets.filter((a) =>
    (a.name + a.symbol).toLowerCase().includes(search.toLowerCase())
  );

  const selectAsset = async (asset) => {
    setSelected(asset);
    setAmount("");
    setMessage("");
    setError("");
    setSource("coincap");
    try {
      const qs = await api.getQuotes(asset.id);
      setQuotes(qs);
    } catch (e) {
      setQuotes([]);
      setError(e.message || "Failed to load quotes");
    }
  };

  const handleBuy = async () => {
    if (!selected || !amount) return;
    setLoading(true);
    setMessage("");
    setError("");
    try {
      const res = await api.buyAsset({
        asset_id: selected.id,
        amount_usd: amount,
        source,
      });
      setMessage(
        `Bought ${res.quantity.toFixed(6)} ${res.symbol} at $${res.price.toFixed(
          2
        )}`
      );
      setAmount("");
    } catch (e) {
      setError(e.message || "Buy failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Trade</h1>

      {/* Список активов */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="font-semibold text-gray-700">Available</p>
        </div>
        <input
          type="text"
          placeholder="Search assets"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full mb-4 p-3 rounded-2xl bg-gray-50 border border-gray-200 outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {filtered.map((asset) => (
            <button
              key={asset.id}
              onClick={() => selectAsset(asset)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border text-left ${
                selected?.id === asset.id
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
              <div className="text-right">
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
          ))}
        </div>
      </div>

      {/* Панель покупки */}
      {selected && (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-500">Selected asset</p>
              <p className="text-lg font-semibold">
                {selected.name} ({selected.symbol}/USD)
              </p>
            </div>
          </div>

          {/* цены из двух источников */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {quotes.map((q) => (
              <button
                key={q.source}
                onClick={() => setSource(q.source)}
                className={`rounded-2xl p-3 border text-left ${
                  source === q.source
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
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full p-3 rounded-2xl bg-gray-50 border border-gray-200 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-2xl">
              {error}
            </div>
          )}
          {message && (
            <div className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-2xl">
              {message}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleBuy}
              disabled={!amount || loading}
              className="flex-1 py-3 rounded-2xl bg-indigo-900 text-white font-semibold disabled:opacity-50"
            >
              {loading ? "Processing..." : "Buy now"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}