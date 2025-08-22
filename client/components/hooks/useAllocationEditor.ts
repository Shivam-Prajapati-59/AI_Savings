import { useState, useEffect } from "react";
import { TokenAllocation, ValidationError } from "../../types";
import { validateAllocations } from "../../utils/validators";

export function useAllocationEditor(initialAmount: string) {
  const [allocations, setAllocations] = useState<TokenAllocation[]>([]);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>(
    []
  );

  // Update allocations when dependencies change
  useEffect(() => {
    if (isEditing && allocations.length > 0) {
      const errors = validateAllocations(
        allocations,
        parseFloat(initialAmount)
      );
      setValidationErrors(errors);
    }
  }, [allocations, isEditing, initialAmount]);

  // Initialize allocations from suggestion
  const initializeAllocations = (allocations: TokenAllocation[]) => {
    setAllocations([...allocations]);
    setIsEditing(false);
    setValidationErrors([]);
  };

  // Update a specific allocation
  const updateAllocation = (
    index: number,
    field: keyof TokenAllocation,
    value: string | number
  ) => {
    const updated = [...allocations];
    const amount = parseFloat(initialAmount);

    switch (field) {
      case "percentage":
        const newPercentage =
          typeof value === "string" ? parseFloat(value) || 0 : value;
        updated[index].percentage = Math.max(0, Math.min(100, newPercentage));
        updated[index].amount = (amount * newPercentage) / 100;
        break;
      case "amount":
        const newAmount =
          typeof value === "string" ? parseFloat(value) || 0 : value;
        updated[index].amount = Math.max(0, newAmount);
        updated[index].percentage = (newAmount / amount) * 100;
        break;
      case "token":
        updated[index].token = String(value).toUpperCase();
        break;
      case "tokenAddress":
        updated[index].tokenAddress = String(value);
        break;
    }

    setAllocations(updated);
  };

  // Add a new allocation
  const addAllocation = () => {
    const newAllocation: TokenAllocation = {
      token: "",
      percentage: 0,
      amount: 0,
      tokenAddress: "",
    };
    setAllocations([...allocations, newAllocation]);
  };

  // Remove an allocation
  const removeAllocation = (index: number) => {
    const updated = allocations.filter((_, i) => i !== index);
    setAllocations(updated);
  };

  // Normalize percentages to 100%
  const normalizePercentages = () => {
    const total = allocations.reduce((sum, alloc) => sum + alloc.percentage, 0);
    if (total === 0) return;

    const amount = parseFloat(initialAmount);
    const updated = allocations.map((alloc) => ({
      ...alloc,
      percentage: (alloc.percentage / total) * 100,
      amount: (amount * alloc.percentage) / total,
    }));
    setAllocations(updated);
  };

  return {
    allocations,
    isEditing,
    validationErrors,
    setIsEditing,
    initializeAllocations,
    updateAllocation,
    addAllocation,
    removeAllocation,
    normalizePercentages,
  };
}
