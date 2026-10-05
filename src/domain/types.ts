export const COMPONENTS = ['H2', 'CH4', 'N2', 'CO2'] as const;
export type Component = typeof COMPONENTS[number];
export type Composition = Record<Component, number>;
export type CompositionBasis = 'mole' | 'mass';
export type Inventory = { componentMoles: Composition; revision: number; appliedTransferIds: string[] };
export type PressureBasis = 'absolute' | 'gauge';
export type GeometryPoint = { depthM: number; radiusM: number; surveyId?: string; uncertaintyM?: number };
export type ScheduleStep = {
  startHour: number; durationHours: number; flowMolPerSecond: number;
  inletTemperatureK: number; inletComposition?: Partial<Composition>;
};
export type Calibration = {
  id: string; sensorId: string; validFrom: string; validTo?: string; offset: number;
  scale: number; uncertainty: number; createdAt: string; supersedesId?: string;
  unit?: string; standardUncertainty?: number;
};
export type SensorSample = {
  sensorId: string; observedAt: string; value: number;
  quality: 'good' | 'suspect' | 'invalid'; unit: string;
};
export type LeakEvidence = {
  detectorId: string; sourceEventId: string; observedAt: string;
  logLikelihoodRatio: number; uncertainty: number; locationM: number;
  correlationGroup?: string; quality?: 'good' | 'suspect';
};
