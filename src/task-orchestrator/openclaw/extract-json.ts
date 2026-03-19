function findFencedJson(text: string): string | undefined {
  const match = text.match(/```json\s*([\s\S]*?)```/i);
  return match?.[1]?.trim();
}

function findBalancedObject(text: string): string | undefined {
  let start = -1;
  let depth = 0;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "{") {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return undefined;
}

export function extractJsonPayload(text: string): string {
  const fenced = findFencedJson(text);
  if (fenced) {
    return fenced;
  }

  const balanced = findBalancedObject(text);
  if (balanced) {
    return balanced;
  }

  throw new Error("OpenClaw response did not contain a JSON payload");
}

export function parseJsonPayload<T>(text: string): T {
  return JSON.parse(extractJsonPayload(text)) as T;
}
