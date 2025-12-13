// src/pages/Wallet.jsx
import { useEffect, useState } from "react";
import { api } from "../api";

export default function Wallet() {
  const [data, setData] = useState(null);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setError("");
    try {
      const res = await api.getPortfolio();
      setData(res);
    } catch (e) {
      setError(e.message || "Failed to load wallet");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleDeposit = async () => {
    if (!amount) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.deposit(amount);
      setData(res);
      setAmount("");
    } catch (e) {
      setError(e.message || "Deposit failed");
    } finally {
      setLoading(false);
    }
  };

  if (!data) {
    return <div className="p-8 text-gray-500">Loading wallet…</div>;
  }

  const totalPnl = Number(data.total_pnl ?? 0);
  const totalPnlPct = Number(data.total_pnl_pct ?? 0);
  const dayChange = Number(data.day_change ?? 0);
  const dayChangePct = Number(data.day_change_pct ?? 0);

  const pnlChipClass =
    totalPnlPct >= 0
      ? "bg-green-100 text-green-700"
      : "bg-red-100 text-red-700";

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Wallet</h1>
        {error && (
          <span className="text-sm text-red-600 bg-red-50 px-2 py-1 rounded-xl">
            {error}
          </span>
        )}
      </div>

      {/* Баланс */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <p className="text-gray-500">Portfolio Balance</p>
          <h2 className="text-4xl font-bold mt-1">
            $
            {data.total_balance?.toLocaleString(undefined, {
              maximumFractionDigits: 2,
              minimumFractionDigits: 2,
            })}
          </h2>
          <p className="text-sm text-gray-500 mt-2">
            Holdings: ${data.holdings_balance?.toLocaleString()} · Cash: $
            {data.cash_balance?.toLocaleString()}
          </p>
          <p className="text-xs text-gray-500 mt-1">
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
          </p>
        </div>
        <div
          className={
            "px-3 py-1 rounded-full text-sm font-semibold self-start " +
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
        </div>
      </div>

      {/* Депозит */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h3 className="font-semibold text-gray-800">Deposit USD</h3>
        <div className="flex flex-col sm:flex-row gap-3 max-w-md">
          <input
            type="number"
            min="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
            className="flex-1 p-3 rounded-2xl bg-gray-50 border border-gray-200 outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleDeposit}
            disabled={loading || !amount}
            className="px-6 py-3 rounded-2xl bg-indigo-900 text-white font-semibold disabled:opacity-50"
          >
            {loading ? "..." : "Deposit"}
          </button>
        </div>
      </div>

      {/* Holdings */}
      <div className="space-y-3 pb-10">
        <h3 className="font-semibold text-gray-800">Holdings</h3>
        {data.portfolio.length === 0 ? (
          <p className="text-sm text-gray-500">
            You have no assets yet. Use Trade page to buy crypto.
          </p>
        ) : (
          data.portfolio.map((asset) => (
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
                <div className="font-semibold">
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
          ))
        )}
      </div>
    </div>
  );
}