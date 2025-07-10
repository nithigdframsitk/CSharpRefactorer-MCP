#!/usr/bin/env node

/**
 * Enhanced C# Refactorer MCP Server with Roslyn Integration
 * This version combines the existing regex-based approach with a new Roslyn-powered analyzer
 * for improved accuracy and cross-file analysis capabilities.
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

// Import the original refactorer for backward compatibility
const { CSharpRefactorer, ProcessSplitCSharpclassSimple } = require('./csharp_refactorer.js');

class EnhancedCSharpAnalyzer {
  constructor() {
    this.roslynAnalyzerPath = path.join(__dirname, 'CSharpAnalyzer', 'bin', 'Debug', 'net8.0', 'CSharpAnalyzer.exe');
    this.fallbackAnalyzer = new CSharpRefactorer();
  }

  /**
   * Check if the Roslyn analyzer is available
   */
  async isRoslynAnalyzerAvailable() {
    try {
      await fs.access(this.roslynAnalyzerPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Execute the Roslyn analyzer with given arguments
   */
  async executeRoslynAnalyzer(command, args = []) {
    return new Promise((resolve, reject) => {
      const child = spawn(this.roslynAnalyzerPath, [command, ...args], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            resolve({ success: true, data: result });
          } catch (parseError) {
            resolve({ success: false, error: `Failed to parse output: ${parseError.message}`, raw: stdout });
          }
        } else {
          resolve({ success: false, error: `Roslyn analyzer failed with code ${code}: ${stderr}` });
        }
      });

      child.on('error', (error) => {
        resolve({ success: false, error: `Failed to execute Roslyn analyzer: ${error.message}` });
      });
    });
  }

  /**
   * List classes using Roslyn analyzer with fallback to regex
   */
  async listClasses(sourceFileOrProject, isProject = false) {
    const isRoslynAvailable = await this.isRoslynAnalyzerAvailable();
    
    if (isRoslynAvailable) {
      try {
        const args = isProject 
          ? ['--project', sourceFileOrProject, '--output', 'json']
          : ['--file', sourceFileOrProject, '--output', 'json'];
        
        const result = await this.executeRoslynAnalyzer('list-classes', args);
        
        if (result.success) {
          return {
            success: true,
            classes: result.data.classes || [],
            source: 'roslyn',
            capabilities: {
              crossFileAnalysis: isProject,
              semanticAnalysis: true,
              accurateParsing: true
            }
          };
        } else {
          console.warn('Roslyn analyzer failed, falling back to regex:', result.error);
        }
      } catch (error) {
        console.warn('Roslyn analyzer error, falling back to regex:', error.message);
      }
    }

    // Fallback to regex-based analysis
    try {
      if (isProject) {
        throw new Error('Project-wide analysis not supported by regex fallback');
      }
      
      await this.fallbackAnalyzer.parseSourceFile(sourceFileOrProject);
      const classes = this.fallbackAnalyzer.getAvailableClasses();
      
      return {
        success: true,
        classes: classes,
        source: 'regex',
        capabilities: {
          crossFileAnalysis: false,
          semanticAnalysis: false,
          accurateParsing: false
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        source: 'regex'
      };
    }
  }

  /**
   * List methods using Roslyn analyzer with fallback to regex
   */
  async listMethods(sourceFileOrProject, className = null, isProject = false) {
    const isRoslynAvailable = await this.isRoslynAnalyzerAvailable();
    
    if (isRoslynAvailable) {
      try {
        const args = isProject 
          ? ['--project', sourceFileOrProject, '--output', 'json']
          : ['--file', sourceFileOrProject, '--output', 'json'];
        
        if (className) {
          args.push('--class', className);
        }
        
        const result = await this.executeRoslynAnalyzer('list-methods', args);
        
        if (result.success) {
          return {
            success: true,
            methods: result.data.methods || [],
            source: 'roslyn',
            capabilities: {
              crossFileAnalysis: isProject,
              semanticAnalysis: true,
              accurateParsing: true,
              typeInformation: true
            }
          };
        } else {
          console.warn('Roslyn analyzer failed, falling back to regex:', result.error);
        }
      } catch (error) {
        console.warn('Roslyn analyzer error, falling back to regex:', error.message);
      }
    }

    // Fallback to regex-based analysis
    try {
      if (isProject) {
        throw new Error('Project-wide analysis not supported by regex fallback');
      }
      
      await this.fallbackAnalyzer.parseSourceFile(sourceFileOrProject, className);
      const methodNames = this.fallbackAnalyzer.getAvailableMethodNames();
      
      // Convert to format similar to Roslyn output
      const methods = methodNames.map(methodName => {
        const methodList = this.fallbackAnalyzer.methodsByName[methodName];
        return methodList.map(method => ({
          className: className || 'Unknown',
          methodName: methodName,
          returnType: 'Unknown',
          parameters: [],
          modifiers: 'Unknown',
          lineCount: method.lineCount,
          startLine: 'Unknown',
          endLine: 'Unknown',
          signature: method.signature
        }));
      }).flat();
      
      return {
        success: true,
        methods: methods,
        source: 'regex',
        capabilities: {
          crossFileAnalysis: false,
          semanticAnalysis: false,
          accurateParsing: false,
          typeInformation: false
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        source: 'regex'
      };
    }
  }

  /**
   * Build dependency tree (Roslyn only, with fallback to basic analysis)
   */
  async buildDependencyTree(sourceFileOrProject, className, methodName, maxDepth = 3, isProject = false) {
    const isRoslynAvailable = await this.isRoslynAnalyzerAvailable();
    
    if (isRoslynAvailable) {
      try {
        const args = isProject 
          ? ['--project', sourceFileOrProject]
          : ['--file', sourceFileOrProject];
        
        args.push('--class', className, '--method', methodName, '--max-depth', maxDepth.toString(), '--output', 'json');
        
        const result = await this.executeRoslynAnalyzer('dependency-tree', args);
        
        if (result.success) {
          return {
            success: true,
            dependencyTree: result.data,
            source: 'roslyn',
            capabilities: {
              crossFileAnalysis: isProject,
              semanticAnalysis: true,
              accurateParsing: true
            }
          };
        } else {
          console.warn('Roslyn dependency analysis failed, falling back to regex:', result.error);
        }
      } catch (error) {
        console.warn('Roslyn dependency analysis error, falling back to regex:', error.message);
      }
    }

    // Fallback to regex-based analysis
    try {
      if (isProject) {
        throw new Error('Project-wide dependency analysis not supported by regex fallback');
      }
      
      await this.fallbackAnalyzer.parseSourceFile(sourceFileOrProject, className);
      const dependencyTree = this.fallbackAnalyzer.buildDependencyTree(className, methodName, maxDepth);
      
      return {
        success: true,
        dependencyTree: dependencyTree,
        source: 'regex',
        capabilities: {
          crossFileAnalysis: false,
          semanticAnalysis: false,
          accurateParsing: false
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        source: 'regex'
      };
    }
  }

  /**
   * Get build instructions for the Roslyn analyzer
   */
  getBuildInstructions() {
    return {
      instructions: [
        '1. Navigate to the CSharpAnalyzer directory:',
        '   cd c:\\Tools\\MCP-Servers\\CSharpAnalyzer',
        '',
        '2. Restore dependencies:',
        '   dotnet restore',
        '',
        '3. Build the project:',
        '   dotnet build',
        '',
        '4. (Optional) Run the analyzer directly:',
        '   dotnet run -- list-classes --file "path\\to\\your\\file.cs"',
        '',
        'Once built, the enhanced analyzer will automatically use Roslyn for:',
        '- Accurate semantic analysis',
        '- Cross-file dependency tracking',
        '- Project-wide analysis',
        '- Inheritance and interface resolution',
        '- Precise type information'
      ],
      requirements: [
        '.NET 8.0 SDK or later',
        'Windows, Linux, or macOS'
      ],
      benefits: [
        'Cross-file and project-wide analysis',
        'Semantic understanding of C# code',
        'Accurate dependency tracking',
        'Support for complex C# features (generics, inheritance, etc.)',
        'Integration with MSBuild project system'
      ]
    };
  }
}

// Create the MCP server
const server = new Server(
  {
    name: 'enhanced-csharp-refactorer',
    version: '2.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'enhanced_list_csharp_classes',
        description: 'List all classes in a C# file or project using Roslyn analyzer (with regex fallback). Supports both single files and entire projects for comprehensive analysis.',
        inputSchema: {
          type: 'object',
          properties: {
            source_path: {
              type: 'string',
              description: 'Path to C# source file (.cs) or project file (.csproj). Ex: C:\\MyProject\\MyClass.cs or C:\\MyProject\\MyProject.csproj',
            },
            is_project: {
              type: 'boolean',
              description: 'Set to true if source_path is a .csproj file for project-wide analysis. Default: false',
              default: false
            }
          },
          required: ['source_path'],
        },
      },
      {
        name: 'enhanced_list_csharp_methods',
        description: 'List all methods in a C# class using Roslyn analyzer (with regex fallback). Provides detailed method signatures, parameters, and semantic information.',
        inputSchema: {
          type: 'object',
          properties: {
            source_path: {
              type: 'string',
              description: 'Path to C# source file (.cs) or project file (.csproj). Ex: C:\\MyProject\\MyClass.cs or C:\\MyProject\\MyProject.csproj',
            },
            class_name: {
              type: 'string',
              description: 'Name of the class to analyze',
            },
            is_project: {
              type: 'boolean',
              description: 'Set to true if source_path is a .csproj file for project-wide analysis. Default: false',
              default: false
            }
          },
          required: ['source_path', 'class_name'],
        },
      },
      {
        name: 'enhanced_build_dependency_tree',
        description: 'Build a comprehensive dependency tree using Roslyn analyzer (with regex fallback). Supports cross-file analysis and semantic understanding of dependencies.',
        inputSchema: {
          type: 'object',
          properties: {
            source_path: {
              type: 'string',
              description: 'Path to C# source file (.cs) or project file (.csproj). Ex: C:\\MyProject\\MyClass.cs or C:\\MyProject\\MyProject.csproj',
            },
            class_name: {
              type: 'string',
              description: 'Name of the class containing the starting method',
            },
            method_name: {
              type: 'string',
              description: 'Name of the method to start dependency analysis from',
            },
            max_depth: {
              type: 'number',
              description: 'Maximum depth to traverse in the dependency tree. Default: 3',
              default: 3
            },
            is_project: {
              type: 'boolean',
              description: 'Set to true if source_path is a .csproj file for project-wide analysis. Default: false',
              default: false
            }
          },
          required: ['source_path', 'class_name', 'method_name'],
        },
      },
      {
        name: 'get_analyzer_status',
        description: 'Get the status of the Roslyn analyzer and build instructions if needed. Shows which analysis capabilities are available.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      // Keep original tools for backward compatibility
      {
        name: 'split_csharp_class',
        description: 'Split a C# class into partial files (original regex-based implementation). This tool remains unchanged for compatibility.',
        inputSchema: {
          type: 'object',
          properties: {
            config_file: {
              type: 'string',
              description: 'Absolute full path to the JSON configuration file OR comma-separated list of multiple config file paths.',
            },
          },
          required: ['config_file'],
        },
      }
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const analyzer = new EnhancedCSharpAnalyzer();

    if (name === 'enhanced_list_csharp_classes') {
      const result = await analyzer.listClasses(args.source_path, args.is_project || false);
      
      let output = [];
      if (result.success) {
        output.push(`Classes Analysis Results (Source: ${result.source})`);
        output.push('='.repeat(60));
        output.push('');
        
        if (result.capabilities) {
          output.push('Analysis Capabilities:');
          output.push(`- Cross-file analysis: ${result.capabilities.crossFileAnalysis ? '✅' : '❌'}`);
          output.push(`- Semantic analysis: ${result.capabilities.semanticAnalysis ? '✅' : '❌'}`);
          output.push(`- Accurate parsing: ${result.capabilities.accurateParsing ? '✅' : '❌'}`);
          output.push('');
        }
        
        output.push(`Found ${result.classes.length} classes:`);
        output.push('');
        
        result.classes.forEach((cls, index) => {
          output.push(`${index + 1}. ${cls.name}`);
          output.push(`   File: ${cls.filePath || 'Unknown'}`);
          output.push(`   Lines: ${cls.lineCount || 'Unknown'}`);
          if (cls.modifiers) output.push(`   Modifiers: ${cls.modifiers}`);
          if (cls.baseTypes && cls.baseTypes.length > 0) {
            output.push(`   Base types: ${cls.baseTypes.join(', ')}`);
          }
          output.push('');
        });
        
        if (result.source === 'regex') {
          output.push('Note: Using regex-based fallback. For enhanced analysis, build the Roslyn analyzer.');
        }
      } else {
        output.push(`Error: ${result.error}`);
      }
      
      return {
        content: [{ type: 'text', text: output.join('\n') }],
      };
    }

    if (name === 'enhanced_list_csharp_methods') {
      const result = await analyzer.listMethods(args.source_path, args.class_name, args.is_project || false);
      
      let output = [];
      if (result.success) {
        output.push(`Methods Analysis Results (Source: ${result.source})`);
        output.push('='.repeat(60));
        output.push('');
        
        if (result.capabilities) {
          output.push('Analysis Capabilities:');
          output.push(`- Cross-file analysis: ${result.capabilities.crossFileAnalysis ? '✅' : '❌'}`);
          output.push(`- Semantic analysis: ${result.capabilities.semanticAnalysis ? '✅' : '❌'}`);
          output.push(`- Type information: ${result.capabilities.typeInformation ? '✅' : '❌'}`);
          output.push('');
        }
        
        output.push(`Found ${result.methods.length} methods in class '${args.class_name}':`);
        output.push('');
        
        result.methods.forEach((method, index) => {
          output.push(`${index + 1}. ${method.methodName}`);
          if (method.returnType && method.returnType !== 'Unknown') {
            output.push(`   Return Type: ${method.returnType}`);
          }
          if (method.parameters && method.parameters.length > 0) {
            output.push(`   Parameters: ${method.parameters.join(', ')}`);
          }
          if (method.modifiers && method.modifiers !== 'Unknown') {
            output.push(`   Modifiers: ${method.modifiers}`);
          }
          output.push(`   Lines: ${method.lineCount || 'Unknown'}`);
          if (method.signature) {
            output.push(`   Signature: ${method.signature}`);
          }
          output.push('');
        });
        
        if (result.source === 'regex') {
          output.push('Note: Using regex-based fallback. For detailed type information, build the Roslyn analyzer.');
        }
      } else {
        output.push(`Error: ${result.error}`);
      }
      
      return {
        content: [{ type: 'text', text: output.join('\n') }],
      };
    }

    if (name === 'enhanced_build_dependency_tree') {
      const result = await analyzer.buildDependencyTree(
        args.source_path, 
        args.class_name, 
        args.method_name, 
        args.max_depth || 3, 
        args.is_project || false
      );
      
      let output = [];
      if (result.success) {
        output.push(`Dependency Tree Analysis (Source: ${result.source})`);
        output.push('='.repeat(60));
        output.push('');
        
        if (result.capabilities) {
          output.push('Analysis Capabilities:');
          output.push(`- Cross-file analysis: ${result.capabilities.crossFileAnalysis ? '✅' : '❌'}`);
          output.push(`- Semantic analysis: ${result.capabilities.semanticAnalysis ? '✅' : '❌'}`);
          output.push('');
        }
        
        output.push(`Dependency tree for ${args.class_name}.${args.method_name}:`);
        output.push('');
        
        if (result.dependencyTree) {
          output.push(JSON.stringify(result.dependencyTree, null, 2));
        }
        
        if (result.source === 'regex') {
          output.push('');
          output.push('Note: Using regex-based fallback. For cross-file dependencies, build the Roslyn analyzer.');
        }
      } else {
        output.push(`Error: ${result.error}`);
      }
      
      return {
        content: [{ type: 'text', text: output.join('\n') }],
      };
    }

    if (name === 'get_analyzer_status') {
      const isRoslynAvailable = await analyzer.isRoslynAnalyzerAvailable();
      const buildInfo = analyzer.getBuildInstructions();
      
      let output = [];
      output.push('Enhanced C# Analyzer Status');
      output.push('='.repeat(40));
      output.push('');
      
      if (isRoslynAvailable) {
        output.push('✅ Roslyn Analyzer: Available');
        output.push('   Location: ' + analyzer.roslynAnalyzerPath);
        output.push('');
        output.push('Enhanced capabilities enabled:');
        output.push('• Cross-file dependency analysis');
        output.push('• Semantic code understanding');
        output.push('• Project-wide analysis support');
        output.push('• Accurate type information');
        output.push('• Inheritance and interface tracking');
      } else {
        output.push('❌ Roslyn Analyzer: Not Available');
        output.push('   Expected location: ' + analyzer.roslynAnalyzerPath);
        output.push('');
        output.push('Current capabilities (regex fallback):');
        output.push('• Single file analysis only');
        output.push('• Basic pattern matching');
        output.push('• Limited semantic understanding');
        output.push('');
        output.push('BUILD INSTRUCTIONS:');
        output.push('');
        buildInfo.instructions.forEach(instruction => {
          output.push(instruction);
        });
        output.push('');
        output.push('Requirements:');
        buildInfo.requirements.forEach(req => {
          output.push(`• ${req}`);
        });
        output.push('');
        output.push('Benefits after building:');
        buildInfo.benefits.forEach(benefit => {
          output.push(`• ${benefit}`);
        });
      }
      
      return {
        content: [{ type: 'text', text: output.join('\n') }],
      };
    }

    if (name === 'split_csharp_class') {
      // Use the original implementation
      return await ProcessSplitCSharpclassSimple(args.config_file);
    }

    throw new Error(`Unknown tool: ${name}`);

  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`,
        },
      ],
    };
  }
});

// Main function to run the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Enhanced C# Refactorer MCP Server with Roslyn Integration running on stdio');
}

// Run the server if this file is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Server error:', error);
    process.exit(1);
  });
}

module.exports = { EnhancedCSharpAnalyzer, server };
