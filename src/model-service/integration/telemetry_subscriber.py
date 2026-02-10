"""
Telemetry Subscriber - Passive Event Listener
=======================================

PURPOSE:
    Consumes factual telemetry events from System 1.
    NO interpretation. NO filtering by importance.
    
RESPONSIBILITIES:
    - Subscribe to telemetry events from System 1
    - Register artifacts when 'artifact.produced' events occur
    - Pass through all other events unchanged
    - Maintain event log for debugging
    
FORBIDDEN:
    ❌ Interpretation of event meaning
    ❌ Filtering events by importance
    ❌ Generating new events
    ❌ Decision making about severity
    ❌ Alert generation
    
ALLOWED:
    ✅ Subscribe to telemetry events
    ✅ Register artifacts on production
    ✅ Pass through all events unchanged
    ✅ Maintain event log
    ✅ Debug event logging

Architecture Status: LOCKED
Authority Level: MEDIUM (Passive Listener)
"""

from typing import Dict, Any, Optional, Callable
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class TelemetrySubscriber:
    """
    Passive listener to System 1 telemetry events.
    
    This class does NOT interpret events.
    It simply routes 'artifact.produced' events to the registry
    and passes through all other events unchanged.
    
    Design Principles:
    -----------------
    1. No interpretation of event meaning
    2. No filtering by importance
    3. No modification of event content
    4. Complete event pass-through
    5. Debug logging only
    """
    
    def __init__(self, registry, event_callback: Optional[Callable] = None):
        """
        Initialize telemetry subscriber.
        
        Parameters:
        -----------
        registry : ArtifactRegistry
            Registry to register artifacts with
        event_callback : Callable, optional
            Optional callback for all events (for debugging)
        """
        self.registry = registry
        self.event_callback = event_callback
        self.events_processed = 0
        
        logger.info("TelemetrySubscriber initialized (passive listener)")
    
    def on_event(self, event: Dict[str, Any]) -> None:
        """
        Handle incoming telemetry event from System 1.
        
        Expected event shape:
        {
            "type": "artifact.produced",
            "timestamp": "2024-01-01T00:00:00Z",
            "source": "orchestrator",
            "payload": {
                "phase": "phase3a_detect",
                "artifact_type": "DetectedTracks",
                "path": "/data/tracks.json"
            }
        }
        
        Parameters:
        -----------
        event : Dict[str, Any]
            Telemetry event from System 1
        
        CRITICAL:
        ---------
        This method NEVER:
        - Interprets event meaning
        - Filters events by importance
        - Modifies event content
        - Makes decisions about severity
        - Generates alerts
        
        This method ONLY:
        - Routes artifact.produced events to registry
        - Passes through all other events
        - Logs events for debugging
        """
        self.events_processed += 1
        
        # Log event for debugging
        logger.debug(
            "Telemetry event received: %s from %s",
            event.get('type', 'unknown'),
            event.get('source', 'unknown')
        )
        
        # Call event callback if provided (for debugging)
        if self.event_callback:
            self.event_callback(event)
        
        # Handle artifact production events
        if event.get('type') == 'artifact.produced':
            self._handle_artifact_produced(event)
        
        # Pass through all other events unchanged
        # (No interpretation, no filtering, no modification)
    
    def _handle_artifact_produced(self, event: Dict[str, Any]) -> None:
        """
        Handle artifact production events.
        
        This method extracts artifact metadata from the event
        and registers it with the artifact registry.
        
        Parameters:
        -----------
        event : Dict[str, Any]
            Telemetry event of type 'artifact.produced'
        
        CRITICAL:
        ---------
        This method extracts metadata ONLY.
        It does NOT:
        - Interpret artifact contents
        - Validate artifact quality
        - Make decisions about importance
        - Generate alerts
        """
        payload = event.get('payload', {})
        
        # Extract artifact metadata
        artifact_type = payload.get('artifact_type')
        artifact_path = payload.get('path')
        phase_name = payload.get('phase')
        timestamp = datetime.fromisoformat(
            event.get('timestamp', datetime.utcnow().isoformat())
        )
        
        # Validate required fields
        if not all([artifact_type, artifact_path, phase_name]):
            logger.warning(
                "Invalid artifact.produced event: missing required fields"
            )
            return
        
        # Create artifact record
        from .artifact_registry import ArtifactRecord
        record = ArtifactRecord(
            artifact_type=artifact_type,
            path=artifact_path,
            produced_by_phase=phase_name,
            timestamp=timestamp
        )
        
        # Register with registry
        try:
            self.registry.register(record)
            logger.info(
                "Artifact registered from telemetry: %s",
                artifact_type
            )
        except RuntimeError as e:
            logger.error(
                "Failed to register artifact from telemetry: %s",
                str(e)
            )
    
    def get_statistics(self) -> Dict[str, Any]:
        """
        Get subscriber statistics.
        
        Returns:
        --------
        Dict[str, Any]
            Statistics about events processed
        
        CRITICAL:
        ---------
        Returns factual statistics only.
        No interpretation of event importance or meaning.
        """
        return {
            'events_processed': self.events_processed,
            'subscriber_active': True,
            'registry_connected': self.registry is not None
        }
    
    def reset_statistics(self) -> None:
        """
        Reset subscriber statistics.
        
        CRITICAL:
        ---------
        This does NOT affect event processing.
        Only resets counters for monitoring.
        """
        self.events_processed = 0
        logger.info("TelemetrySubscriber statistics reset")


# ============================================================================
# CRITICAL REMINDER
# ============================================================================

"""
TELEMETRY SUBSCRIBER IS PASSIVE.

This file listens to events ONLY.
It does NOT:
- Interpret event meaning
- Filter events by importance
- Make decisions about severity
- Generate alerts or notifications
- Modify event content

If you want to:
- Analyze event patterns → System 2 (Intelligence Layer)
- Filter events by importance → System 2 (Intelligence Layer)
- Generate alerts → System 2 (Intelligence Layer)
- Make decisions → System 2 (Intelligence Layer)

This subscriber just answers: "What events happened?"

Architecture Status: LOCKED
Authority Level: MEDIUM (Passive Listener)
"""
