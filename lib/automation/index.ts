export { AUTOMATION_CAPABILITIES, AUTOMATION_POLICY_DEFAULTS, AUTOMATION_SUPPORTED_HAZARDS, DEFAULT_AUTOMATION_REGIONS } from "./defaults";
export { evaluateAutomation, incidentFingerprint } from "./evaluate";
export { normalizeIncident, normalizeNow, normalizePolicy, severityRank, sourceIsOfficial } from "./normalize";
export {
  automationIncidentSchema,
  automationPolicySchema,
  automationRegionSchema,
  automationRequestSchema,
  requestToEvaluationInput,
} from "./schemas";
export type * from "./types";
