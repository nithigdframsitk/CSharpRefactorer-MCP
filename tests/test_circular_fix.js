/**
 * Test script to validate the circular dependency detection fix
 */

const { CSharpRefactorer } = require('./csharp_refactorer');
const fs = require('fs');

// Create a test C# class with various dependency scenarios
const testClassContent = `
using System;

public class TestClass 
{
    // Method that doesn't call anything - should not be marked as circular
    public void SimpleMethod()
    {
        Console.WriteLine("Simple method");
    }
    
    // Method that calls another method - should not be marked as circular
    public void CallerMethod()
    {
        SimpleMethod();
        Console.WriteLine("Caller method");
    }
    
    // Method with direct recursion - should be marked as circular
    public void DirectRecursion(int count)
    {
        if (count > 0)
        {
            DirectRecursion(count - 1);
        }
    }
    
    // Methods with indirect recursion - should be marked as circular
    public void IndirectA()
    {
        IndirectB();
    }
    
    public void IndirectB()
    {
        IndirectA();
    }
    
    // Method that calls both simple and recursive methods
    public void MixedCaller()
    {
        SimpleMethod();
        DirectRecursion(5);
        CallerMethod();
    }
}
`;

async function testCircularDetection() {
    console.log('Testing circular dependency detection fix...\n');
    
    // Write test file
    const testFilePath = 'test_circular.cs';
    fs.writeFileSync(testFilePath, testClassContent);
    
    try {
        const refactorer = new CSharpRefactorer();
        await refactorer.parseSourceFile(testFilePath, 'TestClass');
        
        // Test cases
        const testCases = [
            {
                name: 'SimpleMethod',
                description: 'Simple method with no calls',
                expectedCircular: false
            },
            {
                name: 'CallerMethod', 
                description: 'Method that calls another method',
                expectedCircular: false
            },
            {
                name: 'DirectRecursion',
                description: 'Method with direct recursion',
                expectedCircular: false // The root is not circular, but its dependencies are
            },
            {
                name: 'IndirectA',
                description: 'Method with indirect recursion',
                expectedCircular: false // The root is not circular, but the cycle is detected in dependencies
            },
            {
                name: 'MixedCaller',
                description: 'Method that calls various other methods',
                expectedCircular: false // Root is not circular, but will have circular dependencies in its tree
            }
        ];
        
        console.log('=== Dependency Tree Analysis ===\n');
        
        for (const testCase of testCases) {
            console.log(`Testing: ${testCase.name} (${testCase.description})`);
            
            const tree = refactorer.buildDependencyTree('TestClass', testCase.name, 5); // Increase depth for better detection
            const rootIsCircular = tree.root.circular === true;
            
            console.log(`  Root marked as circular: ${rootIsCircular}`);
            console.log(`  Expected circular: ${testCase.expectedCircular}`);
            
            if (rootIsCircular === testCase.expectedCircular) {
                console.log(`  ✓ PASS\n`);
            } else {
                console.log(`  ✗ FAIL - Expected ${testCase.expectedCircular} but got ${rootIsCircular}\n`);
            }
            
            // Show the dependency tree structure
            console.log('  Dependency tree:');
            printDependencyTree(tree.root, '    ');
            
            // Check if circular dependencies are properly detected in the tree
            const hasCircularDependencies = checkForCircularInTree(tree.root);
            if (testCase.name === 'DirectRecursion' || testCase.name === 'IndirectA' || testCase.name === 'MixedCaller') {
                if (hasCircularDependencies) {
                    console.log('  ✓ Circular dependencies correctly detected in tree');
                } else {
                    console.log('  ✗ Circular dependencies should be detected in tree');
                }
            } else {
                if (!hasCircularDependencies) {
                    console.log('  ✓ No circular dependencies (as expected)');
                } else {
                    console.log('  ✗ Unexpected circular dependencies detected');
                }
            }
            
            console.log('');
        }
        
        console.log('=== Method Callers Analysis ===\n');
        
        // Test method callers
        const callersTest = [
            { method: 'SimpleMethod', expectedCallers: ['CallerMethod', 'MixedCaller'] },
            { method: 'DirectRecursion', expectedCallers: ['DirectRecursion', 'MixedCaller'] },
            { method: 'IndirectA', expectedCallers: ['IndirectB'] },
            { method: 'IndirectB', expectedCallers: ['IndirectA'] }
        ];
        
        for (const test of callersTest) {
            console.log(`Finding callers of: ${test.method}`);
            const callers = refactorer.findMethodCallers(test.method);
            const callerNames = callers.map(c => c.methodName);
            
            console.log(`  Found callers: [${callerNames.join(', ')}]`);
            console.log(`  Expected callers: [${test.expectedCallers.join(', ')}]`);
            
            const matches = test.expectedCallers.every(expected => callerNames.includes(expected)) &&
                           callerNames.every(found => test.expectedCallers.includes(found));
            
            if (matches) {
                console.log(`  ✓ PASS\n`);
            } else {
                console.log(`  ✗ FAIL - Mismatch in expected vs found callers\n`);
            }
        }
        
    } catch (error) {
        console.error('Error during testing:', error);
    } finally {
        // Clean up test file
        if (fs.existsSync(testFilePath)) {
            fs.unlinkSync(testFilePath);
        }
    }
}

function printDependencyTree(node, indent = '') {
    const circularMark = node.circular ? ' [CIRCULAR]' : '';
    const foundMark = node.found === false ? ' [NOT FOUND]' : '';
    console.log(`${indent}${node.methodName}${circularMark}${foundMark}`);
    
    if (node.dependencies && node.dependencies.length > 0) {
        for (const dep of node.dependencies) {
            printDependencyTree(dep, indent + '  ');
        }
    }
}

function checkForCircularInTree(node) {
    if (node.circular) {
        return true;
    }
    
    if (node.dependencies) {
        return node.dependencies.some(dep => checkForCircularInTree(dep));
    }
    
    return false;
}

// Run the test
testCircularDetection().catch(console.error);
