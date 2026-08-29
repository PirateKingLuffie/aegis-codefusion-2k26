import {
  Activity,
  BellRing,
  LayoutDashboard,
  RadioTower,
} from "lucide-react";
import Link from "next/link";
import styles from "./FeatureNavigation.module.css";

export type AegisFeature = "operations" | "intelligence" | "automation" | "ledger";

const FEATURES = [
  {
    id: "operations" as const,
    href: "/",
    label: "Operations",
    description: "World map, simulations and response planning",
    icon: LayoutDashboard,
  },
  {
    id: "intelligence" as const,
    href: "/live-context",
    label: "Live intelligence",
    description: "Source-labelled incidents and evidence",
    icon: RadioTower,
  },
  {
    id: "automation" as const,
    href: "/automation",
    label: "Automation",
    description: "Regional watches and alert proposals",
    icon: BellRing,
  },
  {
    id: "ledger" as const,
    href: "/agent-ledger",
    label: "Decision ledger",
    description: "Agent runs, receipts and human review",
    icon: Activity,
  },
];

export function FeatureNavigation({
  active,
  compact = false,
}: {
  active: AegisFeature;
  compact?: boolean;
}) {
  return (
    <nav
      className={`${styles.tabs} ${compact ? styles.compact : ""}`}
      aria-label="AEGIS features"
    >
      {FEATURES.map((feature) => {
        const Icon = feature.icon;
        const selected = active === feature.id;
        return (
          <Link
            className={`${styles.tab} ${selected ? styles.active : ""}`}
            href={feature.href}
            aria-current={selected ? "page" : undefined}
            aria-label={`${feature.label}: ${feature.description}`}
            title={`${feature.label} — ${feature.description}`}
            key={feature.id}
          >
            <Icon size={compact ? 15 : 14} aria-hidden="true" />
            <span>{feature.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
