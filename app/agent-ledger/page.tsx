import type { Metadata } from "next";
import { AgentActivityConsole } from "@/components/agent-activity/AgentActivityConsole";

export const metadata: Metadata = {
  title: "Agent Activity Ledger",
  description:
    "A separate AEGIS audit surface for verified agent executions, provider attempts, evidence citations and human approval receipts.",
};

export default function AgentLedgerPage() {
  return <AgentActivityConsole />;
}
