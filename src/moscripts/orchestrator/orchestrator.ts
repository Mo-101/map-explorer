/**
 * MoScripts Orchestrator
 * ======================
 * Event-driven intelligence coordination system for AFRO STORM
 * 
 * This orchestrator manages all MoScripts and coordinates their execution
 * based on events, ensuring proper sequencing, error handling, and voice output.
 */

import { MoScript, MoScriptTrigger, MoScriptEvent, MoScriptRegistryEntry, MoScriptContext, MoScriptInputs } from '../types/moscript';

export class MoScriptsOrchestrator {
  private registry: Map<string, MoScriptRegistryEntry> = new Map();
  private eventQueue: MoScriptEvent[] = [];
  private isProcessing: boolean = false;
  private globalState: Map<string, any> = new Map();
  private eventListeners: Map<MoScriptTrigger, Set<(event: MoScriptEvent) => void>> = new Map();
  
  // Configuration
  private config = {
    enableVoiceLines: true,
    enableSass: true,
    logLevel: 'info' as 'info' | 'warn' | 'error',
    maxQueueSize: 1000,
    executionTimeout: 30000, // 30 seconds
  };
  
  constructor(config?: Partial<typeof MoScriptsOrchestrator.prototype.config>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
    
    this.log('🔥 MoScripts Orchestrator initialized', 'info');
    this.log('Ubuntu: I am because WE are (Multi-Model Mesh)', 'info');
  }
  
  /**
   * Register a MoScript in the orchestrator
   */
  register(script: MoScript, options: Partial<Omit<MoScriptRegistryEntry, 'script'>> = {}): void {
    const entry: MoScriptRegistryEntry = {
      script,
      enabled: options.enabled ?? true,
      priority: options.priority ?? 0,
      conditions: options.conditions,
    };
    
    this.registry.set(script.id, entry);
    this.log(`📝 Registered MoScript: ${script.id} (${script.name})`, 'info');
  }
  
  /**
   * Unregister a MoScript
   */
  unregister(scriptId: string): void {
    if (this.registry.delete(scriptId)) {
      this.log(`🗑️ Unregistered MoScript: ${scriptId}`, 'info');
    }
  }
  
  /**
   * Enable/disable a MoScript
   */
  setEnabled(scriptId: string, enabled: boolean): void {
    const entry = this.registry.get(scriptId);
    if (entry) {
      entry.enabled = enabled;
      this.log(`${enabled ? '✅' : '⏸️'} ${enabled ? 'Enabled' : 'Disabled'} MoScript: ${scriptId}`, 'info');
    }
  }
  
  /**
   * Emit an event that may trigger MoScripts
   */
  async emit(trigger: MoScriptTrigger, data: any, source?: string): Promise<void> {
    const event: MoScriptEvent = {
      trigger,
      data,
      timestamp: new Date(),
      source,
    };
    
    this.eventQueue.push(event);
    
    // Start processing if not already running
    if (!this.isProcessing) {
      await this.processQueue();
    }
  }
  
  /**
   * Process the event queue
   */
  private async processQueue(): Promise<void> {
    this.isProcessing = true;
    
    while (this.eventQueue.length > 0) {
      const event = this.eventQueue.shift();
      if (event) {
        await this.handleEvent(event);
      }
    }
    
    this.isProcessing = false;
  }
  
  /**
   * Handle a single event by executing all matching MoScripts
   */
  private async handleEvent(event: MoScriptEvent): Promise<void> {
    // Find all MoScripts that should respond to this trigger
    const respondingScripts = Array.from(this.registry.values())
      .filter(entry => {
        if (!entry.enabled) return false;
        
        const triggers = Array.isArray(entry.script.trigger) 
          ? entry.script.trigger 
          : [entry.script.trigger];
        
        if (!triggers.includes(event.trigger)) return false;
        
        // Check additional conditions if any
        if (entry.conditions && !entry.conditions(event)) return false;
        
        return true;
      })
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)); // Higher priority first
    
    if (respondingScripts.length === 0) {
      return;
    }
    
    this.log(`🎯 Event "${event.trigger}" triggered ${respondingScripts.length} MoScript(s)`, 'info');
    
    // Execute all responding MoScripts
    const results = await Promise.allSettled(
      respondingScripts.map(entry => this.executeScript(entry.script, event))
    );
    
    // Notify event listeners
    this.notifyListeners(event.trigger, event);
  }
  
  /**
   * Execute a single MoScript
   */
  private async executeScript(script: MoScript, event: MoScriptEvent): Promise<any> {
    const startTime = Date.now();
    const context = this.createContext(script.id, event.trigger);
    
    try {
      // Validate inputs if validator exists
      if (script.validate && !script.validate(event.data)) {
        throw new Error('Input validation failed');
      }
      
      // Execute the logic with timeout
      const result = await Promise.race([
        Promise.resolve(script.logic(event.data)),
        this.timeout(this.config.executionTimeout)
      ]);
      
      const executionTime = Date.now() - startTime;
      
      // Generate and output voice line
      if (this.config.enableVoiceLines) {
        const voiceLine = script.voiceLine(result, event.data);
        
        if (script.sass && this.config.enableSass) {
          console.log(`🔥 [${script.id}] ${voiceLine}`);
        } else {
          console.log(`💬 [${script.id}] ${voiceLine}`);
        }
      }
      
      this.log(`✅ Executed ${script.id} in ${executionTime}ms`, 'info');
      
      return result;
      
    } catch (error) {
      const err = error as Error;
      
      // Use error handler if provided
      if (script.onError) {
        const errorMessage = script.onError(err, event.data);
        console.error(`❌ [${script.id}] ${errorMessage}`);
      } else {
        console.error(`❌ [${script.id}] Error: ${err.message}`);
      }
      
      this.log(`❌ Failed to execute ${script.id}: ${err.message}`, 'error');
      
      throw error;
    }
  }
  
  /**
   * Create execution context for a MoScript
   */
  private createContext(scriptId: string, trigger: MoScriptTrigger): MoScriptContext {
    return {
      scriptId,
      trigger,
      timestamp: new Date(),
      
      log: (message: string, level = 'info' as const) => {
        this.log(`[${scriptId}] ${message}`, level);
      },
      
      emit: (trigger: MoScriptTrigger, data: any) => {
        this.emit(trigger, data, scriptId);
      },
      
      getState: (key: string) => {
        return this.globalState.get(key);
      },
      
      setState: (key: string, value: any) => {
        this.globalState.set(key, value);
      },
    };
  }
  
  /**
   * Add event listener for a specific trigger
   */
  on(trigger: MoScriptTrigger, callback: (event: MoScriptEvent) => void): void {
    if (!this.eventListeners.has(trigger)) {
      this.eventListeners.set(trigger, new Set());
    }
    
    this.eventListeners.get(trigger)!.add(callback);
  }
  
  /**
   * Remove event listener
   */
  off(trigger: MoScriptTrigger, callback: (event: MoScriptEvent) => void): void {
    const listeners = this.eventListeners.get(trigger);
    if (listeners) {
      listeners.delete(callback);
    }
  }
  
  /**
   * Notify all listeners for a trigger
   */
  private notifyListeners(trigger: MoScriptTrigger, event: MoScriptEvent): void {
    const listeners = this.eventListeners.get(trigger);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(event);
        } catch (error) {
          this.log(`Error in event listener: ${(error as Error).message}`, 'error');
        }
      });
    }
  }
  
  /**
   * Get all registered MoScripts
   */
  getRegisteredScripts(): Array<{ id: string; name: string; trigger: MoScriptTrigger | MoScriptTrigger[]; enabled: boolean }> {
    return Array.from(this.registry.values()).map(entry => ({
      id: entry.script.id,
      name: entry.script.name,
      trigger: entry.script.trigger,
      enabled: entry.enabled,
    }));
  }
  
  /**
   * Get orchestrator statistics
   */
  getStats() {
    return {
      totalScripts: this.registry.size,
      enabledScripts: Array.from(this.registry.values()).filter(e => e.enabled).length,
      queueLength: this.eventQueue.length,
      isProcessing: this.isProcessing,
      stateSize: this.globalState.size,
    };
  }
  
  /**
   * Clear all MoScripts and state
   */
  clear(): void {
    this.registry.clear();
    this.eventQueue = [];
    this.globalState.clear();
    this.eventListeners.clear();
    this.log('🧹 Orchestrator cleared', 'info');
  }
  
  /**
   * Utility: Create a timeout promise
   */
  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Execution timeout after ${ms}ms`)), ms);
    });
  }
  
  /**
   * Utility: Log with level control
   */
  private log(message: string, level: 'info' | 'warn' | 'error'): void {
    const levels = { info: 0, warn: 1, error: 2 };
    const configLevel = levels[this.config.logLevel];
    const messageLevel = levels[level];
    
    if (messageLevel >= configLevel) {
      const prefix = {
        info: 'ℹ️',
        warn: '⚠️',
        error: '❌',
      }[level];
      
      console.log(`${prefix} [MoScripts] ${message}`);
    }
  }
}

/**
 * Global orchestrator instance
 * Use this throughout the application
 */
export const orchestrator = new MoScriptsOrchestrator({
  enableVoiceLines: true,
  enableSass: true,
  logLevel: 'info',
});

/**
 * Utility: Create and register a MoScript in one call
 */
export function createMoScript<TInputs extends MoScriptInputs = any, TResult = any>(
  script: MoScript<TInputs, TResult>,
  options?: Partial<Omit<MoScriptRegistryEntry, 'script'>>
): MoScript<TInputs, TResult> {
  orchestrator.register(script, options);
  return script;
}

/**
 * Utility: Emit event shorthand
 */
export function emit(trigger: MoScriptTrigger, data: any, source?: string): Promise<void> {
  return orchestrator.emit(trigger, data, source);
}

// Log initialization
console.log('🔥 MoScripts Orchestrator module loaded');
console.log('⚡ Event-driven intelligence system ready');
console.log('🌍 Built by MoStar Industries for African technological sovereignty');
