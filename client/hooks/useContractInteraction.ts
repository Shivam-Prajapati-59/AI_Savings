import { useState } from "react";

interface TokenAllocation {
  token: string;
  percentage: number;
  amount: number;
  tokenAddress: string;
}

interface ContractResult {
  transactionHash?: string;
  error?: string;
}

export const useContractInteraction = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ContractResult | null>(null);

  const sendAllocationsToContract = async (
    allocations: TokenAllocation[],
    totalAmount: number,
    baseToken: string
  ) => {
    setLoading(true);
    setResult(null);

    try {
      // Call the correct API route path
      const response = await fetch("/api/contract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          allocations,
          totalAmount,
          baseToken,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setResult({
          transactionHash: data.data.transactionHash,
        });

        return {
          success: true,
          transactionHash: data.data.transactionHash,
        };
      } else {
        setResult({
          error: data.error,
        });

        throw new Error(data.error);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";

      setResult({
        error: errorMessage,
      });

      throw error;
    } finally {
      setLoading(false);
    }
  };

  return {
    sendAllocationsToContract,
    loading,
    result,
  };
};
