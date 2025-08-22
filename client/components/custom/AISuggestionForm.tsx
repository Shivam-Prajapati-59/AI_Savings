"use client";

import { useState } from "react";

// Type definitions matching the API
interface TokenAllocation {
  token: string;
  percentage: number;
  amount: number;
  tokenAddress: string;
}

interface InvestmentAdvice {
  allocations: TokenAllocation[];
  reasons: string;
  estimatedValue: number;
  warnings: string;
}

interface APIResponse {
  success: boolean;
  data?: InvestmentAdvice | { error: string; raw: string };
  error?: string;
}

export default function AISuggestionForm() {
  const [amount, setAmount] = useState<string>("");
  const [baseToken, setBaseToken] = useState<string>("USDT");
  const [loading, setLoading] = useState<boolean>(false);
  const [suggestion, setSuggestion] = useState<InvestmentAdvice | null>(null);
  const [error, setError] = useState<string>("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuggestion(null);

    try {
      const response = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: parseFloat(amount),
          baseToken: baseToken.trim(),
        }),
      });

      const data: APIResponse = await response.json();

      if (data.success && data.data) {
        // Check if it's an error response or valid advice
        if ("error" in data.data) {
          setError(`AI Response Error: ${data.data.error}`);
        } else {
          setSuggestion(data.data);
        }
      } else {
        setError(data.error || "Failed to get AI suggestion");
      }
    } catch (err) {
      setError("Network error. Please try again.");
      console.error("Error fetching AI suggestion:", err);
    } finally {
      setLoading(false);
    }
  };

  const commonTokens = ["USDT", "USDC", "ETH", "BTC", "BNB", "MATIC"];

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">
        AI Investment Advisor
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="amount"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Investment Amount
            </label>
            <input
              type="number"
              id="amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount to invest"
              min="0"
              step="0.01"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
            />
          </div>

          <div>
            <label
              htmlFor="baseToken"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Base Token
            </label>
            <select
              id="baseToken"
              value={baseToken}
              onChange={(e) => setBaseToken(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
            >
              {commonTokens.map((token) => (
                <option key={token} value={token}>
                  {token}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !amount}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <span className="flex items-center justify-center">
              <svg
                className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Getting AI Suggestion...
            </span>
          ) : (
            "Get AI Investment Advice"
          )}
        </button>
      </form>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-red-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* AI Suggestion Display */}
      {suggestion && (
        <div className="space-y-6">
          <div className="bg-green-50 border border-green-200 rounded-md p-4">
            <h3 className="text-lg font-semibold text-green-800 mb-2">
              AI Investment Recommendation
            </h3>
            <p className="text-sm text-green-700">
              Estimated Total Value:{" "}
              <span className="font-bold">
                {suggestion.estimatedValue} {baseToken}
              </span>
            </p>
          </div>

          {/* Token Allocations */}
          <div className="bg-gray-50 rounded-lg p-6">
            <h4 className="text-lg font-semibold text-gray-800 mb-4">
              Recommended Portfolio Allocation
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {suggestion.allocations.map((allocation, index) => (
                <div
                  key={index}
                  className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-gray-800">
                      {allocation.token}
                    </span>
                    <span className="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                      {allocation.percentage}%
                    </span>
                  </div>
                  <p className="text-lg font-bold text-gray-900 mb-1">
                    {allocation.amount} {baseToken}
                  </p>
                  <p className="text-xs text-gray-500 break-all">
                    {allocation.tokenAddress}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Reasons */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <h4 className="text-lg font-semibold text-blue-800 mb-2">
              Investment Rationale
            </h4>
            <p className="text-blue-700 leading-relaxed">
              {suggestion.reasons}
            </p>
          </div>

          {/* Warnings */}
          {suggestion.warnings && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-yellow-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <h4 className="text-sm font-medium text-yellow-800">
                    Important Warnings
                  </h4>
                  <p className="text-sm text-yellow-700 mt-1">
                    {suggestion.warnings}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
