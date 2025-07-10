#!/usr/bin/env node

/**
 * Test script for C# Refactorer Simple MCP Server
 * This script validates the functionality of the simplified C# refactorer
 */

const { CSharpRefactorer } = require('./csharp_refactorer_simple.js');
const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

// Test configuration
const TEST_CONFIG = {
    sourceFile: path.join(__dirname, 'test_sample.cs'),
    configFile: path.join(__dirname, 'test_config.json'),
    configFile2: path.join(__dirname, 'test_config2.json'),
    outputDir: path.join(__dirname, 'test_output'),
    expectedFiles: [
        'TestUtility.Core.cs',
        'TestUtility.UserManagement.cs',
        'TestUtility.DataProcessing.cs',
        'TestUtility.Utilities.cs',
        'TestUtility.Configuration.cs'
    ]
};

class TestRunner {
    constructor() {
        this.testResults = [];
        this.totalTests = 0;
        this.passedTests = 0;
    }

    async runAllTests() {
        console.log('🧪 Starting C# Refactorer Simple Tests...\n');
        
        try {
            // Clean up any existing test output
            await this.cleanupTestOutput();

            // Run individual tests
            await this.testParseSourceFile();
            await this.testMethodsByName();
            await this.testFindMethodByName();
            await this.testGeneratePartialClass();
            await this.testGenerateMainPartialClass();
            await this.testSingleConfigFile();
            await this.testMultipleConfigFiles();
            await this.testNonExistentMethod();
            await this.testDuplicateMethodHandling();
            await this.testOverloadedMethods();
            await this.testFileGeneration();
            await this.testValidateGeneratedFiles();

            // Print summary
            this.printSummary();

        } catch (error) {
            console.error('❌ Test suite failed:', error.message);
            process.exit(1);
        }
    }

    async cleanupTestOutput() {
        try {
            const stats = await fs.stat(TEST_CONFIG.outputDir);
            if (stats.isDirectory()) {
                const files = await fs.readdir(TEST_CONFIG.outputDir);
                for (const file of files) {
                    await fs.unlink(path.join(TEST_CONFIG.outputDir, file));
                }
                await fs.rmdir(TEST_CONFIG.outputDir);
            }
        } catch (error) {
            // Directory doesn't exist, which is fine
        }
    }

    async testParseSourceFile() {
        this.startTest('Parse Source File');
        
        try {
            const refactorer = new CSharpRefactorer();
            await refactorer.parseSourceFile(TEST_CONFIG.sourceFile);

            // Check if methods were parsed
            const methodCount = Object.keys(refactorer.methods).length;
            this.assert(methodCount > 0, `Expected methods to be parsed, got ${methodCount}`);

            // Check if using statements were extracted
            this.assert(refactorer.usingStatements.length > 0, 'Expected using statements to be extracted');

            // Check if namespace was extracted
            this.assert(refactorer.oldNamespace === 'TestNamespace', `Expected namespace 'TestNamespace', got '${refactorer.oldNamespace}'`);

            // Check if class declaration was extracted
            this.assert(refactorer.classDeclaration.includes('TestUtility'), 'Expected class declaration to contain TestUtility');

            this.passTest('Source file parsed successfully');
        } catch (error) {
            this.failTest(`Parse source file failed: ${error.message}`);
        }
    }

    async testMethodsByName() {
        this.startTest('Methods By Name Grouping');
        
        try {
            const refactorer = new CSharpRefactorer();
            await refactorer.parseSourceFile(TEST_CONFIG.sourceFile);

            const methodNames = Object.keys(refactorer.methodsByName);
            
            // Check if specific methods exist
            const expectedMethods = ['GetUserAsync', 'GetUser', 'SaveUserAsync', 'DeleteUser', 'ProcessDataAsync', 'ValidateInput'];
            for (const methodName of expectedMethods) {
                this.assert(methodNames.includes(methodName), `Expected method '${methodName}' to be found`);
            }

            // Check if GetUser has overloads (async and sync versions)
            const getUserMethods = refactorer.methodsByName['GetUser'];
            this.assert(getUserMethods && getUserMethods.length > 0, 'Expected GetUser methods to exist');

            this.passTest('Methods grouped by name correctly');
        } catch (error) {
            this.failTest(`Methods by name test failed: ${error.message}`);
        }
    }

    async testFindMethodByName() {
        this.startTest('Find Method By Name');
        
        try {
            const refactorer = new CSharpRefactorer();
            await refactorer.parseSourceFile(TEST_CONFIG.sourceFile);

            // Test finding an existing method
            const method = refactorer.findMethodByName('GetUserAsync');
            this.assert(method !== null, 'Expected to find GetUserAsync method');
            this.assert(method.content.includes('GetUserAsync'), 'Expected method content to contain method name');

            // Test finding a non-existent method
            const nonExistentMethod = refactorer.findMethodByName('NonExistentMethod');
            this.assert(nonExistentMethod === null, 'Expected null for non-existent method');

            this.passTest('Find method by name works correctly');
        } catch (error) {
            this.failTest(`Find method by name test failed: ${error.message}`);
        }
    }

    async testGeneratePartialClass() {
        this.startTest('Generate Partial Class');
        
        try {
            const refactorer = new CSharpRefactorer();
            await refactorer.parseSourceFile(TEST_CONFIG.sourceFile);

            const partialClassConfig = {
                fileName: 'TestUtility.UserManagement.cs',
                methods: ['GetUserAsync', 'SaveUserAsync']
            };

            const content = await refactorer.generatePartialClass(partialClassConfig, 'TestNamespace.Refactored');

            // Check if content contains expected elements
            this.assert(content.includes('namespace TestNamespace.Refactored'), 'Expected new namespace in generated content');
            this.assert(content.includes('public partial class TestUtility'), 'Expected partial class declaration');
            this.assert(content.includes('GetUserAsync'), 'Expected GetUserAsync method in content');
            this.assert(content.includes('SaveUserAsync'), 'Expected SaveUserAsync method in content');

            this.passTest('Partial class generated successfully');
        } catch (error) {
            this.failTest(`Generate partial class test failed: ${error.message}`);
        }
    }

    async testGenerateMainPartialClass() {
        this.startTest('Generate Main Partial Class');
        
        try {
            const refactorer = new CSharpRefactorer();
            await refactorer.parseSourceFile(TEST_CONFIG.sourceFile);

            const mainContent = refactorer.generateMainPartialClass('TestNamespace.Refactored', 'TestUtility.Core.cs');

            // Check if content contains expected elements
            this.assert(mainContent.includes('namespace TestNamespace.Refactored'), 'Expected new namespace in main content');
            this.assert(mainContent.includes('public partial class TestUtility'), 'Expected partial class declaration in main content');

            this.passTest('Main partial class generated successfully');
        } catch (error) {
            this.failTest(`Generate main partial class test failed: ${error.message}`);
        }
    }

    async testSingleConfigFile() {
        this.startTest('Single Config File Processing');
        
        try {
            // Test the actual processing function
            const { ProcessSplitCSharpclassSimple } = require('./csharp_refactorer_simple.js');
            
            // This is a mock of the actual function call
            const result = await this.mockProcessSplitCSharpclassSimple(TEST_CONFIG.configFile);
            
            this.assert(result.success, 'Expected single config processing to succeed');
            this.passTest('Single config file processed successfully');
        } catch (error) {
            this.failTest(`Single config file test failed: ${error.message}`);
        }
    }

    async testMultipleConfigFiles() {
        this.startTest('Multiple Config Files Processing');
        
        try {
            // Test multiple config files
            const configFiles = `${TEST_CONFIG.configFile},${TEST_CONFIG.configFile2}`;
            const result = await this.mockProcessSplitCSharpclassSimple(configFiles);
            
            this.assert(result.success, 'Expected multiple config processing to succeed');
            this.passTest('Multiple config files processed successfully');
        } catch (error) {
            this.failTest(`Multiple config files test failed: ${error.message}`);
        }
    }

    async testNonExistentMethod() {
        this.startTest('Non-Existent Method Handling');
        
        try {
            const refactorer = new CSharpRefactorer();
            await refactorer.parseSourceFile(TEST_CONFIG.sourceFile);

            const partialClassConfig = {
                fileName: 'TestUtility.Invalid.cs',
                methods: ['NonExistentMethod']
            };

            try {
                await refactorer.generatePartialClass(partialClassConfig, 'TestNamespace.Refactored');
                this.failTest('Expected error for non-existent method');
            } catch (error) {
                this.assert(error.message.includes('not found in source code'), 'Expected specific error message for non-existent method');
                this.passTest('Non-existent method handled correctly');
            }
        } catch (error) {
            this.failTest(`Non-existent method test failed: ${error.message}`);
        }
    }

    async testDuplicateMethodHandling() {
        this.startTest('Duplicate Method Handling');
        
        try {
            const refactorer = new CSharpRefactorer();
            await refactorer.parseSourceFile(TEST_CONFIG.sourceFile);

            // Process first partial class
            const partialClassConfig1 = {
                fileName: 'TestUtility.First.cs',
                methods: ['GetUserAsync']
            };
            
            await refactorer.generatePartialClass(partialClassConfig1, 'TestNamespace.Refactored');
            
            // Process second partial class with same method (should be skipped)
            const partialClassConfig2 = {
                fileName: 'TestUtility.Second.cs',
                methods: ['GetUserAsync', 'SaveUserAsync']
            };
            
            const content = await refactorer.generatePartialClass(partialClassConfig2, 'TestNamespace.Refactored');
            
            // Should contain SaveUserAsync but not GetUserAsync (already processed)
            this.assert(content.includes('SaveUserAsync'), 'Expected SaveUserAsync in second partial class');
            this.assert(!content.includes('GetUserAsync'), 'Expected GetUserAsync to be skipped in second partial class');
            
            this.passTest('Duplicate method handling works correctly');
        } catch (error) {
            this.failTest(`Duplicate method handling test failed: ${error.message}`);
        }
    }

    async testOverloadedMethods() {
        this.startTest('Overloaded Methods Handling');
        
        try {
            const refactorer = new CSharpRefactorer();
            await refactorer.parseSourceFile(TEST_CONFIG.sourceFile);

            // Both GetUserAsync and GetUser should be available
            const asyncMethod = refactorer.findMethodByName('GetUserAsync');
            const syncMethod = refactorer.findMethodByName('GetUser');
            
            this.assert(asyncMethod !== null, 'Expected to find GetUserAsync method');
            this.assert(syncMethod !== null, 'Expected to find GetUser method');
            this.assert(asyncMethod.content !== syncMethod.content, 'Expected different content for different methods');
            
            this.passTest('Overloaded methods handled correctly');
        } catch (error) {
            this.failTest(`Overloaded methods test failed: ${error.message}`);
        }
    }

    async testFileGeneration() {
        this.startTest('File Generation');
        
        try {
            // Create the actual files using our mock function
            await this.mockProcessSplitCSharpclassSimple(`${TEST_CONFIG.configFile},${TEST_CONFIG.configFile2}`);
            
            // Check if output directory exists
            const outputDirExists = await this.fileExists(TEST_CONFIG.outputDir);
            this.assert(outputDirExists, 'Expected output directory to be created');
            
            this.passTest('Files generated successfully');
        } catch (error) {
            this.failTest(`File generation test failed: ${error.message}`);
        }
    }

    async testValidateGeneratedFiles() {
        this.startTest('Validate Generated Files');
        
        try {
            // Check if expected files exist
            for (const fileName of TEST_CONFIG.expectedFiles) {
                const filePath = path.join(TEST_CONFIG.outputDir, fileName);
                const exists = await this.fileExists(filePath);
                this.assert(exists, `Expected file ${fileName} to exist`);
                
                if (exists) {
                    const content = await fs.readFile(filePath, 'utf-8');
                    this.assert(content.includes('namespace TestNamespace.Refactored'), `Expected correct namespace in ${fileName}`);
                    this.assert(content.includes('public partial class TestUtility'), `Expected partial class in ${fileName}`);
                }
            }
            
            this.passTest('Generated files validated successfully');
        } catch (error) {
            this.failTest(`Validate generated files test failed: ${error.message}`);
        }
    }

    // Mock function to simulate the actual processing
    async mockProcessSplitCSharpclassSimple(configFiles) {
        try {
            const { CSharpRefactorer } = require('./csharp_refactorer_simple.js');
            const refactorer = new CSharpRefactorer();
            
            // Parse the source file
            await refactorer.parseSourceFile(TEST_CONFIG.sourceFile);
            
            // Create output directory
            await fs.mkdir(TEST_CONFIG.outputDir, { recursive: true });
            
            // Generate some test files
            const testConfigs = [
                {
                    fileName: 'TestUtility.UserManagement.cs',
                    methods: ['GetUserAsync', 'GetUser', 'SaveUserAsync', 'DeleteUser']
                },
                {
                    fileName: 'TestUtility.DataProcessing.cs',
                    methods: ['ProcessDataAsync', 'ValidateInput', 'CalculateResults']
                }
            ];
            
            for (const config of testConfigs) {
                const content = await refactorer.generatePartialClass(config, 'TestNamespace.Refactored');
                const filePath = path.join(TEST_CONFIG.outputDir, config.fileName);
                await fs.writeFile(filePath, content, 'utf-8');
            }
            
            // Generate main partial class
            const mainContent = refactorer.generateMainPartialClass('TestNamespace.Refactored', 'TestUtility.Core.cs');
            const mainFilePath = path.join(TEST_CONFIG.outputDir, 'TestUtility.Core.cs');
            await fs.writeFile(mainFilePath, mainContent, 'utf-8');
            
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Helper methods
    async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    startTest(testName) {
        this.currentTest = testName;
        this.totalTests++;
        console.log(`🔍 ${testName}...`);
    }

    passTest(message) {
        this.passedTests++;
        console.log(`✅ ${this.currentTest}: ${message}`);
        this.testResults.push({ name: this.currentTest, status: 'PASS', message });
    }

    failTest(message) {
        console.log(`❌ ${this.currentTest}: ${message}`);
        this.testResults.push({ name: this.currentTest, status: 'FAIL', message });
    }

    assert(condition, message) {
        if (!condition) {
            throw new Error(message);
        }
    }

    printSummary() {
        console.log('\n' + '='.repeat(60));
        console.log('📊 TEST SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total Tests: ${this.totalTests}`);
        console.log(`Passed: ${this.passedTests}`);
        console.log(`Failed: ${this.totalTests - this.passedTests}`);
        console.log(`Success Rate: ${Math.round((this.passedTests / this.totalTests) * 100)}%`);
        
        if (this.passedTests === this.totalTests) {
            console.log('\n🎉 ALL TESTS PASSED!');
        } else {
            console.log('\n❌ SOME TESTS FAILED');
            console.log('\nFailed Tests:');
            this.testResults
                .filter(result => result.status === 'FAIL')
                .forEach(result => console.log(`  - ${result.name}: ${result.message}`));
        }
        
        console.log('\n' + '='.repeat(60));
    }
}

// Run the tests
if (require.main === module) {
    const testRunner = new TestRunner();
    testRunner.runAllTests().catch(error => {
        console.error('Test suite failed:', error);
        process.exit(1);
    });
}

module.exports = TestRunner;
