import { useEffect, useState } from "react";
import { orchestrator } from "@/moscripts";
import { mo_THREAT_RENDERER } from "@/moscripts";
import MoScriptsTooltip from "./MoScriptsTooltip";

export const MoScriptsTest = () => {
  const [stats, setStats] = useState<any>(null);
  const [registeredScripts, setRegisteredScripts] = useState<any[]>([]);

  useEffect(() => {
    // Register MoScript if not already registered
    try {
      orchestrator.register(mo_THREAT_RENDERER);
      
      // Get stats
      const currentStats = orchestrator.getStats();
      setStats(currentStats);
      
      // Get registered scripts
      const scripts = orchestrator.getRegisteredScripts();
      setRegisteredScripts(scripts);
      
      console.log('🔥 MoScripts Test Component:');
      console.log('📊 Stats:', currentStats);
      console.log('📋 Registered Scripts:', scripts);
      
    } catch (error) {
      console.error('❌ MoScripts registration failed:', error);
    }
  }, []);

  return (
    <div style={{
      position: 'fixed',
      top: '10px',
      right: '10px',
      background: 'rgba(0, 0, 0, 0.8)',
      color: 'white',
      padding: '15px',
      borderRadius: '8px',
      fontFamily: 'monospace',
      fontSize: '12px',
      zIndex: 9999,
      maxWidth: '300px'
    }}>
      <MoScriptsTooltip
        title="MoScripts Intelligence System"
        description="Event-driven intelligence architecture for AFRO STORM. Each MoScript is an independent module with logic, triggers, and personality. Hover over metrics for details."
      >
        <h3 style={{ margin: '0 0 10px 0', color: '#ff6b6b' }}>🔥 MoScripts Status</h3>
      </MoScriptsTooltip>
      
      {stats && (
        <div>
          <MoScriptsTooltip
            title="Total MoScripts"
            description="The total number of MoScripts intelligence modules registered in the system. Each MoScript is an independent intelligence module with its own logic, triggers, and personality."
          >
            <p><strong>Total Scripts:</strong> {stats.totalScripts}</p>
          </MoScriptsTooltip>
          
          <MoScriptsTooltip
            title="Active MoScripts"
            description="Number of MoScripts currently enabled and responding to events. Disabled MoScripts won't execute even if their triggers are fired."
          >
            <p><strong>Enabled Scripts:</strong> {stats.enabledScripts}</p>
          </MoScriptsTooltip>
          
          <MoScriptsTooltip
            title="Event Queue"
            description="Number of events waiting to be processed by MoScripts. Events are queued when triggers are fired faster than MoScripts can execute them."
          >
            <p><strong>Queue Length:</strong> {stats.queueLength}</p>
          </MoScriptsTooltip>
          
          <MoScriptsTooltip
            title="Processing Status"
            description="Whether the MoScripts orchestrator is currently executing scripts. When processing, new events are queued until current execution completes."
          >
            <p><strong>Processing:</strong> {stats.isProcessing ? 'Yes' : 'No'}</p>
          </MoScriptsTooltip>
        </div>
      )}
      
      {registeredScripts.length > 0 && (
        <div style={{ marginTop: '10px' }}>
          <MoScriptsTooltip
            title="Registered MoScripts"
            description="List of all MoScripts intelligence modules currently registered in the system. Each has unique ID, trigger events, and personality through voice lines."
          >
            <strong>Registered:</strong>
          </MoScriptsTooltip>
          <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
            {registeredScripts.map(script => (
              <li key={script.id}>
                <MoScriptsTooltip
                  title={script.name}
                  description={`MoScript ID: ${script.id}. Trigger: ${Array.isArray(script.trigger) ? script.trigger.join(', ') : script.trigger}. This module responds to specific events and executes intelligence logic with personality.`}
                >
                  <span>
                    {script.name} ({script.enabled ? '✅' : '❌'})
                  </span>
                </MoScriptsTooltip>
              </li>
            ))}
          </ul>
        </div>
      )}
      
      <MoScriptsTooltip
        title="Console Voice Lines"
        description="MoScripts output voice lines to browser console during execution. Open developer tools (F12) to see personality messages like '🔥 [mo-threat-renderer-001] Map LIVE: Rendered 3 threats...'"
      >
        <div style={{ marginTop: '10px', fontSize: '10px', opacity: '0.7' }}>
          Check browser console for voice lines 🔥
        </div>
      </MoScriptsTooltip>
    </div>
  );
};
