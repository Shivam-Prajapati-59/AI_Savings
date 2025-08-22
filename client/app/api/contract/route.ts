import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";

interface TokenAllocation {
  token: string;
  percentage: number;
  amount: number;
  tokenAddress: string;
}

interface ContractAllocationRequest {
  allocations: TokenAllocation[];
  totalAmount: number;
  baseToken: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: ContractAllocationRequest = await req.json();

    // Validate input
    if (!body.allocations || !Array.isArray(body.allocations)) {
      return NextResponse.json(
        { success: false, error: "Invalid allocations array" },
        { status: 400 }
      );
    }

    if (!body.totalAmount || body.totalAmount <= 0) {
      return NextResponse.json(
        { success: false, error: "Invalid total amount" },
        { status: 400 }
      );
    }

    // Set up blockchain connection
    const provider = new ethers.JsonRpcProvider(
      process.env.RPC_URL || "http://localhost:8545"
    );
    const privateKey = process.env.PRIVATE_KEY;

    if (!privateKey) {
      return NextResponse.json(
        { success: false, error: "Private key not configured" },
        { status: 500 }
      );
    }

    const wallet = new ethers.Wallet(privateKey, provider);
    const BASKET_STRATEGY_ADDRESS = process.env.BASKET_STRATEGY_ADDRESS;

    if (!BASKET_STRATEGY_ADDRESS) {
      return NextResponse.json(
        { success: false, error: "Contract addresses not configured" },
        { status: 500 }
      );
    }

    // Contract ABI
    const basketStrategyABI = [
      "function setAllocations((address token, uint256 percentage)[] memory newAllocations) external",
      "function totalAssets() external view returns (uint256)",
      "function getAllocations() external view returns ((address token, uint256 percentage)[] memory)",
    ];

    const basketStrategy = new ethers.Contract(
      BASKET_STRATEGY_ADDRESS,
      basketStrategyABI,
      wallet
    );

    // Convert allocations to contract format
    const contractAllocations = body.allocations.map((allocation) => ({
      token: allocation.tokenAddress,
      percentage: Math.floor(allocation.percentage * 100), // Convert to basis points
    }));

    // Send transaction to contract
    const tx = await basketStrategy.setAllocations(contractAllocations);
    await tx.wait();

    return NextResponse.json({
      success: true,
      data: {
        transactionHash: tx.hash,
        allocations: contractAllocations,
        totalAmount: body.totalAmount,
      },
    });
  } catch (error) {
    console.error("Contract interaction error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 }
    );
  }
}
