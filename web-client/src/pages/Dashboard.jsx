import { useEffect, useState } from "react";
import { api } from "../api";
import { RefreshCw } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

export default function Dashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [marketMovers, setMarketMovers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const dash = await api.getDashboard();
      setDashboard(dash);
      setMarketMovers(dash.market_movers || []);
    } catch (e) {
      console.error(e);
      setError(e.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading && !dashboard) {
    return (
      <div className="p-8 text-center text-gray-500">
        Loading dashboard…
      </div>
    );
  }

  if (error && !dashboard) {
    return (
      <div className="p-8 text-center text-red-600">
        {error}
      </div>
    );
  }

  const d = dashboard || {};

  const totalPnl = d.total_pnl ?? 0;
  const totalPnlPct = d.total_pnl_pct ?? 0;
  const dayChange = d.day_change ?? 0;
  const dayChangePct = d.day_change_pct ?? 0;

  const pnlChipClass =
    totalPnlPct >= 0
      ? "bg-green-100 text-green-700"
      : "bg-red-100 text-red-700";

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
      {/* Заголовок + refresh */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <button
          onClick={loadData}
          className="p-2 rounded-full bg-white shadow hover:bg-gray-100 transition"
          title="Refresh"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      {/* Карточка баланса */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-gray-500 font-medium">Portfolio Balance</p>
            <div className="flex items-baseline gap-3 mt-2">
              <span className="text-4xl font-bold tracking-tight">
                $
                {d.portfolio_balance?.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }) ?? "0.00"}
              </span>
              {/* общий PnL относительно всех депозитов */}
              <span
                className={
                  "px-3 py-1 rounded-full text-sm font-semibold " +
                  pnlChipClass
                }
              >
                {totalPnlPct >= 0 ? "+" : ""}
                {totalPnlPct.toFixed(2)}% (
                {totalPnl >= 0 ? "+" : "-"}$
                {Math.abs(totalPnl).toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}
                )
              </span>
            </div>
            <div className="mt-2 text-sm text-gray-500 space-x-4">
              <span>
                Holdings: ${d.holdings_balance?.toLocaleString() ?? 0}
              </span>
              <span>Cash: ${d.cash_balance?.toLocaleString() ?? 0}</span>
            </div>
            {/* изменение за последние 24 часа */}
            <div className="mt-1 text-xs text-gray-500">
              24h:{" "}
              <span
                className={
                  dayChangePct >= 0 ? "text-green-600" : "text-red-600"
                }
              >
                {dayChangePct >= 0 ? "+" : ""}
                {dayChangePct.toFixed(2)}% (
                {dayChange >= 0 ? "+" : "-"}$
                {Math.abs(dayChange).toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}
                )
              </span>
            </div>
          </div>

          {/* Кнопки перехода */}
          <div className="flex gap-2">
            <button
              onClick={() => navigate("/trade")}
              className="px-4 py-2 rounded-2xl bg-indigo-900 text-white font-semibold text-sm"
            >
              Trade
            </button>
            <button
              onClick={() => navigate("/wallet")}
              className="px-4 py-2 rounded-2xl bg-gray-100 text-gray-800 font-semibold text-sm"
            >
              Add funds
            </button>
          </div>
        </div>
      </div>

      {/* Market Movers */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Market Movers</h2>
          <Link
            to="/market"
            className="text-sm text-blue-600 hover:underline"
          >
            More
          </Link>
        </div>

        {marketMovers.length === 0 ? (
          <div className="text-gray-500 text-sm">
            No market data available at the moment.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {marketMovers.slice(0, 4).map((asset, idx) => (
              <div
                key={asset.id}
                className={`rounded-3xl p-5 text-white shadow-lg cursor-pointer transition transform hover:scale-[1.01]
                ${
                  idx % 2 === 0
                    ? "bg-gradient-to-br from-pink-500 via-orange-400 to-green-300"
                    : "bg-gradient-to-br from-blue-500 via-indigo-500 to-green-300"
                }`}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold text-lg">
                    {asset.symbol?.[0] ?? "?"}
                  </div>
                  <div>
                    <p className="font-semibold">
                      {asset.symbol?.toUpperCase()}/USD
                    </p>
                    <p className="text-white/80 text-sm">{asset.name}</p>
                  </div>
                </div>

                <div className="flex items-baseline justify-between mb-1">
                  <p className="text-2xl font-bold">
                    $
                    {asset.current_price?.toLocaleString("en-US", {
                      maximumFractionDigits: 2,
                    })}
                  </p>
                  <p
                    className={
                      "text-sm font-semibold " +
                      (asset.change_24h_pct >= 0
                        ? "text-green-100"
                        : "text-red-100")
                    }
                  >
                    {asset.change_24h_pct >= 0 ? "+" : ""}
                    {asset.change_24h_pct.toFixed(2)}%
                  </p>
                </div>
                <p className="text-xs text-white/80 mt-2">
                  24h Vol. {asset.volume_24h?.toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Portfolio */}
      <section className="space-y-3 pb-10">
        <h2 className="text-xl font-bold text-gray-900">Portfolio</h2>

        {!d.portfolio || d.portfolio.length === 0 ? (
          <div className="bg-white rounded-3xl border border-dashed border-gray-200 p-6 text-sm text-gray-500">
            <div className="font-semibold text-gray-700">
              Purchased assets
            </div>
            <div className="mt-2">
              You have not purchased any crypto yet.
            </div>
            {d.last_updated && (
              <div className="mt-4 text-xs text-gray-400">
                Updated at{" "}
                {new Date(d.last_updated).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {d.portfolio.map((asset) => (
              <div
                key={asset.id}
                className="bg-white rounded-2xl p-4 flex items-center justify-between shadow-sm border border-gray-100"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-indigo-50 flex items-center justify-center font-semibold text-indigo-700">
                    {asset.symbol?.[0]}
                  </div>
                  <div>
                    <div className="font-semibold text-sm">{asset.name}</div>
                    <div className="text-xs text-gray-500">
                      {asset.symbol?.toUpperCase()} · {asset.quantity} pcs
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-sm">
                    ${asset.value?.toLocaleString()}
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
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}