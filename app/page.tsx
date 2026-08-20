import type { Metadata } from "next";
import { CommandCenter } from "@/components/command-center/CommandCenter";

export const metadata: Metadata = {
  title: "Operations Center",
  description:
    "Map-first emergency simulation, impact analysis and human-controlled response planning.",
};

export default function Home() {
  return <CommandCenter />;
}
