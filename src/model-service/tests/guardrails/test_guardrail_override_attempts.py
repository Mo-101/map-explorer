"""
Guardrail Override Attempts Abuse Tests
====================================

PURPOSE:
    Prove that System 1 guardrails cannot be overridden or disabled.
    
TEST PHILOSOPHY:
    - Try every possible way to disable or bypass guardrails
    - Verify guardrails remain active and non-negotiable
    - Verify strict mode cannot be compromised
    
EXPECTED OUTCOME:
    All override tests MUST fail. If any test passes → System 1 is broken.
"""

import pytest
import sys
import os

# Add orchestrator to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'orchestrator'))

from moscripts_orchestrator import MoScriptsOrchestrator
from guardrails import Guardrails, FORBIDDEN_BEHAVIORS


class TestGuardrailOverrideAbuse:
    """Adversarial tests to break guardrail enforcement."""
    
    def test_cannot_disable_guardrails_with_strict_false(self):
        """
        ABUSE ATTEMPT: Try to disable guardrails with strict=False.
        
        WHY THIS SHOULD FAIL:
        Guardrails should remain active even in non-strict mode.
        Critical guardrails cannot be disabled.
        
        This tests the "I'll just turn off guardrails" abuse.
        """
        # Try to create orchestrator with guardrails disabled
        orchestrator = MoScriptsOrchestrator(strict_mode=False)
        
        # Try to run forbidden operation (synthetic data in Phase 3)
        with pytest.raises(Exception) as exc:
            orchestrator.run_phase('phase3a_detect', {
                'FeatureCube': '/tmp/synthetic_features.zarr'
            }, metadata={'synthetic': True})
        
        # Should still fail even with strict=False
        assert 'synthetic' in str(exc.value).lower() or 'forbidden' in str(exc.value).lower()
    
    def test_cannot_modify_forbidden_behaviors_at_runtime(self):
        """
        ABUSE ATTEMPT: Try to modify forbidden behaviors dict.
        
        WHY THIS SHOULD FAIL:
        FORBIDDEN_BEHAVIORS should be immutable.
        Cannot remove or modify forbidden behavior definitions.
        
        This tests the "I'll remove the rule" abuse.
        """
        # Try to modify forbidden behaviors
        original_behaviors = FORBIDDEN_BEHAVIORS.copy()
        
        try:
            # Try to remove synthetic data rule
            if 'synthetic_data_in_production' in FORBIDDEN_BEHAVIORS:
                del FORBIDDEN_BEHAVIORS['synthetic_data_in_production']
            
            # Try to run forbidden operation
            guardrails = Guardrails(strict=True)
            result = guardrails.check('phase3a_detect', {}, {'synthetic': True})
            
            # Should still be blocked
            assert result['allowed'] == False
            assert 'synthetic' in str(result['reason']).lower()
            
        except (AttributeError, TypeError):
            # If we can't modify it, that's even better
            pass
        
        finally:
            # Restore original behaviors
            FORBIDDEN_BEHAVIORS.clear()
            FORBIDDEN_BEHAVIORS.update(original_behaviors)
    
    def test_cannot_bypass_guardrails_with_metadata_override(self):
        """
        ABUSE ATTEMPT: Try to bypass guardrails with metadata.
        
        WHY THIS SHOULD FAIL:
        Guardrails should not be bypassable with metadata tricks.
        Cannot override safety checks with clever metadata.
        
        This tests the "I'll override with metadata" abuse.
        """
        orchestrator = MoScriptsOrchestrator(strict_mode=True)
        
        # Try to bypass with various metadata tricks
        bypass_attempts = [
            {'bypass_guardrails': True},
            {'disable_safety_checks': True},
            {'force_execution': True},
            {'override_restrictions': True},
            {'emergency_mode': True},
            {'production_override': True}
        ]
        
        for metadata in bypass_attempts:
            with pytest.raises(Exception) as exc:
                orchestrator.run_phase('phase3a_detect', {
                    'FeatureCube': '/tmp/synthetic_features.zarr'
                }, metadata=metadata)
            
            # Should still fail
            assert 'synthetic' in str(exc.value).lower() or 'forbidden' in str(exc.value).lower()
    
    def test_cannot_modify_guardrail_check_methods(self):
        """
        ABUSE ATTEMPT: Try to modify guardrail check methods.
        
        WHY THIS SHOULD FAIL:
        Guardrail check methods should be protected.
        Cannot modify safety logic at runtime.
        
        This tests the "I'll modify the check method" abuse.
        """
        guardrails = Guardrails(strict=True)
        
        try:
            # Try to replace check method
            def fake_check(*args, **kwargs):
                return {'allowed': True, 'reason': None, 'violations': []}
            
            guardrails.check = fake_check
            
            # Try to run forbidden operation
            result = guardrails.check('phase3a_detect', {}, {'synthetic': True})
            
            # Should still fail (method replacement shouldn't work)
            # If it does work, that's a security vulnerability
            if result['allowed']:
                pytest.fail("Guardrail method was successfully replaced - SECURITY BREACH")
                
        except (AttributeError, TypeError):
            # If we can't modify it, that's good
            pass
    
    def test_cannot_create_custom_guardrails_instance(self):
        """
        ABUSE ATTEMPT: Try to create custom guardrails instance.
        
        WHY THIS SHOULD FAIL:
        Should not be able to create guardrails with custom rules.
        Cannot bypass with custom implementation.
        
        This tests the "I'll create my own guardrails" abuse.
        """
        # Try to create guardrails with custom initialization
        try:
            custom_guardrails = Guardrails(
                strict=False,  # Try to disable
                custom_rules=True,  # Try to add custom rules
                bypass_mode=True  # Try to enable bypass
            )
            
            # If this succeeds, try to use it
            result = custom_guardrails.check('phase3a_detect', {}, {'synthetic': True})
            
            # Should still block
            if result['allowed']:
                pytest.fail("Custom guardrails allowed forbidden operation - SECURITY BREACH")
                
        except TypeError:
            # If custom parameters are rejected, that's good
            pass
    
    def test_cannot_use_reflection_to_bypass_guardrails(self):
        """
        ABUSE ATTEMPT: Try to use reflection to bypass guardrails.
        
        WHY THIS SHOULD FAIL:
        Should not be able to access private methods or attributes.
        Cannot bypass safety through introspection.
        
        This tests the "I'll use reflection to access private methods" abuse.
        """
        guardrails = Guardrails(strict=True)
        
        # Try to access private methods
        private_methods = [
            '_check_synthetic_data',
            '_check_phase_skipping',
            '_check_model_mixing',
            '_check_validation_skipping'
        ]
        
        for method_name in private_methods:
            # Try to access private method
            method = getattr(guardrails, method_name, None)
            
            # If we can access it, try to modify it
            if method is not None and callable(method):
                try:
                    # Try to replace with always-allow function
                    def always_allow(*args, **kwargs):
                        return False  # Don't detect violations
                    
                    setattr(guardrails, method_name, always_allow)
                    
                    # Test if bypass worked
                    result = guardrails.check('phase3a_detect', {}, {'synthetic': True})
                    
                    if result['allowed']:
                        pytest.fail(f"Private method {method_name} was bypassed - SECURITY BREACH")
                        
                except (AttributeError, TypeError):
                    # If we can't modify it, that's good
                    pass
    
    def test_cannot_disable_telemetry_validation(self):
        """
        ABUSE ATTEMPT: Try to disable telemetry validation.
        
        WHY THIS SHOULD FAIL:
        Telemetry validation should always be active.
        Cannot disable interpretive event blocking.
        
        This tests the "I'll disable telemetry validation" abuse.
        """
        from telemetry import Telemetry
        
        # Try to create telemetry with validation disabled
        try:
            telemetry = Telemetry(enabled=True, validate_events=False)  # Try to disable validation
            
            # Try to emit interpretive event
            telemetry.emit('threat.detected', {
                'severity': 'high',
                'confidence': 0.95
            })
            
            # Should have failed
            pytest.fail("Telemetry validation was disabled - SECURITY BREACH")
            
        except TypeError:
            # If validation parameter is rejected, that's good
            pass
    
    def test_cannot_modify_allowed_events_list(self):
        """
        ABUSE ATTEMPT: Try to modify allowed events list.
        
        WHY THIS SHOULD FAIL:
        ALLOWED_EVENTS should be immutable.
        Cannot add interpretive event types.
        
        This tests the "I'll add my own event types" abuse.
        """
        from telemetry import Telemetry
        
        telemetry = Telemetry(enabled=True)
        
        try:
            # Try to add interpretive event types
            telemetry.ALLOWED_EVENTS.add('threat.detected')
            telemetry.ALLOWED_EVENTS.add('alert.generated')
            telemetry.ALLOWED_EVENTS.add('severity.assessed')
            
            # Try to emit interpretive events
            telemetry.emit('threat.detected', {'severity': 'high'})
            
            # Should still fail
            pytest.fail("ALLOWED_EVENTS was modified - SECURITY BREACH")
            
        except (AttributeError, TypeError):
            # If we can't modify it, that's good
            pass
    
    def test_guardrails_remain_active_across_instances(self):
        """
        CONTROL TEST: Verify guardrails remain active across instances.
        
        WHY THIS SHOULD SUCCEED:
        Guardrails should be consistently enforced.
        No instance should have weaker guardrails.
        
        This confirms guardrail consistency.
        """
        # Create multiple orchestrator instances
        instances = [
            MoScriptsOrchestrator(strict_mode=True),
            MoScriptsOrchestrator(strict_mode=False),
            MoScriptsOrchestrator(strict_mode=True)
        ]
        
        # All instances should enforce guardrails
        for i, orchestrator in enumerate(instances):
            with pytest.raises(Exception) as exc:
                orchestrator.run_phase('phase3a_detect', {
                    'FeatureCube': '/tmp/synthetic_features.zarr'
                }, metadata={'synthetic': True})
            
            # All should fail
            assert 'synthetic' in str(exc.value).lower() or 'forbidden' in str(exc.value).lower()


if __name__ == "__main__":
    # Run tests directly
    pytest.main([__file__, "-v"])
