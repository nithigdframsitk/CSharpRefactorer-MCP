const { CSharpRefactorer } = require('./csharp_refactorer');

async function debugMCP() {
    const refactorer = new CSharpRefactorer();
    await refactorer.parseSourceFile('c:\\Tools\\MCP-Servers\\tests\\sample-files\\test_sample_final.cs', 'SampleClass');
    
    console.log('Testing SimpleMethod parsing:');
    const methodInfo = refactorer.methodsByName['SimpleMethod'];
    if (methodInfo && methodInfo.length > 0) {
        console.log('Method content:');
        console.log(methodInfo[0].content);
        console.log('\nParsed method calls:');
        const calls = refactorer.parseMethodCalls(methodInfo[0].content);
        calls.forEach(call => {
            console.log(`  - ${call.className}.${call.methodName}`);
        });
    }
}

debugMCP().catch(console.error);
