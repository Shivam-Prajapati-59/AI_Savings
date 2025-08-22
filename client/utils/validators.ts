import { TokenAllocation, ValidationError } from "../types";

export function validateAllocations(
  allocations: TokenAllocation[],
  totalAmount: number
): ValidationError[] {
  const errors: ValidationError[] = [];
  let totalPercentage = 0;

  allocations.forEach((allocation, index) => {
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
}
