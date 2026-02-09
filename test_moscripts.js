// Simple test to verify MoScripts imports work
console.log('🔥 Testing MoScripts Integration...');

try {
    // Test if we can import the orchestrator
    const { orchestrator } = require('./src/moscripts/orchestrator/orchestrator.ts');
    console.log('✅ Orchestrator imported successfully');
    
    // Test if we can import the threat renderer
    const { mo_THREAT_RENDERER } = require('./src/moscripts/visualization/mo-threat-renderer-001.ts');
    console.log('✅ Threat renderer imported successfully');
    
    // Register the MoScript
    orchestrator.register(mo_THREAT_RENDERER);
    console.log('✅ MoScript registered successfully');
    
    // Get stats
    const stats = orchestrator.getStats();
    console.log('📊 Orchestrator stats:', stats);
    
    // Get registered scripts
    const scripts = orchestrator.getRegisteredScripts();
    console.log('📋 Registered scripts:', scripts);
    
    console.log('🎉 MoScripts integration test PASSED!');
    
} catch (error) {
    console.error('❌ MoScripts integration test FAILED:', error.message);
    console.error('Stack:', error.stack);
}
