import { useEffect, useState } from "react";
import { api } from "../api";
import { useNavigate } from "react-router-dom";
import Sparkline from "../components/Sparkline";

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
      let data = [];
      if (search.trim()) {
        data = await api.getAssets({ search, limit: 50 });
      } else {
        data = await api.getMarketMovers(12);
      }

      const sorted = (data || [])
        .slice()
        .sort(
          (a, b) => (b.change_24h_pct || 0) - (a.change_24h_pct || 0)
        );
      setAssets(sorted);
      if (!sorted.length) {
        setError("Не найдено активов. Попробуйте другой запрос.");
      }
    } catch (e) {
      setAssets([]);
      setError(e.message || "Не удалось загрузить активы");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = (e) => {
    e.preventDefault();
    load();
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
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
        <p className="text-gray-500 text-sm">Загружаем рынок...</p>
      )}
      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div className="space-y-3">
        {assets.map((asset) => (
          <button
            key={asset.id}
            onClick={() =>
              navigate("/trade", { state: { assetId: asset.id } })
            }
            className="w-full bg-white rounded-2xl px-4 py-3 flex items-center justify-between shadow-sm border border-gray-100 hover:bg-gray-50 text-left"
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
            <div className="flex items-center gap-4">
              <Sparkline data={asset.sparkline} />
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
          </button>
        ))}
      </div>
    </div>
  );
}
