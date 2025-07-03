# C# Refactorer MCP Servers

This repository contains two MCP (Model Context Protocol) servers for C# class refactoring:

1. **csharp_refactorer.js** - Original server with full method signature configuration
2. **csharp_refactorer_simple.js** - New simplified server with method name-only configuration

## Features

- Split large C# classes into multiple partial class files
- Group methods by functionality or business logic
- Support for multiple configuration files
- Automatic method signature detection and matching
- Validation and error handling
- Namespace and interface management

## Installation

```bash
npm install
```

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
