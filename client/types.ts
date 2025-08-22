// Define common types used across the application

export interface TokenAllocation {
  token: string;
  percentage: number;
  amount: number;
  tokenAddress: string;
}

export interface ValidationError {
  index: number;
  field: string;
  message: string;
}

export interface InvestmentAdvice {
  allocations: TokenAllocation[];
  reasons: string;
  estimatedValue: number;
  warnings: string;
}

export interface TokenInfo {
  symbol: string;
  name: string;
  decimals: number;
  isValid: boolean;
}

export interface APIResponse {
  success: boolean;
  data?: InvestmentAdvice | { error: string; raw: string };
  error?: string;
}
