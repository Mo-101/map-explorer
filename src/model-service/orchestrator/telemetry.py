"""
Telemetry - Factual Event Emission
===================================

PURPOSE:
    Emit observable signals about what happened (factual only).
    
WHAT THIS IS:
    A passive reporting system for orchestrator events.
    
WHAT THIS IS NOT:
    ❌ A decision system
    ❌ An alerting system
    ❌ A control system
    ❌ An intelligence system
    
GOLDEN RULE:
    "Events describe reality. Events NEVER decide reality."

Architecture Status: LOCKED
Authority Level: MEDIUM (Reporting Only)
"""

from typing import Dict, Any, Optional, List
from datetime import datetime
import logging
import json

logger = logging.getLogger(__name__)


class Telemetry:
    """
    Factual event emission system for orchestrator.
    
    Emits ONLY factual observations about what happened:
    - phase.started
    - phase.completed  
    - phase.failed
    - artifact.loaded
    - artifact.produced
    - contract.validated
    - guardrail.violated
    - validation.failed
    
    Does NOT emit interpretive events like:
    - threat.detected
    - severity.high
    - alert.recommended
    - user.should_evacuate
    
    Those belong in System 2 (Intelligence Layer).
    """
    
    # ALLOWED EVENT VOCABULARY (Strictly Constrained)
    ALLOWED_EVENTS = {
        'phase.started',
        'phase.completed',
        'phase.failed',
        'artifact.loaded',
        'artifact.produced',
        'contract.validated',
        'guardrail.violated',
        'validation.failed',
    }
    
    # FORBIDDEN PAYLOAD KEYS (Interpretive, not factual)
    FORBIDDEN_PAYLOAD_KEYS = {
        'severity', 'urgency', 'threat_level', 'alert_type',
        'recommendation', 'action_required', 'should_evacuate',
        'confidence_score', 'risk_level', 'importance'
    }
    
    def __init__(self, enabled: bool = True):
        """
        Initialize telemetry system.
        
        Parameters:
        -----------
        enabled : bool
            Whether telemetry is enabled (default: True)
        """
        self.enabled = enabled
        self.events: List[Dict[str, Any]] = []
        logger.info("Telemetry initialized (enabled=%s)", enabled)
    
    def emit(
        self,
        event_type: str,
        payload: Dict[str, Any],
        source: str = 'orchestrator'
    ) -> None:
        """
        Emit a factual telemetry event.
        
        Parameters:
        -----------
        event_type : str
            Type of event (must be in ALLOWED_EVENTS)
        payload : Dict[str, Any]
            Event data (factual only, no interpretation)
        source : str
            Event source (default: 'orchestrator')
        
        Raises:
        -------
        ValueError
            If event_type is not in ALLOWED_EVENTS (safety check)
        
        CRITICAL:
        ---------
        This method ONLY accepts factual events.
        If you want to emit interpretive events, use System 2.
        """
        if not self.enabled:
            return
        
        # Safety check: only allow factual events
        if event_type not in self.ALLOWED_EVENTS:
            raise ValueError(
                f"Disallowed event type: {event_type}. "
                f"Must be one of: {', '.join(self.ALLOWED_EVENTS)}. "
                f"Interpretive events belong in System 2 (Intelligence Layer)."
            )
        
        # Safety check: payload must be factual (no interpretation)
        if not self._validate_payload_is_factual(payload):
            raise ValueError(
                f"Event payload contains interpretive keys. "
                f"Interpretive events belong in System 2 (Intelligence Layer). "
                f"Forbidden keys: {self.FORBIDDEN_PAYLOAD_KEYS}"
            )
        
        # Create event record (factual only)
        event = {
            'type': event_type,
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'source': source,
            'payload': payload
        }
        
        # Store event
        self.events.append(event)
        
        # Log event (structured)
        logger.info(
            "[Telemetry::%s] %s",
            event_type,
            json.dumps(payload, default=str)
        )
        
        # Optional: emit to external systems
        self._emit_external(event)
    
    def get_events(
        self,
        phase_name: Optional[str] = None,
        event_type: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Retrieve telemetry events (for observability).
        
        Parameters:
        -----------
        phase_name : str, optional
            Filter events by phase name. If None, return all events.
        event_type : str, optional
            Filter events by event type
        
        Returns:
        --------
        List[Dict[str, Any]]
            Matching events (factual only)
        """
        events = self.events
        
        if phase_name:
            events = [
                e for e in events
                if e['payload'].get('phase') == phase_name
            ]
        
        if event_type:
            events = [
                e for e in events
                if e['type'] == event_type
            ]
        
        return events
    
    def clear(self) -> None:
        """Clear all stored events."""
        self.events = []
        logger.info("Telemetry events cleared")
    
    def _emit_external(self, event: Dict[str, Any]) -> None:
        """
        Emit event to external systems (optional).
        
        Examples of what could go here:
        - WebSocket broadcast
        - Redis pub/sub
        - Log file
        - Metrics system
        - Toast notification system
        
        This is where "magical" UI updates come from - but they are
        PASSIVE OBSERVATIONS, not active control.
        """
        # TODO: Implement external emission (WebSocket, Redis, etc.)
        #
        # Example:
        # if self.websocket:
        #     self.websocket.send(json.dumps(event))
        #
        # Example:
        # if self.redis:
        #     self.redis.publish('orchestrator:events', json.dumps(event))
        pass
    
    def _validate_payload_is_factual(self, payload: Dict[str, Any]) -> bool:
        """
        Validate that event payload is factual (not interpretive).
        
        This is a safety check to prevent accidental leakage of
        interpretation into telemetry layer.
        
        Returns:
        --------
        bool
            True if payload is factual, False if interpretive
        """
        payload_keys = set(payload.keys())
        forbidden_found = payload_keys & self.FORBIDDEN_PAYLOAD_KEYS
        
        if forbidden_found:
            logger.warning(
                "Event payload contains interpretive keys: %s (belongs in System 2)",
                forbidden_found
            )
            return False
        
        return True


# ============================================================================
# CRITICAL REMINDER
# ============================================================================

"""
TELEMETRY IS NOT INTELLIGENCE.

This file reports what happened. It does not interpret what it means.

If you want to:
- Assess severity → System 2 (Intelligence Layer)
- Recommend actions → System 2 (Intelligence Layer)
- Generate narratives → System 2 (Intelligence Layer)
- Make decisions → System 2 (Intelligence Layer)

This file just observes and reports facts.

Examples of ALLOWED events:
✅ "phase.completed" + {"phase": "phase3a_detect", "time_ms": 1250}
✅ "artifact.produced" + {"path": "/data/cyclones.zarr"}
✅ "guardrail.violated" + {"reason": "synthetic_data"}

Examples of FORBIDDEN events:
❌ "threat.detected" (interpretation)
❌ "severity.high" (interpretation)
❌ "alert.urgent" (interpretation)

Keep this file boring and factual.

Architecture Status: LOCKED
"""
