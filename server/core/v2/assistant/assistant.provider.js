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
  return messages.map(({ role, text, images = [] }) => ({
    role: role === "assistant" ? "model" : "user",
    parts: [{ text }, ...images.map((dataUrl) => {
      const [, mimeType, data] = String(dataUrl).match(/^data:(image\/(?:jpeg|png));base64,(.+)$/) || [];
      return mimeType && data ? { inlineData: { mimeType, data } } : null;
    }).filter(Boolean)],
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
      messages: [
        { role: "system", content: systemInstruction },
        ...messages.map(({ role, text, images = [] }) => ({
          role,
          content: [
            { type: "text", text },
            ...images.map((dataUrl) => ({ type: "image_url", image_url: { url: dataUrl } })),
          ],
        })),
      ],
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
      messages: messages.map(({ role, text, images = [] }) => ({
        role,
        content: [
          { type: "text", text },
          ...images.map((dataUrl) => {
            const [, mediaType, data] = String(dataUrl).match(/^data:(image\/(?:jpeg|png));base64,(.+)$/) || [];
            return mediaType && data
              ? { type: "image", source: { type: "base64", media_type: mediaType, data } }
              : null;
          }).filter(Boolean),
        ],
      })),
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

function parseTranscriptResponse(value) {
  const raw = clean(value).replace(/^```(?:json)?\s*|\s*```$/gi, "").trim();
  try {
    const parsed = JSON.parse(raw);
    return {
      text: clean(parsed?.text || parsed?.transcript),
      language: clean(parsed?.language) || null,
      confidence: Number.isFinite(Number(parsed?.confidence)) ? Number(parsed.confidence) : null,
    };
  } catch {
    return { text: raw, language: null, confidence: null };
  }
}

async function transcribeWithGemini(settings, audio) {
  const ai = new GoogleGenAI({
    apiKey: settings.apiKey,
    ...(settings.baseUrl ? { httpOptions: { baseUrl: settings.baseUrl, headers: { Authorization: `Bearer ${settings.apiKey}` } } } : {}),
  });
  const response = await ai.models.generateContent({
    model: settings.model,
    contents: [{
      role: "user",
      parts: [
        { text: "Transcribe this audio exactly as spoken. Detect the language automatically, preserve the original language and mixed-language wording, and do not translate. Return only valid JSON in this shape: {\\\"text\\\":\\\"...\\\",\\\"language\\\":\\\"ISO-639-1 or null\\\",\\\"confidence\\\":0.0}." },
        { inlineData: { mimeType: audio.mimetype, data: audio.buffer.toString("base64") } },
      ],
    }],
    config: { temperature: 0, maxOutputTokens: 2_000 },
  });
  return parseTranscriptResponse(response?.text);
}

async function transcribeWithOpenAICompatible(settings, audio) {
  const form = new FormData();
  form.append("file", new Blob([audio.buffer], { type: audio.mimetype }), audio.originalname || "voice.webm");
  form.append("model", settings.model || "whisper-1");
  form.append("response_format", "verbose_json");
  const headers = {};
  if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;
  const response = await fetch(joinEndpoint(settings.baseUrl || "https://api.openai.com/v1", "/audio/transcriptions"), {
    method: "POST",
    headers,
    body: form,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || "Speech transcription failed.");
    error.statusCode = response.status >= 500 ? 502 : response.status;
    throw error;
  }
  return {
    text: clean(payload?.text),
    language: clean(payload?.language) || null,
    confidence: null,
  };
}

export async function transcribeAudio(audio) {
  const settings = resolveProviderSettings();
  requireSettings(settings);
  if (!audio?.buffer?.length) {
    const error = new Error("Audio recording is empty.");
    error.statusCode = 400;
    throw error;
  }
  const result = settings.provider === "gemini"
    ? await transcribeWithGemini(settings, audio)
    : (settings.provider === "openai" || settings.provider === "openai-compatible")
      ? await transcribeWithOpenAICompatible(settings, audio)
      : (() => {
          const error = new Error("The configured speech transcription provider is not supported.");
          error.statusCode = 503;
          throw error;
        })();
  if (!result.text) {
    const error = new Error("No speech was detected in the recording.");
    error.statusCode = 422;
    throw error;
  }
  return result;
}

export default { generateAssistantText, resolveProviderSettings, transcribeAudio };
