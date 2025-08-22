"use client";

import { useState, useEffect } from "react";
import { useContractInteraction } from "@/hooks/useContractInteraction";

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

// Enhanced validation types
interface ValidationError {
  index: number;
  field: string;
  message: string;
}

interface TokenInfo {
  symbol: string;
  name: string;
  decimals: number;
  isValid: boolean;
}

export default function AISuggestionForm() {
  const [amount, setAmount] = useState<string>("");
  const [baseToken, setBaseToken] = useState<string>("USDT");
  const [loading, setLoading] = useState<boolean>(false);
  const [suggestion, setSuggestion] = useState<InvestmentAdvice | null>(null);
  const [error, setError] = useState<string>("");

  // Enhanced state management
  const [editableAllocations, setEditableAllocations] = useState<
    TokenAllocation[]
  >([]);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>(
    []
  );
  const [tokenValidation, setTokenValidation] = useState<
    Record<number, TokenInfo>
  >({});
  const [isValidating, setIsValidating] = useState<Record<number, boolean>>({});

  const {
    sendAllocationsToContract,
    loading: contractLoading,
    result: contractResult,
  } = useContractInteraction();

  // Token validation function
  const validateTokenAddress = async (address: string, index: number) => {
    if (!address || address.length !== 42 || !address.startsWith("0x")) {
      setTokenValidation((prev) => ({
        ...prev,
        [index]: { symbol: "", name: "", decimals: 0, isValid: false },
      }));
      return;
    }

    setIsValidating((prev) => ({ ...prev, [index]: true }));

    try {
      // Mock token validation - replace with actual blockchain call
      const mockTokens: Record<string, TokenInfo> = {
        "0xdAC17F958D2ee523a2206206994597C13D831ec7": {
          symbol: "USDT",
          name: "Tether USD",
          decimals: 6,
          isValid: true,
        },
        "0xA0b86a33E6441fb0fb5c8dc0E0EF79b2AD1b8B1": {
          symbol: "USDC",
          name: "USD Coin",
          decimals: 6,
          isValid: true,
        },
        "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2": {
          symbol: "WETH",
          name: "Wrapped Ether",
          decimals: 18,
          isValid: true,
        },
      };

      // Simulate API delay
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const tokenInfo = mockTokens[address] || {
        symbol: "UNKNOWN",
        name: "Unknown Token",
        decimals: 18,
        isValid: false,
      };

      setTokenValidation((prev) => ({
        ...prev,
        [index]: tokenInfo,
      }));
    } catch (error) {
      setTokenValidation((prev) => ({
        ...prev,
        [index]: { symbol: "", name: "", decimals: 0, isValid: false },
      }));
    } finally {
      setIsValidating((prev) => ({ ...prev, [index]: false }));
    }
  };

  // Enhanced validation
  const validateAllocations = (): ValidationError[] => {
    const errors: ValidationError[] = [];
    let totalPercentage = 0;

    editableAllocations.forEach((allocation, index) => {
      // Token name validation
      if (!allocation.token.trim()) {
        errors.push({
          index,
          field: "token",
          message: "Token name is required",
        });
      }

      // Percentage validation
      if (allocation.percentage <= 0) {
        errors.push({
          index,
          field: "percentage",
          message: "Percentage must be greater than 0",
        });
      } else if (allocation.percentage > 100) {
        errors.push({
          index,
          field: "percentage",
          message: "Percentage cannot exceed 100%",
        });
      }

      // Token address validation
      if (!allocation.tokenAddress.trim()) {
        errors.push({
          index,
          field: "tokenAddress",
          message: "Token address is required",
        });
      } else if (!/^0x[a-fA-F0-9]{40}$/.test(allocation.tokenAddress)) {
        errors.push({
          index,
          field: "tokenAddress",
          message: "Invalid Ethereum address format",
        });
      } else if (tokenValidation[index] && !tokenValidation[index].isValid) {
        errors.push({
          index,
          field: "tokenAddress",
          message: "Token address not found or invalid",
        });
      }

      // Token symbol mismatch
      if (tokenValidation[index] && tokenValidation[index].isValid) {
        if (
          allocation.token.toUpperCase() !==
          tokenValidation[index].symbol.toUpperCase()
        ) {
          errors.push({
            index,
            field: "token",
            message: `Token symbol mismatch. Expected: ${tokenValidation[index].symbol}`,
          });
        }
      }

      totalPercentage += allocation.percentage;
    });

    // Total percentage validation
    if (Math.abs(totalPercentage - 100) > 0.01) {
      errors.push({
        index: -1,
        field: "total",
        message: `Total percentage is ${totalPercentage.toFixed(
          2
        )}%. Must equal 100%`,
      });
    }

    return errors;
  };

  // Validate on allocation changes
  useEffect(() => {
    if (isEditing && editableAllocations.length > 0) {
      const errors = validateAllocations();
      setValidationErrors(errors);
    }
  }, [editableAllocations, tokenValidation, isEditing]);

  // Validate token address on change
  useEffect(() => {
    editableAllocations.forEach((allocation, index) => {
      if (allocation.tokenAddress && allocation.tokenAddress.length === 42) {
        validateTokenAddress(allocation.tokenAddress, index);
      }
    });
  }, [editableAllocations.map((a) => a.tokenAddress).join(",")]);

  // Get AI recommendation
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuggestion(null);
    setEditableAllocations([]);
    setIsEditing(false);
    setValidationErrors([]);
    setTokenValidation({});

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
        if ("error" in data.data) {
          setError(`AI Response Error: ${data.data.error}`);
        } else {
          setSuggestion(data.data);
          setEditableAllocations([...data.data.allocations]);
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

  // Enhanced update allocation with validation
  const updateAllocation = (
    index: number,
    field: keyof TokenAllocation,
    value: string | number
  ) => {
    const updated = [...editableAllocations];

    switch (field) {
      case "percentage":
        const newPercentage =
          typeof value === "string" ? parseFloat(value) || 0 : value;
        updated[index].percentage = Math.max(0, Math.min(100, newPercentage));
        updated[index].amount = (parseFloat(amount) * newPercentage) / 100;
        break;
      case "amount":
        const newAmount =
          typeof value === "string" ? parseFloat(value) || 0 : value;
        updated[index].amount = Math.max(0, newAmount);
        updated[index].percentage = (newAmount / parseFloat(amount)) * 100;
        break;
      case "token":
        updated[index].token = String(value).toUpperCase();
        break;
      case "tokenAddress":
        updated[index].tokenAddress = String(value);
        break;
    }

    setEditableAllocations(updated);
  };

  // Add new allocation
  const addAllocation = () => {
    const newAllocation: TokenAllocation = {
      token: "",
      percentage: 0,
      amount: 0,
      tokenAddress: "",
    };
    setEditableAllocations([...editableAllocations, newAllocation]);
  };

  // Remove allocation
  const removeAllocation = (index: number) => {
    const updated = editableAllocations.filter((_, i) => i !== index);
    setEditableAllocations(updated);

    // Clean up validation states
    const newTokenValidation = { ...tokenValidation };
    const newIsValidating = { ...isValidating };
    delete newTokenValidation[index];
    delete newIsValidating[index];
    setTokenValidation(newTokenValidation);
    setIsValidating(newIsValidating);
  };

  // Normalize percentages to 100%
  const normalizePercentages = () => {
    const total = editableAllocations.reduce(
      (sum, alloc) => sum + alloc.percentage,
      0
    );
    if (total === 0) return;

    const updated = editableAllocations.map((alloc) => ({
      ...alloc,
      percentage: (alloc.percentage / total) * 100,
      amount: (parseFloat(amount) * alloc.percentage) / total,
    }));
    setEditableAllocations(updated);
  };

  // Enhanced send to contract with validation
  const handleSendToContract = async () => {
    const errors = validateAllocations();
    if (errors.length > 0) {
      setError("Please fix all validation errors before sending to contract");
      return;
    }

    try {
      await sendAllocationsToContract(
        editableAllocations,
        parseFloat(amount),
        baseToken
      );
    } catch (error) {
      console.error("Failed to send to contract:", error);
    }
  };

  // Helper function to get error for field
  const getFieldError = (index: number, field: string): string | null => {
    const error = validationErrors.find(
      (e) => e.index === index && e.field === field
    );
    return error ? error.message : null;
  };

  // Helper function to get total error
  const getTotalError = (): string | null => {
    const error = validationErrors.find(
      (e) => e.index === -1 && e.field === "total"
    );
    return error ? error.message : null;
  };

  const commonTokens = ["USDT", "USDC", "ETH", "BTC", "BNB", "MATIC"];

  return (
    <div className="max-w-6xl mx-auto p-6 bg-gradient-to-br from-blue-50 to-indigo-100 min-h-screen">
      <div className="bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            AI Investment Advisor
          </h1>
          <p className="text-gray-600 mt-2">
            Get personalized portfolio recommendations powered by AI
          </p>
        </div>

        {/* Enhanced AI Input Form */}
        <form onSubmit={handleSubmit} className="space-y-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label
                htmlFor="amount"
                className="block text-sm font-semibold text-gray-700"
              >
                Investment Amount
              </label>
              <div className="relative">
                <input
                  type="number"
                  id="amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black transition-colors"
                  required
                  min="1"
                  step="0.01"
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <span className="text-gray-500 text-sm">{baseToken}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="baseToken"
                className="block text-sm font-semibold text-gray-700"
              >
                Base Token
              </label>
              <select
                id="baseToken"
                value={baseToken}
                onChange={(e) => setBaseToken(e.target.value)}
                className="w-full p-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black transition-colors"
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
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-4 px-8 rounded-xl hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-semibold shadow-lg"
          >
            {loading ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Getting AI Recommendation...
              </div>
            ) : (
              "🤖 Get AI Investment Advice"
            )}
          </button>
        </form>

        {/* Enhanced Error Display */}
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-4 mb-6">
            <div className="flex items-center">
              <div className="text-red-500 mr-2">⚠️</div>
              <p className="text-red-800 font-medium">{error}</p>
            </div>
          </div>
        )}

        {/* Enhanced AI Suggestion & Editable Allocations */}
        {suggestion && (
          <div className="space-y-6">
            {/* AI Recommendation Header */}
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-green-800 mb-2 flex items-center">
                    <span className="mr-2">✨</span>
                    AI Investment Recommendation
                  </h3>
                  <p className="text-green-700">
                    Estimated Total Value:{" "}
                    <span className="font-bold text-lg">
                      {suggestion.estimatedValue.toLocaleString()} {baseToken}
                    </span>
                  </p>
                </div>
                <div className="text-right">
                  <div className="bg-green-100 text-green-800 px-4 py-2 rounded-full text-sm font-semibold">
                    {editableAllocations.length} Assets
                  </div>
                </div>
              </div>
            </div>

            {/* Enhanced Edit Mode Toggle */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h4 className="text-xl font-bold text-gray-800 flex items-center">
                <span className="mr-2">📊</span>
                Portfolio Allocation
              </h4>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                    isEditing
                      ? "bg-gray-600 hover:bg-gray-700 text-white"
                      : "bg-blue-600 hover:bg-blue-700 text-white"
                  }`}
                >
                  {isEditing ? "👁️ View Mode" : "✏️ Edit Mode"}
                </button>
                {isEditing && (
                  <button
                    onClick={normalizePercentages}
                    className="px-6 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 font-medium transition-colors"
                  >
                    📐 Normalize to 100%
                  </button>
                )}
              </div>
            </div>

            {/* Validation Summary */}
            {isEditing && validationErrors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <h5 className="text-red-800 font-semibold mb-2 flex items-center">
                  <span className="mr-2">⚠️</span>
                  Validation Errors ({validationErrors.length})
                </h5>
                <div className="space-y-1">
                  {getTotalError() && (
                    <p className="text-red-700 text-sm">• {getTotalError()}</p>
                  )}
                  {validationErrors
                    .filter((e) => e.index !== -1)
                    .map((error, idx) => (
                      <p key={idx} className="text-red-700 text-sm">
                        • Row {error.index + 1}: {error.message}
                      </p>
                    ))}
                </div>
              </div>
            )}

            {/* Enhanced Editable Allocations */}
            <div className="bg-gray-50 rounded-xl p-6">
              {isEditing ? (
                <div className="space-y-4">
                  {/* Header */}
                  <div className="grid grid-cols-12 gap-4 text-sm font-semibold text-gray-600 px-2">
                    <div className="col-span-2">Token</div>
                    <div className="col-span-2">Percentage</div>
                    <div className="col-span-2">Amount</div>
                    <div className="col-span-4">Token Address</div>
                    <div className="col-span-1">Status</div>
                    <div className="col-span-1">Action</div>
                  </div>

                  {editableAllocations.map((allocation, index) => (
                    <div
                      key={index}
                      className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm"
                    >
                      <div className="grid grid-cols-12 gap-4 items-start">
                        {/* Token Name */}
                        <div className="col-span-2">
                          <input
                            type="text"
                            placeholder="e.g., USDT"
                            value={allocation.token}
                            onChange={(e) =>
                              updateAllocation(index, "token", e.target.value)
                            }
                            className={`w-full p-2 border rounded-lg text-black text-sm ${
                              getFieldError(index, "token")
                                ? "border-red-300 bg-red-50"
                                : "border-gray-300"
                            }`}
                          />
                          {getFieldError(index, "token") && (
                            <p className="text-red-600 text-xs mt-1">
                              {getFieldError(index, "token")}
                            </p>
                          )}
                        </div>

                        {/* Percentage */}
                        <div className="col-span-2">
                          <input
                            type="number"
                            placeholder="0.00"
                            value={allocation.percentage}
                            onChange={(e) =>
                              updateAllocation(
                                index,
                                "percentage",
                                e.target.value
                              )
                            }
                            className={`w-full p-2 border rounded-lg text-black text-sm ${
                              getFieldError(index, "percentage")
                                ? "border-red-300 bg-red-50"
                                : "border-gray-300"
                            }`}
                            step="0.01"
                            min="0"
                            max="100"
                          />
                          {getFieldError(index, "percentage") && (
                            <p className="text-red-600 text-xs mt-1">
                              {getFieldError(index, "percentage")}
                            </p>
                          )}
                        </div>

                        {/* Amount (readonly) */}
                        <div className="col-span-2">
                          <input
                            type="number"
                            value={allocation.amount.toFixed(2)}
                            readOnly
                            className="w-full p-2 border rounded-lg bg-gray-100 text-gray-600 text-sm"
                          />
                        </div>

                        {/* Token Address */}
                        <div className="col-span-4">
                          <input
                            type="text"
                            placeholder="0x..."
                            value={allocation.tokenAddress}
                            onChange={(e) =>
                              updateAllocation(
                                index,
                                "tokenAddress",
                                e.target.value
                              )
                            }
                            className={`w-full p-2 border rounded-lg text-black text-xs ${
                              getFieldError(index, "tokenAddress")
                                ? "border-red-300 bg-red-50"
                                : "border-gray-300"
                            }`}
                          />
                          {getFieldError(index, "tokenAddress") && (
                            <p className="text-red-600 text-xs mt-1">
                              {getFieldError(index, "tokenAddress")}
                            </p>
                          )}
                          {tokenValidation[index] &&
                            tokenValidation[index].isValid && (
                              <p className="text-green-600 text-xs mt-1">
                                ✅ {tokenValidation[index].name}
                              </p>
                            )}
                        </div>

                        {/* Validation Status */}
                        <div className="col-span-1 flex justify-center">
                          {isValidating[index] ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                          ) : tokenValidation[index] ? (
                            tokenValidation[index].isValid ? (
                              <span className="text-green-500 text-lg">✅</span>
                            ) : (
                              <span className="text-red-500 text-lg">❌</span>
                            )
                          ) : null}
                        </div>

                        {/* Remove Button */}
                        <div className="col-span-1">
                          <button
                            onClick={() => removeAllocation(index)}
                            className="w-full px-2 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm transition-colors"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  <button
                    onClick={addAllocation}
                    className="w-full p-4 bg-green-600 text-white rounded-xl hover:bg-green-700 font-medium transition-colors flex items-center justify-center"
                  >
                    <span className="mr-2">➕</span>
                    Add New Allocation
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {editableAllocations.map((allocation, index) => (
                    <div
                      key={index}
                      className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-bold text-gray-800 text-lg">
                          {allocation.token}
                        </span>
                        <span className="text-sm bg-gradient-to-r from-blue-100 to-purple-100 text-blue-800 px-3 py-1 rounded-full font-semibold">
                          {allocation.percentage.toFixed(2)}%
                        </span>
                      </div>
                      <p className="text-2xl font-bold text-gray-900 mb-2">
                        {allocation.amount.toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}{" "}
                        {baseToken}
                      </p>
                      <div className="space-y-1">
                        <p className="text-xs text-gray-500 break-all font-mono bg-gray-50 p-2 rounded">
                          {allocation.tokenAddress}
                        </p>
                        {tokenValidation[index] && (
                          <p
                            className={`text-xs font-medium ${
                              tokenValidation[index].isValid
                                ? "text-green-600"
                                : "text-red-600"
                            }`}
                          >
                            {tokenValidation[index].isValid
                              ? "✅ Verified"
                              : "❌ Invalid"}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Enhanced Send to Contract */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                <div>
                  <h4 className="text-lg font-bold text-blue-800 flex items-center">
                    <span className="mr-2">🚀</span>
                    Deploy to Smart Contract
                  </h4>
                  <p className="text-blue-600 text-sm mt-1">
                    Execute your portfolio allocation on the blockchain
                  </p>
                </div>
                <button
                  onClick={handleSendToContract}
                  disabled={
                    contractLoading ||
                    editableAllocations.length === 0 ||
                    validationErrors.length > 0
                  }
                  className="px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all duration-200 shadow-lg"
                >
                  {contractLoading ? (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Sending...
                    </div>
                  ) : (
                    "Deploy Portfolio"
                  )}
                </button>
              </div>

              {contractResult && (
                <div className="mt-4 p-4 rounded-lg border">
                  {contractResult.transactionHash ? (
                    <div className="text-green-600">
                      <p className="font-semibold flex items-center">
                        <span className="mr-2">🎉</span>
                        Successfully deployed to contract!
                      </p>
                      <p className="text-sm mt-1 font-mono bg-green-50 p-2 rounded break-all">
                        Transaction: {contractResult.transactionHash}
                      </p>
                    </div>
                  ) : (
                    <div className="text-red-600">
                      <p className="font-semibold flex items-center">
                        <span className="mr-2">❌</span>
                        Failed to deploy to contract
                      </p>
                      <p className="text-sm mt-1">{contractResult.error}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Enhanced AI Reasoning */}
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-xl p-6">
              <h4 className="text-lg font-bold text-purple-800 mb-3 flex items-center">
                <span className="mr-2">🧠</span>
                AI Analysis & Reasoning
              </h4>
              <div className="prose prose-purple max-w-none">
                <p className="text-purple-700 whitespace-pre-wrap leading-relaxed">
                  {suggestion.reasons}
                </p>
              </div>
            </div>

            {/* Enhanced Warnings */}
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-6">
              <h4 className="text-lg font-bold text-amber-800 mb-3 flex items-center">
                <span className="mr-2">⚠️</span>
                Risk Assessment & Warnings
              </h4>
              <div className="prose prose-amber max-w-none">
                <p className="text-amber-700 whitespace-pre-wrap leading-relaxed">
                  {suggestion.warnings}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
