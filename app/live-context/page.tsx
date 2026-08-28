import type { Metadata } from "next";
import { LiveContextConsole } from "@/components/live-context/LiveContextConsole";

export const metadata: Metadata = {
  title: "Live Evidence Desk",
  description:
    "Source-labelled near-real-time disaster alerts, freshness context, impact metrics and incident media for AEGIS.",
};

export default function LiveContextPage() {
  return <LiveContextConsole />;
}
