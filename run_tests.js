#!/usr/bin/env node

/**
 * Simple test runner for the C# Refactorer Simple MCP Server
 * This script performs basic validation of the key functionality
 */

const { CSharpRefactorer } = require('./csharp_refactorer_simple.js');
const fs = require('fs').promises;
const path = require('path');

async function runBasicTests() {
    console.log('🧪 Running Basic Tests for C# Refactorer Simple...\n');
    
    let passed = 0;
    let total = 0;
    
    try {
        // Test 1: Parse source file
        total++;
        console.log('Test 1: Parsing source file...');
        const refactorer = new CSharpRefactorer();
        await refactorer.parseSourceFile('./test_sample.cs');
        
        if (Object.keys(refactorer.methods).length > 0) {
            console.log('✅ Source file parsed successfully');
            passed++;
        } else {
            console.log('❌ No methods found in source file');
        }
        
        // Test 2: Check method grouping by name
        total++;
        console.log('\nTest 2: Checking method grouping by name...');
        const methodNames = Object.keys(refactorer.methodsByName);
        
        if (methodNames.includes('GetUserAsync') && methodNames.includes('SaveUserAsync')) {
            console.log('✅ Methods grouped by name correctly');
            passed++;
        } else {
            console.log('❌ Methods not grouped correctly');
        }
        
        // Test 3: Find method by name
        total++;
        console.log('\nTest 3: Finding method by name...');
        const method = refactorer.findMethodByName('GetUserAsync');
        
        if (method && method.content.includes('GetUserAsync')) {
            console.log('✅ Method found by name successfully');
            passed++;
        } else {
            console.log('❌ Method not found by name');
        }
        
        // Test 4: Generate partial class
        total++;
        console.log('\nTest 4: Generating partial class...');
        const partialClassConfig = {
            fileName: 'TestUtility.UserManagement.cs',
            methods: ['GetUserAsync', 'SaveUserAsync']
        };
        
        const content = await refactorer.generatePartialClass(partialClassConfig, 'TestNamespace.Refactored');
        
        if (content.includes('namespace TestNamespace.Refactored') && 
            content.includes('public partial class TestUtility') &&
            content.includes('GetUserAsync')) {
            console.log('✅ Partial class generated successfully');
            passed++;
        } else {
            console.log('❌ Partial class generation failed');
        }
        
        // Test 5: Handle non-existent method
        total++;
        console.log('\nTest 5: Handling non-existent method...');
        const invalidConfig = {
            fileName: 'TestUtility.Invalid.cs',
            methods: ['NonExistentMethod']
        };
        
        try {
            await refactorer.generatePartialClass(invalidConfig, 'TestNamespace.Refactored');
            console.log('❌ Should have thrown error for non-existent method');
        } catch (error) {
            if (error.message.includes('not found in source code')) {
                console.log('✅ Non-existent method handled correctly');
                passed++;
            } else {
                console.log('❌ Wrong error message for non-existent method');
            }
        }
        
        // Test 6: Handle duplicate methods
        total++;
        console.log('\nTest 6: Handling duplicate methods...');
        const refactorer2 = new CSharpRefactorer();
        await refactorer2.parseSourceFile('./test_sample.cs');
        
        // Process first method
        const config1 = {
            fileName: 'TestUtility.First.cs',
            methods: ['GetUserAsync']
        };
        await refactorer2.generatePartialClass(config1, 'TestNamespace.Refactored');
        
        // Process second config with same method (should be skipped)
        const config2 = {
            fileName: 'TestUtility.Second.cs',
            methods: ['GetUserAsync', 'SaveUserAsync']
        };
        const content2 = await refactorer2.generatePartialClass(config2, 'TestNamespace.Refactored');
        
        if (content2.includes('SaveUserAsync') && !content2.includes('GetUserAsync')) {
            console.log('✅ Duplicate methods handled correctly');
            passed++;
        } else {
            console.log('❌ Duplicate methods not handled correctly');
        }
        
        // Test 7: List method names
        total++;
        console.log('\nTest 7: Listing method names...');
        const methodNames2 = refactorer.getAvailableMethodNames();
        
        if (methodNames2.length > 0 && methodNames2.includes('GetUserAsync')) {
            console.log('✅ Method names listed successfully');
            passed++;
        } else {
            console.log('❌ Method names not listed correctly');
        }
        
        // Print summary
        console.log('\n' + '='.repeat(50));
        console.log('📊 TEST SUMMARY');
        console.log('='.repeat(50));
        console.log(`Total Tests: ${total}`);
        console.log(`Passed: ${passed}`);
        console.log(`Failed: ${total - passed}`);
        console.log(`Success Rate: ${Math.round((passed / total) * 100)}%`);
        
        if (passed === total) {
            console.log('\n🎉 ALL TESTS PASSED!');
            console.log('The C# Refactorer Simple is working correctly.');
        } else {
            console.log('\n❌ SOME TESTS FAILED');
            console.log('Please check the implementation.');
        }
        
    } catch (error) {
        console.error('❌ Test suite failed:', error.message);
        console.error('Stack trace:', error.stack);
    }
}

// Run the tests
if (require.main === module) {
    runBasicTests();
}

module.exports = { runBasicTests };
