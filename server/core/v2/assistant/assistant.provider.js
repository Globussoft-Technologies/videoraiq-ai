import axios from "axios";
import config from "config";
import { GoogleGenAI } from "@google/genai";

const PLACEHOLDERS = new Set([
  "replace-with-llm-api-key",
  "replace-with-gemini-api-key",
  "your-llm-api-key",
  "your-gemini-api-key",
  "dummy",
]);

function clean(value) {
  return String(value ?? "").trim();
}

function usableSecret(value) {
  const secret = clean(value);
  return secret && !PLACEHOLDERS.has(secret.toLowerCase()) ? secret : "";
}

function configValue(paths) {
  for (const path of paths) {
    if (config.has(path)) {
      const value = clean(config.get(path));
      if (value) return value;
    }
  }
  return "";
}

export function resolveProviderSettings() {
  const configuredProvider = clean(
    process.env.LLM_PROVIDER || configValue(["Assistant.provider", "LLM_PROVIDER"]),
  ).toLowerCase();

  const provider = configuredProvider || "gemini";

  const genericKey = usableSecret(process.env.LLM_API_KEY || configValue(["Assistant.apiKey", "LLM_API_KEY"]));

  const configuredModel = clean(
    process.env.LLM_MODEL || configValue(["Assistant.model", "LLM_MODEL"]),
  );
  const model = configuredModel || (provider === "gemini" ? "gemini-2.5-flash" : "");
  const baseUrl = clean(process.env.LLM_BASE_URL || configValue(["Assistant.baseUrl", "LLM_BASE_URL"]));

  return { provider, apiKey: genericKey, model, baseUrl };
}

function configurationError(message) {
  const error = new Error(message);
  error.statusCode = 503;
  return error;
}

function requireSettings(settings) {
  const supported = new Set(["gemini", "openai", "openai-compatible", "anthropic"]);
  if (!supported.has(settings.provider)) {
    throw configurationError(`Unsupported LLM provider: ${settings.provider}`);
  }
  if (!settings.apiKey && !(settings.provider === "openai-compatible" && settings.baseUrl)) {
    throw configurationError("The configured LLM provider has no API key.");
  }
  if (!settings.model) {
    throw configurationError("The configured LLM provider has no model name.");
  }
}

function joinEndpoint(baseUrl, suffix) {
  const base = clean(baseUrl).replace(/\/+$/, "");
  if (!base) return suffix;
  if (base.endsWith(suffix)) return base;
  return `${base}${suffix.startsWith("/") ? "" : "/"}${suffix}`;
}

function toGeminiContents(messages) {
  return messages.map(({ role, text }) => ({
    role: role === "assistant" ? "model" : "user",
    parts: [{ text }],
  }));
}

async function callGemini(settings, systemInstruction, messages) {
  const ai = new GoogleGenAI({
    apiKey: settings.apiKey,
    ...(settings.baseUrl
      ? {
          httpOptions: {
            baseUrl: settings.baseUrl,
            headers: { Authorization: `Bearer ${settings.apiKey}` },
          },
        }
      : {}),
  });
  const models = [...new Set([settings.model, "gemini-2.5-flash-lite"])];
  let lastError;

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: toGeminiContents(messages),
          config: { systemInstruction, temperature: 0.2, maxOutputTokens: 800 },
        });
        return clean(response?.text);
      } catch (error) {
        lastError = error;
        const detail = `${error?.status || ""} ${error?.message || ""}`;
        const transient = /\b(429|500|502|503|504)\b|RESOURCE_EXHAUSTED|UNAVAILABLE/i.test(detail);
        if (!transient) throw error;
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    }
  }

  throw lastError;
}

async function callOpenAICompatible(settings, systemInstruction, messages) {
  const baseUrl = settings.baseUrl || "https://api.openai.com/v1";
  const url = joinEndpoint(baseUrl, "/chat/completions");
  const headers = { "Content-Type": "application/json" };
  if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;

  const { data } = await axios.post(
    url,
    {
      model: settings.model,
      messages: [{ role: "system", content: systemInstruction }, ...messages.map(({ role, text }) => ({ role, content: text }))],
      temperature: 0.2,
      max_tokens: 800,
    },
    { headers, timeout: 60_000 },
  );
  return clean(data?.choices?.[0]?.message?.content);
}

async function callAnthropic(settings, systemInstruction, messages) {
  const baseUrl = settings.baseUrl || "https://api.anthropic.com/v1";
  const url = joinEndpoint(baseUrl, "/messages");
  const { data } = await axios.post(
    url,
    {
      model: settings.model,
      system: systemInstruction,
      messages: messages.map(({ role, text }) => ({ role, content: text })),
      temperature: 0.2,
      max_tokens: 800,
    },
    {
      headers: {
        "Content-Type": "application/json",
        "x-api-key": settings.apiKey,
        "anthropic-version": "2023-06-01",
      },
      timeout: 60_000,
    },
  );
  return clean(data?.content?.find((part) => part?.type === "text")?.text);
}

export async function generateAssistantText({ systemInstruction, messages }) {
  const settings = resolveProviderSettings();
  requireSettings(settings);

  let text;
  if (settings.provider === "gemini") {
    text = await callGemini(settings, systemInstruction, messages);
  } else if (settings.provider === "anthropic") {
    text = await callAnthropic(settings, systemInstruction, messages);
  } else {
    text = await callOpenAICompatible(settings, systemInstruction, messages);
  }

  if (!text) {
    const error = new Error(`${settings.provider} returned an empty response.`);
    error.statusCode = 502;
    throw error;
  }
  return text;
}

export default { generateAssistantText, resolveProviderSettings };
