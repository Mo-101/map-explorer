/**
 * MoScripts Type System
 * =====================
 * Core type definitions for MoStar Industries' event-driven intelligence architecture
 * 
 * Philosophy: Every intelligence module has identity, purpose, logic, and PERSONALITY
 */

export type MoScriptTrigger = 
  | 'onMount'
  | 'onUnmount'
  | 'onMapLoad'
  | 'onMapClick'
  | 'onThreatsUpdate'
  | 'onWeatherUpdate'
  | 'onGraphCastUpdate'
  | 'onUserQuery'
  | 'onSchedule'
  | 'onError'
  | 'onConvergenceDetected'
  | string; // Allow custom triggers

export interface MoScriptInputs {
  [key: string]: any;
}

export interface MoScriptResult {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: {
    executionTime?: number;
    confidence?: number;
    [key: string]: any;
  };
}

/**
 * Core MoScript Interface
 * Every intelligence module follows this pattern
 */
export interface MoScript<TInputs extends MoScriptInputs = any, TResult = any> {
  /** Unique identifier (format: mo-[domain]-[descriptor]-[number]) */
  id: string;
  
  /** Human-readable name */
  name: string;
  
  /** Event that triggers this MoScript */
  trigger: MoScriptTrigger | MoScriptTrigger[];
  
  /** Expected input structure */
  inputs?: TInputs;
  
  /** Core intelligence logic */
  logic: (inputs: TInputs) => TResult | Promise<TResult>;
  
  /** Voice line with personality - what the script "says" after execution */
  voiceLine: (result: TResult, inputs: TInputs) => string;
  
  /** Enable sass mode for personality */
  sass: boolean;
  
  /** Optional: Error handler */
  onError?: (error: Error, inputs: TInputs) => string;
  
  /** Optional: Pre-execution validator */
  validate?: (inputs: TInputs) => boolean;
  
  /** Optional: Metadata */
  metadata?: {
    version?: string;
    author?: string;
    dependencies?: string[];
    [key: string]: any;
  };
}

/**
 * Python MoScript Interface (for backend)
 * Mirrors the TypeScript interface
 */
export interface PythonMoScript {
  id: string;
  name: string;
  trigger: string | string[];
  
  /** Python function signature */
  logic: string; // Python function name
  voice_line: string; // Python function name
  sass: boolean;
  
  metadata?: {
    version?: string;
    module?: string;
    [key: string]: any;
  };
}

/**
 * MoScript Execution Context
 * Tracks execution state and provides utilities
 */
export interface MoScriptContext {
  scriptId: string;
  trigger: MoScriptTrigger;
  timestamp: Date;
  parentScriptId?: string; // For nested execution
  
  /** Execution utilities */
  log: (message: string, level?: 'info' | 'warn' | 'error') => void;
  emit: (trigger: MoScriptTrigger, data: any) => void;
  getState: (key: string) => any;
  setState: (key: string, value: any) => void;
}

/**
 * MoScript Event
 * Represents an event that can trigger MoScripts
 */
export interface MoScriptEvent {
  trigger: MoScriptTrigger;
  data: any;
  timestamp: Date;
  source?: string; // Which component/script emitted this
  metadata?: Record<string, any>;
}

/**
 * MoScript Registry Entry
 * How MoScripts are registered in the orchestrator
 */
export interface MoScriptRegistryEntry {
  script: MoScript;
  enabled: boolean;
  priority?: number; // Higher priority scripts execute first
  conditions?: (event: MoScriptEvent) => boolean; // Additional execution conditions
}

/**
 * Example MoScript Implementation
 * Shows how to create a properly typed MoScript
 */
export interface ThreatDetectionInputs {
  weatherData: {
    vorticity: number[][];
    mslp: number[][];
    temperature: number[][];
  };
  historicalContext?: any;
}

export interface ThreatDetectionResult {
  cyclones: Array<{
    lat: number;
    lon: number;
    intensity: number;
    confidence: number;
  }>;
  floods: Array<any>;
  landslides: Array<any>;
  convergences: Array<any>;
  detectionTime: number;
}

// Example implementation (to be moved to actual MoScript files)
export const exampleMoScript: MoScript<ThreatDetectionInputs, ThreatDetectionResult> = {
  id: 'mo-threat-detector-001',
  name: 'Weather Threat Detector',
  trigger: 'onGraphCastUpdate',
  
  logic: async (inputs) => {
    const startTime = Date.now();
    
    // Detection logic here
    const cyclones = []; // ... detection algorithm
    const floods = [];
    const landslides = [];
    const convergences = [];
    
    return {
      cyclones,
      floods,
      landslides,
      convergences,
      detectionTime: Date.now() - startTime
    };
  },
  
  voiceLine: (result, inputs) => {
    const total = result.cyclones.length + result.floods.length + result.landslides.length;
    
    if (total === 0) {
      return "🌤️ Weather scan complete. No threats detected. Africa is clear.";
    }
    
    const maxCyclone = result.cyclones.reduce((max, c) => 
      c.intensity > max ? c.intensity : max, 0);
    
    return `🌪️ Detected ${result.cyclones.length} cyclones, ${result.floods.length} floods, ` +
           `${result.landslides.length} landslides. Strongest cyclone: ${maxCyclone}kt. ` +
           `Detection took ${result.detectionTime}ms. This one's got teeth, brother.`;
  },
  
  sass: true,
  
  onError: (error, inputs) => {
    return `⚠️ Threat detection failed: ${error.message}. Falling back to cached data, brethren.`;
  },
  
  validate: (inputs) => {
    return !!inputs.weatherData && 
           Array.isArray(inputs.weatherData.vorticity) &&
           inputs.weatherData.vorticity.length > 0;
  },
  
  metadata: {
    version: '1.0.0',
    author: 'Flame 🔥 Architect',
    dependencies: ['weather_anomaly_detection']
  }
};
