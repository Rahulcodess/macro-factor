/**
 * Groq API client for AROMI. No paid APIs — hackathon-safe.
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export type GroqOptions = {
  systemPrompt: string;
  userInput: string;
  temperature?: number;
};

export async function callGroq<T = Record<string, unknown>>(
  options: GroqOptions
): Promise<T> {
  const { systemPrompt, userInput, temperature = 0.3 } = options;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set");
  }

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userInput },
      ],
      temperature,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API error: ${res.status} ${err}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("Empty response from Groq");
  }

  // Strip possible markdown code fence
  const raw = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  return JSON.parse(raw) as T;
}
