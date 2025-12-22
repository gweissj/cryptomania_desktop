import { useEffect, useState } from "react";
import { api } from "../api";
import { useNavigate } from "react-router-dom";

export default function Wallet() {
  const [data, setData] = useState(null);
  const [amount, setAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

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

  const handleWithdraw = async () => {
    if (!withdrawAmount) return;
    setWithdrawing(true);
    setError("");
    try {
      const res = await api.withdraw(withdrawAmount);
      setData(res);
      setWithdrawAmount("");
    } catch (e) {
      setError(e.message || "Withdraw failed");
    } finally {
      setWithdrawing(false);
    }
  };

  if (!data) {
    return <div className="p-8 text-gray-500">Loading wallet…</div>;
  }

  const totalPnl = Number(data.total_pnl ?? 0);
  const totalPnlPct = Number(data.total_pnl_pct ?? 0);
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

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h3 className="font-semibold text-gray-800">Withdraw USD</h3>
        <div className="flex flex-col sm:flex-row gap-3 max-w-md">
          <input
            type="number"
            min="1"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
            placeholder="Amount"
            className="flex-1 p-3 rounded-2xl bg-gray-50 border border-gray-200 outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleWithdraw}
            disabled={withdrawing || !withdrawAmount}
            className="px-6 py-3 rounded-2xl bg-red-600 text-white font-semibold disabled:opacity-50"
          >
            {withdrawing ? "..." : "Withdraw"}
          </button>
        </div>
      </div>

      <div className="space-y-3 pb-10">
        <h3 className="font-semibold text-gray-800">Holdings</h3>
        {data.portfolio.length === 0 ? (
          <p className="text-sm text-gray-500">
            You have no assets yet. Use Trade page to buy crypto.
          </p>
        ) : (
          data.portfolio.map((asset) => {
            const pnl = Number(asset.pnl ?? 0);
            const pnlPct = Number(asset.pnl_pct ?? 0);
            const pnlClass =
              pnlPct >= 0 ? "text-green-500" : "text-red-500";

            return (
              <button
                key={asset.id}
                onClick={() =>
                  navigate("/trade", { state: { assetId: asset.id } })
                }
                className="w-full bg-white rounded-2xl p-4 flex items-center justify-between shadow-sm border border-gray-100 hover:bg-gray-50 text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-indigo-50 flex items-center justify-center font-semibold text-indigo-700">
                    {asset.symbol?.[0]}
                  </div>
                  <div>
                    <div className="font-semibold text-sm">
                      {asset.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {asset.symbol?.toUpperCase()} · {asset.quantity} pcs
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">
                    ${asset.value?.toLocaleString()}
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
          })
        )}
      </div>
    </div>
  );
}