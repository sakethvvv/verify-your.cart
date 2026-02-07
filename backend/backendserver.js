import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(express.json());

app.post("/analyze", async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: "API Key missing in backend" });
    }

    const prompt = `
You are an expert Fake Online Product Detector AI.

Analyze this product URL: ${url}

STRICT RULES:
- Trusted domains (amazon, flipkart, meesho, myntra, ajio, tatacliq, jiomart, nike, apple, walmart, target)
  must get trust_score 90-99 unless strong red flags exist.

- Suspicious domains (.xyz, .top, typosquatting) must get trust_score 0-40.

Return STRICT JSON only:
{
  "trust_score": number,
  "verdict": "Genuine" | "Suspicious" | "Fake",
  "breakdown": {
    "reviews": [],
    "sentiment": [],
    "price": [],
    "seller": [],
    "description": []
  },
  "reasons": [],
  "advice": ""
}
`;

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}`;

    const body = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048
      }
    };

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    return res.json(data);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Backend failed" });
  }
});

app.get("/", (req, res) => {
  res.send("Backend running successfully!");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("Server running on port " + PORT));
