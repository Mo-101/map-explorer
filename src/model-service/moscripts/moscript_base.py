"""
MoScript Base Class for Backend Intelligence Modules
============================================

This provides the foundation for all backend MoScripts with:
- Event-driven architecture
- Voice line generation with personality
- Execution timing and validation
- Error handling and logging
"""

import time
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from datetime import datetime


class MoScript(ABC):
    """
    Base class for all MoScripts intelligence modules
    """
    
    def __init__(self, id: str, name: str, trigger: str, sass: bool = True):
        self.id = id
        self.name = name
        self.trigger = trigger
        self.sass = sass
        self.enabled = True
        self.execution_count = 0
        self.total_execution_time = 0.0
        
    @abstractmethod
    def logic(self, inputs: Dict[str, Any]) -> Any:
        """
        Main logic for the MoScript - must be implemented by subclasses
        
        Args:
            inputs: Dictionary containing input data for the MoScript
            
        Returns:
            Result of the MoScript execution
        """
        pass
    
    def voice_line(self, result: Any, inputs: Dict[str, Any]) -> str:
        """
        Generate voice line with personality - can be overridden by subclasses
        
        Args:
            result: Result from the logic() method
            inputs: Original inputs to the MoScript
            
        Returns:
            Voice line string with personality
        """
        return f"🔥 [{self.id}] Execution complete in {time.time():.0f}ms"
    
    def execute(self, inputs: Dict[str, Any]) -> Any:
        """
        Execute the MoScript with timing and logging
        
        Args:
            inputs: Dictionary containing input data
            
        Returns:
            Result from the logic() method
        """
        if not self.enabled:
            print(f"⏸️ [{self.id}] {self.name} is disabled")
            return None
            
        start_time = time.time()
        self.execution_count += 1
        
        try:
            print(f"🚀 [{self.id}] {self.name} executing...")
            
            # Run the main logic
            result = self.logic(inputs)
            
            # Calculate execution time
            execution_time = time.time() - start_time
            self.total_execution_time += execution_time
            
            # Generate and print voice line
            voice_line = self.voice_line(result, inputs)
            print(f"🔥 [{self.id}] {voice_line}")
            
            # Log execution stats
            print(f"✅ [{self.id}] Executed in {execution_time*1000:.0f}ms (Total: {self.execution_count} runs)")
            
            return result
            
        except Exception as e:
            error_msg = f"❌ [{self.id}] ERROR: {str(e)}"
            print(error_msg)
            
            # Generate error voice line if sass is enabled
            if self.sass:
                error_voice = f"🔥 [{self.id}] Even the best stumble sometimes, brother. Fixing the issue..."
                print(error_voice)
            
            return None
    
    def enable(self):
        """Enable the MoScript"""
        self.enabled = True
        print(f"✅ [{self.id}] {self.name} enabled")
    
    def disable(self):
        """Disable the MoScript"""
        self.enabled = False
        print(f"⏸️ [{self.id}] {self.name} disabled")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get execution statistics"""
        avg_time = self.total_execution_time / self.execution_count if self.execution_count > 0 else 0
        return {
            'id': self.id,
            'name': self.name,
            'enabled': self.enabled,
            'execution_count': self.execution_count,
            'total_execution_time': self.total_execution_time,
            'average_execution_time': avg_time,
            'trigger': self.trigger,
            'sass': self.sass
        }
    
    def __str__(self) -> str:
        return f"MoScript({self.id}: {self.name})"
    
    def __repr__(self) -> str:
        return self.__str__()


class MoScriptOrchestrator:
    """
    Orchestrator for managing multiple MoScripts
    """
    
    def __init__(self):
        self.moscripts: Dict[str, MoScript] = {}
        self.event_queue: list = []
        self.processing = False
        
    def register(self, moscript: MoScript):
        """Register a MoScript with the orchestrator"""
        self.moscripts[moscript.id] = moscript
        print(f"📝 Registered MoScript: {moscript.id} ({moscript.name})")
        
    def unregister(self, moscript_id: str):
        """Unregister a MoScript"""
        if moscript_id in self.moscripts:
            del self.moscripts[moscript.id]
            print(f"🗑️ Unregistered MoScript: {moscript_id}")
    
    def enable(self, moscript_id: str):
        """Enable a specific MoScript"""
        if moscript_id in self.moscripts:
            self.moscripts[moscript_id].enable()
    
    def disable(self, moscript_id: str):
        """Disable a specific MoScript"""
        if moscript_id in self.moscripts:
            self.moscripts[moscript_id].disable()
    
    def emit_event(self, event_name: str, data: Dict[str, Any]):
        """Emit an event to trigger relevant MoScripts"""
        print(f"🎯 Event '{event_name}' triggered {len([m for m in self.moscripts.values() if m.trigger == event_name])} MoScript(s)")
        
        for moscript in self.moscripts.values():
            if moscript.trigger == event_name:
                moscript.execute(data)
    
    def get_stats(self) -> Dict[str, Any]:
        """Get orchestrator statistics"""
        return {
            'total_moscripts': len(self.moscripts),
            'enabled_moscripts': len([m for m in self.moscripts.values() if m.enabled]),
            'queue_length': len(self.event_queue),
            'processing': self.processing,
            'moscripts': [m.get_stats() for m in self.moscripts.values()]
        }
    
    def list_moscripts(self) -> list:
        """List all registered MoScripts"""
        return list(self.moscripts.values())


# Global orchestrator instance
global_orchestrator = MoScriptOrchestrator()
