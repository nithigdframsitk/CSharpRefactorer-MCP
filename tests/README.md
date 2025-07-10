# Tests Directory

This directory contains all test-related files for the Enhanced C# Refactorer MCP Server.

## Directory Structure

```
tests/
├── README.md                    # This file
├── configs/                     # Test configuration files
│   ├── example_simple_config.json
│   ├── test_config.json
│   ├── test_config2.json
│   ├── test_config_good.json
│   └── test_config_with_errors.json
├── sample-files/                # C# test files for analysis
│   ├── test_complex_dependencies.cs
│   ├── test_sample.cs
│   ├── test_sample_final.cs
│   └── test_validation.cs
├── output/                      # Test output directories
│   ├── test_output_e2e/
│   └── test_output_validation/
├── debug_mcp.js                 # MCP debugging utilities
├── debug_parse.js               # Parser debugging utilities
├── e2e_test.js                  # End-to-end tests
├── integration_tests.js         # Integration tests
├── run_tests.js                 # Test runner
├── test_all.js                  # Complete test suite
├── test_circular_fix.js         # Circular dependency tests
├── test_dependency_analysis.js  # Dependency analysis tests
├── test_dependency_tree.js      # Dependency tree tests
├── test_linecount.js            # Line count tests
├── test_line_limit.js           # Line limit tests
├── test_list_linecount.js       # List line count tests
├── test_master_suite.js         # Master test suite
├── test_mcp_integration.js      # MCP integration tests
└── test_refactorer.js           # Core refactorer tests
```

## Running Tests

### Run All Tests
```bash
node tests/run_tests.js
```

### Run Specific Test Suites
```bash
# End-to-end tests
node tests/e2e_test.js

# Integration tests
node tests/integration_tests.js

# Master test suite
node tests/test_master_suite.js

# Complete test suite
node tests/test_all.js
```

### Debug Tests
```bash
# Debug MCP server
node tests/debug_mcp.js

# Debug parser
node tests/debug_parse.js
```

## Test Categories

### Unit Tests
- `test_refactorer.js` - Core refactorer functionality
- `test_linecount.js` - Line counting accuracy
- `test_dependency_analysis.js` - Dependency analysis logic
- `test_dependency_tree.js` - Dependency tree building

### Integration Tests
- `test_mcp_integration.js` - MCP server integration
- `integration_tests.js` - General integration testing
- `test_circular_fix.js` - Circular dependency handling

### End-to-End Tests
- `e2e_test.js` - Complete workflow testing
- `test_line_limit.js` - Line limit enforcement
- `test_list_linecount.js` - List operations with line counts

### Test Configurations
All test configuration files are in the `configs/` directory and include:
- Valid configurations for successful tests
- Invalid configurations for error handling tests
- Simple example configurations for documentation

### Sample Files
The `sample-files/` directory contains C# files used for testing:
- Complex dependency scenarios
- Validation test cases
- Sample classes for general testing

### Output
The `output/` directory contains generated test results and split class files from test runs.
