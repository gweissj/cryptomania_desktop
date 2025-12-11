import { useEffect, useState } from "react";
import { api } from "../api";
import { useNavigate } from "react-router-dom";

export default function Market() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.getAssets({ search, limit: 50 });
      setAssets(data || []);
    } catch (e) {
      setError(e.message || "Failed to load market assets");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onSubmit = (e) => {
    e.preventDefault();
    load();
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-gray-500 hover:text-gray-800"
        >
          ← Back
        </button>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        Market Movers
      </h1>

      <form onSubmit={onSubmit} className="flex gap-3 max-w-xl">
        <input
          type="text"
          placeholder="Search assets"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 p-3 rounded-2xl bg-white border border-gray-200 outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          className="px-4 py-2 rounded-2xl bg-indigo-900 text-white font-semibold text-sm"
        >
          Search
        </button>
      </form>

      {loading && (
        <p className="text-gray-500 text-sm">Loading assets…</p>
      )}
      {error && (
        <p className="text-red-600 text-sm">{error}</p>
      )}

      <div className="space-y-3">
        {assets.map((asset) => (
          <div
            key={asset.id}
            className="bg-white rounded-2xl px-4 py-3 flex items-center justify-between shadow-sm border border-gray-100"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center font-semibold text-indigo-700">
                {asset.symbol?.[0] ?? "?"}
              </div>
              <div>
                <div className="font-semibold text-sm">{asset.name}</div>
                <div className="text-xs text-gray-500">
                  {asset.symbol}/USD
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  24h Vol.{" "}
                  {asset.volume_24h?.toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-semibold">
                $
                {asset.current_price?.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}
              </div>
              <div
                className={
                  "text-xs mt-1 " +
                  (asset.change_24h_pct >= 0
                    ? "text-green-500"
                    : "text-red-500")
                }
              >
                {asset.change_24h_pct >= 0 ? "+" : ""}
                {asset.change_24h_pct.toFixed(2)}%
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}