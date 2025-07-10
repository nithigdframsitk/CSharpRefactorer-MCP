const { CSharpRefactorer } = require('./csharp_refactorer');

// Simple test to debug parseMethodCalls
const testContent = `public void SimpleMethod()
{
    Console.WriteLine("Simple method");
}`;

const refactorer = new CSharpRefactorer();
const calls = refactorer.parseMethodCalls(testContent);
console.log('Parsed method calls from SimpleMethod:');
calls.forEach(call => {
    console.log(`  - ${call.className}.${call.methodName} (${call.fullCall})`);
});
