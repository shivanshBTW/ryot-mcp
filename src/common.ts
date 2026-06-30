export function asText(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text:
          typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

export function nowIso() {
  return new Date().toISOString();
}

export function isoMinutesFrom(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000).toISOString();
}

export function resolveRequiredId(
  inputValue: string | undefined,
  envName: string,
  label: string,
): string {
  const resolved = inputValue || process.env[envName];
  if (!resolved) {
    throw new Error(
      `${label} is required. Pass it in the tool input or set ${envName} in the MCP env.`,
    );
  }
  return resolved;
}

export function resolveOptionalDefault(
  inputValue: string | undefined,
  envName: string,
  fallback: string,
): string {
  return inputValue || process.env[envName] || fallback;
}
