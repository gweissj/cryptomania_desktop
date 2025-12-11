import { useState } from "react";
import { api } from "../api";

export default function SellModal({ asset, onClose }) {
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("usd"); // 'usd' or 'quantity'
  const [source, setSource] = useState("coincap");
  const [previewData, setPreviewData] = useState(null);
  const [step, setStep] = useState("input"); // 'input', 'preview', 'result'
  const [error, setError] = useState(null);
  const [resultMsg, setResultMsg] = useState("");

  const handlePreview = async () => {
    setError(null);
    try {
      const payload = {
        asset_id: asset.id,
        source,
        [mode === "usd" ? "amount_usd" : "quantity"]: amount
      };
      const data = await api.previewSell(payload);
      setPreviewData(data);
      setStep("preview");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleExecute = async () => {
    try {
      const payload = {
        asset_id: asset.id,
        source,
        [mode === "usd" ? "amount_usd" : "quantity"]: amount
      };
      const result = await api.executeSell(payload);
      setResultMsg(`Successfully sold ${result.quantity} ${result.symbol} for $${result.received}`);
      setStep("result");
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl w-full max-w-md p-6 relative">
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 font-bold"
        >
          ✕
        </button>

        <h2 className="text-xl font-bold mb-4">Sell {asset.symbol}</h2>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-xl mb-4 text-sm">
            {error}
          </div>
        )}

        {step === "input" && (
          <div className="space-y-4">
            {/* Выбор источника (как на скрине) */}
            <div className="space-y-2">
              <label className={`block p-3 border rounded-xl cursor-pointer ${source === 'coincap' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                <input 
                  type="radio" 
                  name="source" 
                  className="hidden" 
                  checked={source === 'coincap'} 
                  onChange={() => setSource('coincap')} 
                />
                <div className="flex justify-between">
                  <span className="font-bold">COINCAP</span>
                  {source === 'coincap' && <span className="text-blue-500">✔</span>}
                </div>
                <div className="text-sm text-gray-500">Fast execution</div>
              </label>
              
              <label className={`block p-3 border rounded-xl cursor-pointer ${source === 'coingecko' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                <input 
                  type="radio" 
                  name="source" 
                  className="hidden" 
                  checked={source === 'coingecko'} 
                  onChange={() => setSource('coingecko')} 
                />
                <div className="flex justify-between">
                  <span className="font-bold">COINGECKO</span>
                  {source === 'coingecko' && <span className="text-blue-500">✔</span>}
                </div>
                <div className="text-sm text-gray-500">Alternative price source</div>
              </label>
            </div>

            {/* Ввод суммы */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
                {mode === "usd" ? "$" : "QTY"}
              </div>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={mode === "usd" ? "Amount in USD" : "Quantity"}
                className="w-full p-4 pl-12 bg-gray-50 border-none rounded-2xl text-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            
            <div className="flex gap-2 text-sm justify-center">
                <button onClick={() => setMode('usd')} className={`px-3 py-1 rounded-full ${mode === 'usd' ? 'bg-gray-800 text-white' : 'bg-gray-200'}`}>USD</button>
                <button onClick={() => setMode('quantity')} className={`px-3 py-1 rounded-full ${mode === 'quantity' ? 'bg-gray-800 text-white' : 'bg-gray-200'}`}>Quantity</button>
            </div>

            <button
              onClick={handlePreview}
              disabled={!amount}
              className="w-full bg-indigo-900 text-white py-4 rounded-2xl font-bold mt-4 disabled:opacity-50"
            >
              Preview Sell
            </button>
          </div>
        )}

        {step === "preview" && previewData && (
          <div className="space-y-4">
             <div className="bg-gray-50 p-4 rounded-xl space-y-2">
                <div className="flex justify-between">
                    <span className="text-gray-500">Selling</span>
                    <span className="font-bold">{previewData.quantity} {previewData.symbol}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-500">Unit Price</span>
                    <span className="font-bold">${previewData.unit_price}</span>
                </div>
                <div className="border-t border-gray-200 my-2 pt-2 flex justify-between text-lg">
                    <span>You receive</span>
                    <span className="font-bold text-green-600">${previewData.proceeds}</span>
                </div>
             </div>
             <div className="flex gap-3">
                 <button onClick={() => setStep("input")} className="flex-1 py-3 bg-gray-100 rounded-xl font-semibold">Back</button>
                 <button onClick={handleExecute} className="flex-1 py-3 bg-indigo-900 text-white rounded-xl font-bold">Confirm Sell</button>
             </div>
          </div>
        )}

        {step === "result" && (
            <div className="text-center space-y-4 py-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto text-green-600 text-2xl">✓</div>
                <h3 className="text-xl font-bold">Success!</h3>
                <p className="text-gray-600">{resultMsg}</p>
                <button onClick={onClose} className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold">Done</button>
            </div>
        )}
      </div>
    </div>
  );
}