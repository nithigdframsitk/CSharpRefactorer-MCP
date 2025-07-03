#!/usr/bin/env node

/**
 * End-to-end test for the C# Refactorer Simple MCP Server
 * This test creates actual output files and validates them
 */

const { CSharpRefactorer } = require('./csharp_refactorer_simple.js');
const fs = require('fs').promises;
const path = require('path');

async function runEndToEndTest() {
    console.log('🚀 Running End-to-End Test for C# Refactorer Simple\n');
    
    const outputDir = './test_output_e2e';
    const testPassed = [];
    const testFailed = [];
    
    try {
        // Step 1: Clean up any existing output
        console.log('Step 1: Cleaning up existing output...');
        try {
            const files = await fs.readdir(outputDir);
            for (const file of files) {
                await fs.unlink(path.join(outputDir, file));
            }
            await fs.rmdir(outputDir);
        } catch (error) {
            // Directory doesn't exist, which is fine
        }
        console.log('✅ Cleanup completed');
        
        // Step 2: Create refactorer instance and parse source
        console.log('\nStep 2: Creating refactorer and parsing source...');
        const refactorer = new CSharpRefactorer();
        await refactorer.parseSourceFile('./test_sample.cs');
        
        const methodCount = Object.keys(refactorer.methods).length;
        console.log(`✅ Parsed ${methodCount} methods from source file`);
        
        // Step 3: Create output directory
        console.log('\nStep 3: Creating output directory...');
        await fs.mkdir(outputDir, { recursive: true });
        console.log('✅ Output directory created');
        
        // Step 4: Generate partial class files
        console.log('\nStep 4: Generating partial class files...');
        
        const partialClasses = [
            {
                fileName: 'TestUtility.UserManagement.cs',
                methods: ['GetUserAsync', 'GetUser', 'SaveUserAsync', 'DeleteUser']
            },
            {
                fileName: 'TestUtility.DataProcessing.cs',
                methods: ['ProcessDataAsync<T>', 'ValidateInput', 'CalculateResults', 'GenerateReportAsync']
            },
            {
                fileName: 'TestUtility.Utilities.cs',
                methods: ['FormatString', 'ConvertData<T>', 'SendNotification']
            },
            {
                fileName: 'TestUtility.Configuration.cs',
                methods: ['GetConfigValue', 'SetConfigValue', 'GetAllConfigAsync']
            }
        ];
        
        const generatedFiles = [];
        
        for (const partialClass of partialClasses) {
            try {
                const content = await refactorer.generatePartialClass(partialClass, 'TestNamespace.Refactored');
                const filePath = path.join(outputDir, partialClass.fileName);
                await fs.writeFile(filePath, content, 'utf-8');
                generatedFiles.push(partialClass.fileName);
                console.log(`✅ Generated ${partialClass.fileName} (${partialClass.methods.length} methods)`);
            } catch (error) {
                console.log(`❌ Failed to generate ${partialClass.fileName}: ${error.message}`);
                testFailed.push(`Generate ${partialClass.fileName}`);
            }
        }
        
        // Step 5: Generate main partial class
        console.log('\nStep 5: Generating main partial class...');
        const mainContent = refactorer.generateMainPartialClass('TestNamespace.Refactored', 'TestUtility.Core.cs');
        const mainFilePath = path.join(outputDir, 'TestUtility.Core.cs');
        await fs.writeFile(mainFilePath, mainContent, 'utf-8');
        generatedFiles.push('TestUtility.Core.cs');
        console.log('✅ Generated TestUtility.Core.cs (main partial class)');
        
        // Step 6: Validate generated files
        console.log('\nStep 6: Validating generated files...');
        
        for (const fileName of generatedFiles) {
            try {
                const filePath = path.join(outputDir, fileName);
                const fileContent = await fs.readFile(filePath, 'utf-8');
                
                // Basic validation
                const validations = [
                    { test: fileContent.includes('namespace TestNamespace.Refactored'), desc: 'Contains correct namespace' },
                    { test: fileContent.includes('public partial class TestUtility'), desc: 'Contains partial class declaration' },
                    { test: fileContent.includes('using System'), desc: 'Contains using statements' },
                    { test: fileContent.length > 100, desc: 'Has reasonable content length' }
                ];
                
                let fileValid = true;
                for (const validation of validations) {
                    if (!validation.test) {
                        console.log(`❌ ${fileName}: ${validation.desc} - FAILED`);
                        fileValid = false;
                    }
                }
                
                if (fileValid) {
                    console.log(`✅ ${fileName}: All validations passed`);
                    testPassed.push(`Validate ${fileName}`);
                } else {
                    testFailed.push(`Validate ${fileName}`);
                }
                
            } catch (error) {
                console.log(`❌ Failed to validate ${fileName}: ${error.message}`);
                testFailed.push(`Validate ${fileName}`);
            }
        }
        
        // Step 7: Check for method distribution
        console.log('\nStep 7: Checking method distribution...');
        
        const expectedMethods = {
            'TestUtility.UserManagement.cs': ['GetUserAsync', 'GetUser', 'SaveUserAsync', 'DeleteUser'],
            'TestUtility.DataProcessing.cs': ['ProcessDataAsync<T>', 'ValidateInput', 'CalculateResults', 'GenerateReportAsync'],
            'TestUtility.Utilities.cs': ['FormatString', 'ConvertData<T>', 'SendNotification'],
            'TestUtility.Configuration.cs': ['GetConfigValue', 'SetConfigValue', 'GetAllConfigAsync']
        };
        
        for (const [fileName, methods] of Object.entries(expectedMethods)) {
            try {
                const filePath = path.join(outputDir, fileName);
                const fileContent = await fs.readFile(filePath, 'utf-8');
                
                let methodsFound = 0;
                for (const method of methods) {
                    if (fileContent.includes(method)) {
                        methodsFound++;
                    }
                }
                
                if (methodsFound === methods.length) {
                    console.log(`✅ ${fileName}: All ${methods.length} methods found`);
                    testPassed.push(`Method distribution ${fileName}`);
                } else {
                    console.log(`❌ ${fileName}: Only ${methodsFound}/${methods.length} methods found`);
                    testFailed.push(`Method distribution ${fileName}`);
                }
                
            } catch (error) {
                console.log(`❌ Failed to check method distribution for ${fileName}: ${error.message}`);
                testFailed.push(`Method distribution ${fileName}`);
            }
        }
        
        // Step 8: Test duplicate method handling
        console.log('\nStep 8: Testing duplicate method handling...');
        
        const refactorer2 = new CSharpRefactorer();
        await refactorer2.parseSourceFile('./test_sample.cs');
        
        // First process some methods
        const firstConfig = {
            fileName: 'TestUtility.First.cs',
            methods: ['GetUserAsync', 'SaveUserAsync']
        };
        
        await refactorer2.generatePartialClass(firstConfig, 'TestNamespace.Refactored');
        
        // Then try to process the same methods again
        const secondConfig = {
            fileName: 'TestUtility.Second.cs',
            methods: ['GetUserAsync', 'SaveUserAsync', 'DeleteUser']
        };
        
        const secondContent = await refactorer2.generatePartialClass(secondConfig, 'TestNamespace.Refactored');
        
        if (secondContent.includes('DeleteUser') && !secondContent.includes('GetUserAsync')) {
            console.log('✅ Duplicate method handling works correctly');
            testPassed.push('Duplicate method handling');
        } else {
            console.log('❌ Duplicate method handling failed');
            testFailed.push('Duplicate method handling');
        }
        
        // Step 9: Print summary
        console.log('\n' + '='.repeat(60));
        console.log('📊 END-TO-END TEST SUMMARY');
        console.log('='.repeat(60));
        console.log(`Generated Files: ${generatedFiles.length}`);
        console.log(`Tests Passed: ${testPassed.length}`);
        console.log(`Tests Failed: ${testFailed.length}`);
        console.log(`Total Tests: ${testPassed.length + testFailed.length}`);
        
        if (testFailed.length === 0) {
            console.log('\n🎉 ALL TESTS PASSED!');
            console.log('The C# Refactorer Simple is working perfectly!');
        } else {
            console.log('\n❌ SOME TESTS FAILED');
            console.log('Failed tests:', testFailed.join(', '));
        }
        
        console.log('\n📁 Generated files are in:', path.resolve(outputDir));
        console.log('You can examine them to verify the output quality.');
        
    } catch (error) {
        console.error('❌ End-to-end test failed:', error.message);
        console.error('Stack trace:', error.stack);
    }
}

// Run the test
if (require.main === module) {
    runEndToEndTest();
}

module.exports = { runEndToEndTest };
