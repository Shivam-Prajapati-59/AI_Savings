import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

// Type definitions
interface RequestBody {
  amount: number;
  baseToken: string;
}

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

// POST handler for getting investment advice from Gemini
export async function POST(
  req: NextRequest
): Promise<NextResponse<APIResponse>> {
  try {
    // Validate environment variable
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "GEMINI_API_KEY is not configured" },
        { status: 500 }
      );
    }

    // Initialize Gemini client with API key from .env
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Parse and validate request body
    let requestBody: RequestBody;
    try {
      requestBody = await req.json();
    } catch (error) {
      return NextResponse.json(
        { success: false, error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    const { amount, baseToken } = requestBody;

    // Validate input parameters
    if (typeof amount !== "number" || amount <= 0) {
      return NextResponse.json(
        { success: false, error: "Amount must be a positive number" },
        { status: 400 }
      );
    }

    if (typeof baseToken !== "string" || !baseToken.trim()) {
      return NextResponse.json(
        { success: false, error: "BaseToken must be a non-empty string" },
        { status: 400 }
      );
    }

    // Get current date for more accurate advice
    const currentDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Optimized prompt for diversified, user-focused advice with current date
    const prompt = `
      You are a crypto investment advisor on ${currentDate}. The user has ${amount} ${baseToken} to invest. Suggest a diversified portfolio for short-term investment (e.g., yield farming or holding), focusing on best value: high profit potential, low volatility, and balanced risk.
      
      Provide:
      1. Allocation breakdown as an array (e.g., [{"token": "USDT", "percentage": 50, "amount": 250, "tokenAddress": "0x..."}]).
      2. Reasons based on current market trends, prices, 24h changes, and yields.
      3. Total estimated value after allocation.
      4. Warnings (e.g., market volatility).
      
      Respond ONLY in valid JSON format: 
      { 
        "allocations": [{"token": "string", "percentage": number, "amount": number, "tokenAddress": "string"}], 
        "reasons": "string", 
        "estimatedValue": ${amount}, 
        "warnings": "string" 
      }
      
      Do not include any text before or after the JSON.
    `;

    // Generate content from Gemini
    const result = await model.generateContent(prompt);
    const response = result.response;
    const output = response.text();

    // Clean the output to ensure it's valid JSON
    let cleanedOutput = output.trim();

    // Remove potential markdown code blocks
    if (cleanedOutput.startsWith("```json")) {
      cleanedOutput = cleanedOutput
        .replace(/^```json\s*/, "")
        .replace(/\s*```$/, "");
    } else if (cleanedOutput.startsWith("```")) {
      cleanedOutput = cleanedOutput
        .replace(/^```\s*/, "")
        .replace(/\s*```$/, "");
    }

    // Parse the JSON response
    let parsedOutput: InvestmentAdvice | { error: string; raw: string };
    try {
      const parsed = JSON.parse(cleanedOutput);

      // Validate the structure of the parsed response
      if (
        parsed &&
        typeof parsed === "object" &&
        Array.isArray(parsed.allocations) &&
        typeof parsed.reasons === "string" &&
        typeof parsed.estimatedValue === "number" &&
        typeof parsed.warnings === "string"
      ) {
        // Validate each allocation
        const validAllocations = parsed.allocations.every(
          (allocation: any) =>
            typeof allocation.token === "string" &&
            typeof allocation.percentage === "number" &&
            typeof allocation.amount === "number" &&
            typeof allocation.tokenAddress === "string"
        );

        if (validAllocations) {
          parsedOutput = parsed as InvestmentAdvice;
        } else {
          parsedOutput = {
            error: "Invalid allocation structure in response",
            raw: cleanedOutput,
          };
        }
      } else {
        parsedOutput = {
          error: "Response missing required fields or invalid structure",
          raw: cleanedOutput,
        };
      }
    } catch (parseError) {
      parsedOutput = {
        error: "Failed to parse JSON response from AI",
        raw: cleanedOutput,
      };
    }

    // Return response to frontend (NO contract integration here)
    return NextResponse.json({
      success: true,
      data: parsedOutput,
    });
  } catch (error) {
    console.error("Gemini API Error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
