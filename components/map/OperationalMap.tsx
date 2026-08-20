"use client";

import { AegisMap } from "./AegisMap";
import type { AegisMapProps } from "./types";

/**
 * The zero-cost release has one operational renderer with two independent
 * public style providers. AegisMap performs failover internally, so operators
 * never see provider keys or a non-functional paid-provider switch.
 */
export function OperationalMap(props: AegisMapProps) {
  return <AegisMap {...props} />;
}
