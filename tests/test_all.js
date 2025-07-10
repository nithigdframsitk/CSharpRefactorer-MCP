#!/usr/bin/env node

/**
 * Complete Test Suite for C# Refactorer Simple MCP Server
 * Runs all tests to validate the entire system
 */

const { runBasicTests } = require('./run_tests.js');
const { runIntegrationTests } = require('./integration_tests.js');
const { runEndToEndTest } = require('./e2e_test.js');

async function runAllTests() {
    console.log('🚀 RUNNING COMPLETE TEST SUITE FOR C# REFACTORER SIMPLE');
    console.log('='.repeat(70));
    console.log('This test suite validates all aspects of the C# Refactorer Simple MCP Server');
    console.log('='.repeat(70));
    
    try {
        // Run basic tests
        console.log('\n📋 Phase 1: Basic Functionality Tests');
        console.log('-'.repeat(40));
        await runBasicTests();
        
        // Run integration tests  
        console.log('\n📋 Phase 2: Integration Tests');
        console.log('-'.repeat(40));
        await runIntegrationTests();
        
        // Run end-to-end tests
        console.log('\n📋 Phase 3: End-to-End Tests');
        console.log('-'.repeat(40));
        await runEndToEndTest();
        
        // Final summary
        console.log('\n' + '='.repeat(70));
        console.log('🎉 COMPLETE TEST SUITE FINISHED!');
        console.log('='.repeat(70));
        console.log('✅ Basic Functionality Tests: PASSED');
        console.log('✅ Integration Tests: PASSED');
        console.log('✅ End-to-End Tests: PASSED');
        console.log('');
        console.log('🏆 ALL TESTS PASSED SUCCESSFULLY!');
        console.log('The C# Refactorer Simple MCP Server is fully validated and ready for use.');
        console.log('');
        console.log('📁 Generated test files are available in:');
        console.log('   - ./test_output_e2e/ (End-to-end test results)');
        console.log('');
        console.log('🚀 You can now use the server with confidence!');
        console.log('='.repeat(70));
        
    } catch (error) {
        console.error('\n❌ TEST SUITE FAILED:', error.message);
        console.error('Please check the individual test outputs for details.');
        process.exit(1);
    }
}

// Run the complete test suite
if (require.main === module) {
    runAllTests();
}

module.exports = { runAllTests };
