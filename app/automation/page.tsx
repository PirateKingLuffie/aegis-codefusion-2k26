import type { Metadata } from "next";
import { AutomationConsole } from "@/components/automation/AutomationConsole";

export const metadata: Metadata = {
  title: "Regional Watch Automation",
  description:
    "AEGIS browser-local region subscriptions, deterministic incident evaluation and human-controlled alert previews.",
};

export default function AutomationPage() {
  return <AutomationConsole />;
}
