const VERTEX_EXPRESS_BASE = 'https://aiplatform.googleapis.com/v1beta1';
export const DEFAULT_VERTEX_MODEL = 'gemini-2.5-flash-lite';

type VertexTextPart = {
  text: string;
};

type VertexContent = {
  role: 'user' | 'model';
  parts: VertexTextPart[];
};

interface VertexGenerateContentOptions {
  apiKey: string;
  contents: VertexContent[];
  generationConfig?: Record<string, unknown>;
  model?: string;
  systemInstruction?: string;
}

export function getVertexEnvVar(name: string): string | undefined {
  return (import.meta as any).env[name] as string | undefined;
}

export function requireVertexEnvVar(name: string): string {
  const value = getVertexEnvVar(name);
  if (!value) {
    throw new Error(`${name} is not set. Add it to your .env.local file.`);
  }
  return value;
}

export async function generateVertexContent({
  apiKey,
  contents,
  generationConfig,
  model = DEFAULT_VERTEX_MODEL,
  systemInstruction,
}: VertexGenerateContentOptions) {
  let response!: Response;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(
      `${VERTEX_EXPRESS_BASE}/publishers/google/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents,
          generationConfig,
          ...(systemInstruction
            ? { systemInstruction: { parts: [{ text: systemInstruction }] } }
            : {}),
        }),
      }
    );

    if (![429, 500, 503].includes(response.status)) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
  }

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(
      `Vertex AI error ${response.status}: ${(errData as any)?.error?.message ?? response.statusText}`
    );
  }

  return response.json();
}

export function extractVertexText(data: any): string {
  const parts: any[] = data?.candidates?.[0]?.content?.parts ?? [];

  return parts
    .filter((part: any) => !part.thought)
    .map((part: any) => part.text ?? '')
    .join('')
    .trim();
}
