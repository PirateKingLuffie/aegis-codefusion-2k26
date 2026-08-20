import type { CapacitorConfig } from "@capacitor/cli";

const configuredServer = process.env.AEGIS_APP_URL?.trim();

function validatedServerUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("AEGIS_APP_URL must use HTTP or HTTPS.");
  }
  return parsed.origin;
}

const serverUrl = validatedServerUrl(configuredServer);

const config: CapacitorConfig = {
  appId: "in.codefusion.aegis",
  appName: "AEGIS",
  webDir: "web",
  server: serverUrl
    ? {
        url: serverUrl,
        cleartext: serverUrl.startsWith("http://"),
      }
    : undefined,
  android: {
    allowMixedContent: false,
    backgroundColor: "#061116",
  },
};

export default config;
