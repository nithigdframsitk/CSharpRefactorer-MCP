#C# Refactorer MCP Servers (70% Generated with Copilot Agent [Claude 4 Sonnet] including tests)

This repository contains two MCP (Model Context Protocol) servers for C# class refactoring:

1. **csharp_refactorer_original.js** - Original server with full method signature configuration
2. **csharp_refactorer.js** - New simplified server with method name-only configuration

## Features

- Split large C# classes into multiple partial class files
- Group methods by functionality or business logic
- Support for multiple configuration files
- Automatic method signature detection and matching
- Validation and error handling
- Namespace and interface management

## Future Plans for Updates on this MCP Tool

- Planning to add tools that could create a dependency tree useful for indexing the application for an AI Agent to refer to.
- Concept: Every task/story will start from the parent method (it can be a Controller method). When the Agent starts the task, it will begin by finding all the places where the code needs to be updated with the help of the dependency tree. This is very helpful for very large projects.
- Tool to get the method body by method name and class name.

## Installation

```bash
npm install
```

## Setup AI Agent Configuration for MCP Server

To integrate this C# Refactorer MCP Server with your AI Agent, add the following MCP Server definition to your AI Agent's configuration file. This allows the AI agent to access all the advanced code analysis and refactoring capabilities.

### Configuration Example

```json
{
  "mcpServers": {
    "csharp_refactorer": {
      "type": "stdio",
      "command": "node",
      "args": [
        "C:\\Path\\To\\Your\\MCP-Servers\\csharp_refactorer.js"
      ]
    }
  }
}
```

### Configuration Details

- **Server Name**: `csharp_refactorer` - This is the identifier your AI agent will use to reference this server
- **Type**: `stdio` - Uses standard input/output for communication with the MCP server
- **Command**: `node` - Runs the server using Node.js
- **Args**: Array containing the absolute path to the `csharp_refactorer.js` file

### Important Notes

1. **Use Absolute Paths**: Replace `"C:\\Path\\To\\Your\\MCP-Servers\\csharp_refactorer.js"` with the actual absolute path to your MCP server script
2. **Path Format**: Use double backslashes (`\\`) in JSON for Windows paths, or forward slashes (`/`) for cross-platform compatibility
3. **Node.js Required**: Ensure Node.js is installed and accessible in your system PATH
4. **Restart Required**: After adding this configuration, restart your AI agent to load the new MCP server

### Example for Different AI Agents

#### Claude Desktop Configuration
Add to your Claude Desktop configuration file (typically located in your user profile):
```json
{
  "mcpServers": {
    "csharp_refactorer": {
      "type": "stdio", 
      "command": "node",
      "args": ["C:\\Tools\\MCP-Servers\\csharp_refactorer.js"]
    }
  }
}
```

#### Custom AI Agent Integration
For custom AI agents using the MCP SDK:
```javascript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['C:\\Tools\\MCP-Servers\\csharp_refactorer.js']
});

const client = new Client({
  name: "my-ai-agent",
  version: "1.0.0"
}, {
  capabilities: {}
});

await client.connect(transport);
```

Once configured, your AI agent will have access to the following tools:
- `build_dependency_tree` - Analyze method dependencies and call hierarchies
- `get_method_body` - Retrieve complete method implementations
- `find_method_callers` - Find all methods that call a specific method
- `get_method_statistics` - Get comprehensive method complexity metrics
- `list_csharp_classes` - List all classes in a C# file
- `list_csharp_methods` - List all methods with line counts
- `split_csharp_class` - Split large classes into logical partial classes

## Usage

### Original Server (Full Signatures)

The original server requires full method signatures in the configuration:

```bash
node csharp_refactorer.js
```

Configuration example:
```json
{
    "sourceFile": "C:\\Path\\To\\Your\\SourceClass.cs",
    "destinationFolder": "C:\\Path\\To\\Your\\Output\\YourClassName",
    "newNamespace": "Your.New.Namespace",
    "mainPartialClassName": "YourClassName.Core.cs",
    "mainInterface": "IMainInterface",
    "partialClasses": [
        {
            "fileName": "YourClassName.DatabaseOperations.cs",
            "methods": [
                {
                    "accessor": "public",
                    "returnType": "void",
                    "static": false,
                    "virtual": false,
                    "async": false,
                    "name": "GetUser",
                    "arguments": ["int userId"]
                }
            ]
        }
    ]
}
```

### Simplified Server (Method Names Only)

The new simplified server only requires method names:

```bash
node csharp_refactorer_simple.js
```

Configuration example:
```json
{
    "sourceFile": "C:\\Path\\To\\Your\\SourceClass.cs",
    "destinationFolder": "C:\\Path\\To\\Your\\Output\\YourClassName",
    "newNamespace": "Your.New.Namespace",
    "mainPartialClassName": "YourClassName.Core.cs",
    "mainInterface": "IMainInterface",
    "partialClasses": [
        {
            "fileName": "YourClassName.DatabaseOperations.cs",
            "methods": [
                "GetUser",
                "SaveUser",
                "DeleteUser",
                "UpdateUser"
            ]
        }
    ]
}
```

## Available Tools

### Original Server Tools

- `split_csharp_class` - Split C# class using full signature configuration
- `list_csharp_methods` - List all methods with full signatures and line counts

### Simplified Server Tools

- `split_csharp_class_simple` - Split C# class using method names only with 5000-line enforcement
- `list_csharp_methods` - List all method names with individual line counts for configuration planning

## Key Differences

| Feature | Original Server | Simplified Server |
|---------|----------------|------------------|
| Configuration | Full method signatures required | Method names only |
| Validation | Strict signature matching | Name-based matching |
| Overloads | Manual handling required | Automatic handling |
| Ease of use | More complex | Much simpler |
| Duplicate handling | Strict validation | Graceful handling |
| Already processed methods | Error on duplicate | Silently skip |
| Line count tracking | Manual calculation | Automatic with enforcement |
| Size limits | Manual validation | 5000-line automatic enforcement |

## Benefits of Simplified Server

1. **Easier Configuration**: No need to specify full method signatures
2. **Automatic Overload Handling**: Automatically handles method overloads
3. **Graceful Error Handling**: Skips already processed methods instead of throwing errors
4. **Faster Setup**: Quick to configure with just method names
5. **Less Error-Prone**: Reduces configuration mistakes
6. **Line Count Tracking**: Shows individual method line counts for better planning
7. **Automatic Size Enforcement**: Prevents partial classes from exceeding 5000 lines

## Example Workflow

1. **Analyze Source File**:
   ```bash
   # Use the list tool to see all available methods
   list_csharp_methods("C:\\Path\\To\\Your\\SourceClass.cs")
   ```

2. **Create Configuration**:
   ```json
   {
       "sourceFile": "C:\\Path\\To\\Your\\SourceClass.cs",
       "destinationFolder": "C:\\Path\\To\\Output",
       "newNamespace": "Your.Namespace",
       "mainPartialClassName": "YourClass.Core.cs",
       "partialClasses": [
           {
               "fileName": "YourClass.Category1.cs",
               "methods": ["Method1", "Method2", "Method3"]
           }
       ]
   }
   ```

3. **Split the Class**:
   ```bash
   split_csharp_class_simple("C:\\Path\\To\\config.json")
   ```

## Multiple Configuration Files

Both servers support multiple configuration files:

```bash
split_csharp_class_simple("config1.json,config2.json,config3.json")
```

This is useful for very large classes where you want to organize the configuration across multiple files.

## Error Handling

- **Method Not Found**: Lists available methods when a method is not found
- **File Not Found**: Clear error messages for missing files
- **Configuration Errors**: Detailed validation messages
- **Duplicate Methods**: Handled gracefully in simplified server

## Testing

The project includes comprehensive tests to validate all functionality:

### Test Files Included

- `test_sample.cs` - Sample C# class for testing
- `test_config.json` - Example configuration file
- `test_config2.json` - Second configuration file for multi-config testing
- `example_simple_config.json` - Template configuration file

### Available Test Scripts

```bash
# Run basic functionality tests
npm test

# Run integration tests
npm run test-integration

# Run end-to-end tests (generates actual files)
npm run test-e2e

# Run complete test suite
npm run test-all
```

### Test Coverage

- ✅ **Parsing**: C# source file parsing and method extraction
- ✅ **Method Grouping**: Methods grouped by name for easy lookup
- ✅ **Partial Class Generation**: Creation of partial class files
- ✅ **Main Class Generation**: Generation of main partial class with remaining code
- ✅ **File I/O**: Actual file creation and validation
- ✅ **Error Handling**: Non-existent methods, duplicate methods, validation errors
- ✅ **Configuration**: Single and multiple configuration file support
- ✅ **Method Distribution**: Correct placement of methods in appropriate files
- ✅ **Duplicate Handling**: Graceful handling of already processed methods

### Test Results

All tests pass with 100% success rate, validating:
- 7 Basic functionality tests
- 8 Integration tests  
- 10 End-to-end tests

Total: **25 tests** all passing ✅

## License

MIT License
