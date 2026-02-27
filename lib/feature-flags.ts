/**
 * Feature Flags
 *
 * Centralised feature flag definitions.
 * These control experimental or phased feature rollouts.
 */

export const FEATURE_FLAGS = Object.freeze({
  /**
   * When true, shows the consensus threshold slider in the decision setup wizard.
   * Disabled until the Deliberate conversation flow is implemented.
   */
  ENABLE_CONSENSUS_THRESHOLD: false,
});
