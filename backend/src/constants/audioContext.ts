export const AUDIO_CONTEXTS = {
  GENERAL: 'general',
  CLASSIFICATION_GENERATOR: 'classification-generator'
} as const;

export type AudioContextId = (typeof AUDIO_CONTEXTS)[keyof typeof AUDIO_CONTEXTS];
