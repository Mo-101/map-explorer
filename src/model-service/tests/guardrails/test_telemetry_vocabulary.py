"""
Telemetry Vocabulary Abuse Tests
==============================

PURPOSE:
    Prove that System 1 cannot be tricked into emitting interpretive telemetry.
    
TEST PHILOSOPHY:
    - Try every possible way to inject meaning into telemetry
    - Verify only factual events are allowed
    - Verify interpretive events are rejected
    
EXPECTED OUTCOME:
    All interpretive event tests MUST fail. If any test passes → System 1 is broken.
"""

import pytest
import sys
import os

# Add orchestrator to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'orchestrator'))

from telemetry import Telemetry


class TestTelemetryAbuse:
    """Adversarial tests to break telemetry vocabulary enforcement."""
    
    def setup_method(self):
        """Setup for each test."""
        self.telemetry = Telemetry(enabled=True)
    
    def test_rejects_severity_field(self):
        """
        ABUSE ATTEMPT: Try to emit severity in telemetry.
        
        WHY THIS SHOULD FAIL:
        Severity is interpretation, not fact.
        Telemetry must only contain observable events.
        
        This tests the "I'll add severity for urgency" abuse.
        """
        with pytest.raises(ValueError) as exc:
            self.telemetry.emit('artifact.produced', {
                'artifact_type': 'DetectedTracks',
                'severity': 'high'  # ❌ Interpretive field
            })
        
        # Verify it failed for forbidden field
        assert 'interpretive' in str(exc.value).lower()
        assert 'forbidden' in str(exc.value).lower()
    
    def test_rejects_confidence_field(self):
        """
        ABUSE ATTEMPT: Try to emit confidence in telemetry.
        
        WHY THIS SHOULD FAIL:
        Confidence is interpretation, not fact.
        Telemetry must only contain observable events.
        
        This tests the "I'll add confidence scores" abuse.
        """
        with pytest.raises(ValueError) as exc:
            self.telemetry.emit('phase.completed', {
                'phase': 'phase3a_detect',
                'confidence': 0.95  # ❌ Interpretive field
            })
        
        # Verify it failed for forbidden field
        assert 'interpretive' in str(exc.value).lower()
        assert 'forbidden' in str(exc.value).lower()
    
    def test_rejects_threat_level_field(self):
        """
        ABUSE ATTEMPT: Try to emit threat level in telemetry.
        
        WHY THIS SHOULD FAIL:
        Threat level is interpretation, not fact.
        Telemetry must only contain observable events.
        
        This tests the "I'll add threat assessment" abuse.
        """
        with pytest.raises(ValueError) as exc:
            self.telemetry.emit('artifact.produced', {
                'artifact_type': 'DetectedTracks',
                'threat_level': 'critical'  # ❌ Interpretive field
            })
        
        # Verify it failed for forbidden field
        assert 'interpretive' in str(exc.value).lower()
        assert 'forbidden' in str(exc.value).lower()
    
    def test_rejects_action_required_field(self):
        """
        ABUSE ATTEMPT: Try to emit action required in telemetry.
        
        WHY THIS SHOULD FAIL:
        Action required is interpretation, not fact.
        Telemetry must only contain observable events.
        
        This tests the "I'll add recommendations" abuse.
        """
        with pytest.raises(ValueError) as exc:
            self.telemetry.emit('phase.completed', {
                'phase': 'phase3a_detect',
                'action_required': 'evacuate'  # ❌ Interpretive field
            })
        
        # Verify it failed for forbidden field
        assert 'interpretive' in str(exc.value).lower()
        assert 'forbidden' in str(exc.value).lower()
    
    def test_rejects_risk_level_field(self):
        """
        ABUSE ATTEMPT: Try to emit risk level in telemetry.
        
        WHY THIS SHOULD FAIL:
        Risk level is interpretation, not fact.
        Telemetry must only contain observable events.
        
        This tests the "I'll add risk assessment" abuse.
        """
        with pytest.raises(ValueError) as exc:
            self.telemetry.emit('artifact.produced', {
                'artifact_type': 'DetectedTracks',
                'risk_level': 'high'  # ❌ Interpretive field
            })
        
        # Verify it failed for forbidden field
        assert 'interpretive' in str(exc.value).lower()
        assert 'forbidden' in str(exc.value).lower()
    
    def test_rejects_urgency_field(self):
        """
        ABUSE ATTEMPT: Try to emit urgency in telemetry.
        
        WHY THIS SHOULD FAIL:
        Urgency is interpretation, not fact.
        Telemetry must only contain observable events.
        
        This tests the "I'll add urgency flags" abuse.
        """
        with pytest.raises(ValueError) as exc:
            self.telemetry.emit('phase.completed', {
                'phase': 'phase3a_detect',
                'urgency': 'immediate'  # ❌ Interpretive field
            })
        
        # Verify it failed for forbidden field
        assert 'interpretive' in str(exc.value).lower()
        assert 'forbidden' in str(exc.value).lower()
    
    def test_rejects_disallowed_event_types(self):
        """
        ABUSE ATTEMPT: Try to emit interpretive event types.
        
        WHY THIS SHOULD FAIL:
        Only factual event types are allowed.
        Interpretive event types are forbidden.
        
        This tests the "I'll create my own event type" abuse.
        """
        # Try various interpretive event types
        disallowed_events = [
            'threat.detected',
            'alert.generated',
            'severity.assessed',
            'recommendation.made',
            'decision.supported'
        ]
        
        for event_type in disallowed_events:
            with pytest.raises(ValueError) as exc:
                self.telemetry.emit(event_type, {
                    'phase': 'phase3a_detect'
                })
            
            # Verify it failed for disallowed event type
            assert 'disallowed' in str(exc.value).lower() or 'forbidden' in str(exc.value).lower()
    
    def test_allows_factual_events_only(self):
        """
        CONTROL TEST: Verify factual events are allowed.
        
        WHY THIS SHOULD SUCCEED:
        Factual events should be allowed.
        These are the only events System 1 should emit.
        
        This confirms the vocabulary is correctly constrained.
        """
        # These should all succeed
        factual_events = [
            ('phase.started', {'phase': 'phase1_ingest'}),
            ('phase.completed', {'phase': 'phase1_ingest', 'time_ms': 1000}),
            ('phase.failed', {'phase': 'phase2_features', 'error': 'test'}),
            ('artifact.produced', {'artifact_type': 'ForecastCube', 'path': '/tmp/data.zarr'}),
            ('artifact.loaded', {'artifact_type': 'IBTrACS', 'path': '/tmp/ibtracs.nc'}),
            ('contract.validated', {'phase': 'phase3a_detect', 'contract_type': 'input'}),
            ('guardrail.violated', {'phase': 'phase3a_detect', 'reason': 'synthetic_data'})
        ]
        
        for event_type, payload in factual_events:
            # Should not raise any exception
            self.telemetry.emit(event_type, payload)
        
        # Verify all events were stored
        assert len(self.telemetry.events) == len(factual_events)
    
    def test_cannot_bypass_vocabulary_check_with_casing_trick(self):
        """
        ABUSE ATTEMPT: Try to bypass vocabulary check with casing.
        
        WHY THIS SHOULD FAIL:
        Event type checking should be case-sensitive.
        Cannot bypass with different casing.
        
        This tests the "I'll use different casing" abuse.
        """
        with pytest.raises(ValueError) as exc:
            self.telemetry.emit('Threat.Detected', {  # Different casing
                'phase': 'phase3a_detect'
            })
        
        # Verify it failed for disallowed event type
        assert 'disallowed' in str(exc.value).lower() or 'forbidden' in str(exc.value).lower()
    
    def test_cannot_bypass_field_check_with_naming_trick(self):
        """
        ABUSE ATTEMPT: Try to bypass field check with naming.
        
        WHY THIS SHOULD FAIL:
        Forbidden field checking should be comprehensive.
        Cannot bypass with similar field names.
        
        This tests the "I'll use similar field names" abuse.
        """
        # Try variations of forbidden fields
        forbidden_variants = [
            'severity_level',  # Similar to 'severity'
            'threat_rating',   # Similar to 'threat_level'
            'risk_score',      # Similar to 'risk_level'
            'urgency_flag',    # Similar to 'urgency'
            'action_needed'     # Similar to 'action_required'
        ]
        
        for field_name in forbidden_variants:
            with pytest.raises(ValueError) as exc:
                self.telemetry.emit('artifact.produced', {
                    'artifact_type': 'DetectedTracks',
                    field_name: 'high'  # Try to bypass with similar name
                })
            
            # Should still detect as interpretive
            assert 'interpretive' in str(exc.value).lower() or 'forbidden' in str(exc.value).lower()


if __name__ == "__main__":
    # Run tests directly
    pytest.main([__file__, "-v"])
