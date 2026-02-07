import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { AnalysisResult } from "../types";
import { mockAnalyzeProduct } from "./mockAnalysisService";

/**
 * Analyzes a product URL to determine if it's fake or genuine.
 * Uses Google Gemini AI with Search Grounding for accuracy.
 */
export const analyzeProduct = async (url: string): Promise<AnalysisResult> => {
  
  // ✅ Correct way for Vite + Cloudflare deployment
  const apiKey = import.meta.env.VITE_API_KEY;

  if (!apiKey || apiKey === "PLACEHOLDER_API_KEY" || apiKey.trim() === "") {
    console.warn("API Key missing. Using Mock Analysis Service.");
    return mockAnalyzeProduct(url);
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `
You are an expert Fake Online Product Detector AI.

Your goal: protect users from scams while NOT falsely accusing trusted brands.

Analyze this product URL: ${url}

STRICT RULES:
- If domain is from trusted platforms:
  amazon.in, amazon.com, flipkart.com, meesho.com, myntra.com, ajio.com,
  tatacliq.com, jiomart.com, apple.com, nike.com, walmart.com, target.com
  then default trust_score MUST be 90-99 unless clear red flags exist.

- If domain looks suspicious (typo, unknown TLD like .xyz, .top, fake-looking subdomains):
  trust_score MUST be 0-40.

- Always provide detailed breakdown:
  Reviews & Ratings
  Review Sentiment
  Price Analysis
  Seller Trust
  Product Description

Return STRICT JSON only. No extra explanation outside JSON.
`;

    const response = await ai.models.generateContent({
      model: "gemini-1.5-pro",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            trust_score: { type: Type.NUMBER },
            verdict: { type: Type.STRING },
            breakdown: {
              type: Type.OBJECT,
              properties: {
                reviews: { type: Type.ARRAY, items: { type: Type.STRING } },
                sentiment: { type: Type.ARRAY, items: { type: Type.STRING } },
                price: { type: Type.ARRAY, items: { type: Type.STRING } },
                seller: { type: Type.ARRAY, items: { type: Type.STRING } },
                description: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
            },
            reasons: { type: Type.ARRAY, items: { type: Type.STRING } },
            advice: { type: Type.STRING },
          },
        },
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
          },
          {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
          },
          {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
          },
          {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
          },
        ],
      },
    });

    let rawText = response.text || "{}";

    // Remove markdown code blocks if present
    rawText = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();

    // Extract JSON object if extra junk exists
    const firstBrace = rawText.indexOf("{");
    const lastBrace = rawText.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1) {
      rawText = rawText.substring(firstBrace, lastBrace + 1);
    }

    const result = JSON.parse(rawText);

    // Extract sources
    const sources: string[] = [];
    if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
      response.candidates[0].groundingMetadata.groundingChunks.forEach((chunk: any) => {
        if (chunk.web?.uri) sources.push(chunk.web.uri);
      });
    }

    // Map verdict properly
    let mappedVerdict: AnalysisResult["verdict"] = "Suspicious";
    const v = (result.verdict || "").toLowerCase();

    if (v.includes("genuine") || v.includes("safe")) mappedVerdict = "Genuine";
    else if (v.includes("fake")) mappedVerdict = "Fake";
    else mappedVerdict = "Suspicious";

    const safeBreakdown = {
      reviews: result.breakdown?.reviews || ["No clear review data found."],
      sentiment: result.breakdown?.sentiment || ["Sentiment analysis not available."],
      price: result.breakdown?.price || ["Price comparison not available."],
      seller: result.breakdown?.seller || ["Seller history not found."],
      description: result.breakdown?.description || ["Description analysis not available."],
    };

    return {
      trust_score: result.trust_score ?? 0,
      verdict: mappedVerdict,
      reasons: result.reasons || ["AI completed analysis."],
      advice: result.advice || "Proceed carefully and verify independently.",
      url,
      timestamp: new Date().toISOString(),
      sources: sources.slice(0, 3),
      breakdown: safeBreakdown,
    };

  } catch (error: any) {
    console.error("AI Analysis Failed:", error);
    return mockAnalyzeProduct(url);
  }
};
