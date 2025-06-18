#!/usr/bin/env node

/**
 * MCP Server for C# Class Refactoring
 * Provides tools to split C# classes into partial files and analyze methods.
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const fs = require('fs').promises;
const path = require('path');

class CSharpRefactorer {
  constructor() {
    this.usingStatements = [];
    this.namespaceDeclaration = '';
    this.classDeclaration = '';
    this.methods = {};
    this.otherMembers = '';
    this.sourceCode = '';
    this.oldNamespace = '';
  }

  /**
   * Parses a C# source code string to extract all methods from the first class found.
   * @param {string} sourceCode - The C# source code as a string.
   * @returns {Object} A dictionary where keys are the full method signatures and values 
   *                  are the full text of the method, including signature and body.
   */
  parseCSharpMethods(sourceCode) {
    const methods = {};
    
    // Group 1: The full signature text.
    // Group 2: The method name.
    const methodPattern = /\s*((?:\[[^\]]*\]\s*)*(?:(?:public|private|protected|internal|static|virtual|override|async))\s+[\w<>\s]*\s+([\w<>]+)\s*(?<params>\((?:[^()]|(\?&params))*\))(?:[\s\n]*where\s+[^\{]*)?)(?=\s*\{)/gm;
    
    let match;
    let matchNum = 1;
    
    while ((match = methodPattern.exec(sourceCode)) !== null) {
      // fetch comment block and full signature
      // by reverse traversing the sourceCode from the match start
      let commentBlock = '';
      let i = match.index - 1;
      while (i >= 0 && sourceCode[i] !== '}') {
        commentBlock = sourceCode[i] + commentBlock;
        i--;
      }

      const fullSignatureRaw = match[1];
      // Normalize whitespace in the signature to create a clean, consistent key
      const signatureKey = fullSignatureRaw.replace(/\s+/g, ' ').trim();
      
      // This is the character index where the signature match begins inside the class_body
      const signatureStartIndex = match.index;
      
      // Find the opening brace '{' that belongs to this specific method
      const braceIndex = sourceCode.indexOf('{', match.index + match[0].length);
      if (braceIndex === -1) {
        // This should not happen due to the lookahead in regex, but it's a safe check
        continue;
      }

      let braceCount = 1;
      // Scan from the character immediately after the opening brace
      for (let j = braceIndex + 1; j < sourceCode.length; j++) {
        const char = sourceCode[j];
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
        }
        
        // When braceCount is zero, we've found the matching closing brace
        if (braceCount === 0) {
          // The full method text spans from the start of the signature to the closing brace
          const fullMethodEndIndex = j + 1;
          const methodText = sourceCode.slice(signatureStartIndex, fullMethodEndIndex);
          
          // Store the method using the cleaned signature as the key
          if (signatureKey in methods) {
            console.warn(`Warning: Duplicate method signature found: '${signatureKey}'. Overwriting.`);
          }
          methods[signatureKey] = commentBlock + methodText.trim();
          
          // Exit the inner loop and find the next method
          break;
        }
      }
      matchNum++;
    }
    
    return methods;
  }

  /**
   * Parse the source file to extract code elements.
   * @param {string} sourceFilePath - Path to the source file
   */
  async parseSourceFile(sourceFilePath) {
    try {
      this.sourceCode = await fs.readFile(sourceFilePath, 'utf-8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Source file not found at ${sourceFilePath}`);
      }
      throw new Error(`Error reading source file: ${error.message}`);
    }
    
    // Extract using statements before namespace
    let namespaceStart = this.sourceCode.indexOf('namespace');
    if (namespaceStart === -1) {
      namespaceStart = this.sourceCode.length;
    }
    
    const usingPattern = /using [^;]+;/g;
    const usingMatches = this.sourceCode.slice(0, namespaceStart).match(usingPattern);
    this.usingStatements = usingMatches || [];
    
    // Extract namespace
    const namespacePattern = /namespace ([^\s{]+)/;
    const namespaceMatch = this.sourceCode.match(namespacePattern);
    if (namespaceMatch) {
      this.oldNamespace = namespaceMatch[1];
    }
    
    // Extract class declaration
    const classPattern = /(public\s+class\s+\w+(?:\s*<[^>{}]+>)?.*?)(?=\s*{)/;
    const classMatch = this.sourceCode.match(classPattern);
    if (classMatch) {
      this.classDeclaration = classMatch[1].trim();
    }
    
    this.otherMembers = this.sourceCode;
    this.methods = this.parseCSharpMethods(this.sourceCode);
  }

  /**
   * Generate content for a partial class file.
   * @param {Object} partialClassConfig - Configuration for the partial class
   * @param {string} newNamespace - New namespace for the class
   * @returns {string} Generated content for the partial class file
   */
  generatePartialClass(partialClassConfig, newNamespace) {
    let content = '';
    
    // Write using statements
    for (const usingStmt of this.usingStatements) {
      content += `${usingStmt}\n`;
    }
    
    content += '\n';
    
    // Write namespace declaration
    content += `namespace ${newNamespace}\n{\n`;
    
    // Write class declaration with partial keyword
    const classNameMatch = this.classDeclaration.match(/public\s+class\s+(\w+)/);
    let classDecl = this.classDeclaration;
    if (classNameMatch) {
      const originalClassName = classNameMatch[1];
      classDecl = this.classDeclaration.replace(
        `public class ${originalClassName}`, 
        `public partial class ${originalClassName}`
      );
    }
    
    const interfaceImpl = partialClassConfig.interface || '';
    if (interfaceImpl) {
      classDecl = classDecl.replace('{', ` : ${interfaceImpl} {`);
    }
    
    content += `    ${classDecl}\n    {\n`;
    
    // Write methods
    for (const methodInfo of partialClassConfig.methods) {
      let signature = `${methodInfo.accessor || 'public'} `;
      if (methodInfo.static) {
        signature += 'static ';
      }
      if (methodInfo.async) {
        signature += 'async ';
      }
      signature += `${methodInfo.returnType || 'void'} ${methodInfo.name}`;
      
      if (methodInfo.arguments) {
        signature += `(${methodInfo.arguments.join(', ')})`;
      } else {
        signature += '()';
      }
      
      // Find the matching method in this.methods
      let matchingMethod = null;
      for (const [storedSignature, methodBody] of Object.entries(this.methods)) {
        const normalizedStored = storedSignature.replace(/\s+/g, ' ').trim();
        const normalizedConstructed = signature.replace(/\s+/g, ' ').trim();
        if (normalizedStored.includes(normalizedConstructed) || 
            normalizedStored.endsWith(normalizedConstructed)) {
          matchingMethod = methodBody;
          break;
        }
      }
      
      if (matchingMethod) {
        // Indent the method properly
        const indentedMethod = matchingMethod
          .split('\n')
          .map(line => line.trim() ? '        ' + line : line)
          .join('\n');
        content += `${indentedMethod}\n\n`;
      }
    }
    
    // Close class and namespace
    content += '    }\n}';
    
    content = content.replace(/#endregion/g, '//#endregion');
    content = content.replace(/#region/g, '//#region');
    
    return content;
  }

  /**
   * Generate the main partial class file with remaining code elements.
   * @param {string} newNamespace - New namespace for the class
   * @param {string} mainClassName - Main class name
   * @param {string} mainInterface - Main interface to implement
   * @returns {string} Generated content for the main partial class file
   */
  generateMainPartialClass(newNamespace, mainClassName, mainInterface = '') {
    let content = this.otherMembers;
    
    // Replace namespace
    if (this.oldNamespace) {
      content = content.replace(
        `namespace ${this.oldNamespace}`, 
        `namespace ${newNamespace}`
      );
    }
    
    // Make class partial
    content = content.replace(/public class/g, 'public partial class');
    
    // Add interface if specified
    if (mainInterface) {
      const classPattern = /(public\s+partial\s+class\s+\w+(?:\s*<[^>{}]+>)?)/;
      content = content.replace(classPattern, `$1 : ${mainInterface}`);
    }
    
    return content;
  }
}

// Create the MCP server
const server = new Server(
  {
    name: 'csharp-refactorer',
    version: '0.1.0',
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
        name: 'split_csharp_class',
        description: 'Split a C# class file into multiple partial class files based on configuration',
        inputSchema: {
          type: 'object',
          properties: {
            source_file: {
              type: 'string',
              description: 'Absolute full Path to the C# source file to analyze. Ex: C:\\Users\\NithiDhanasekaran\\source\\repos\\Framsikt Product Development\\Framsikt\\Framsikt.BL\\ActionImport.cs',
            },
            destination_folder: {
              type: 'string',
              description: 'Folder where partial class files will be generated',
            },
            new_namespace: {
              type: 'string',
              description: 'New namespace for the partial classes',
            },
            main_partial_class_file_name: {
              type: 'string',
              description: 'Name of the main partial class file. Ex: MonthlyReportingExportHelper.Core.cs',
            },
            main_interface: {
              type: 'string',
              description: 'Main interface to implement (optional). Ex: IMonthlyReportingExportHelper',
              default: '',
            },
            partial_classes: {
              type: 'array',
              description: 'Array of partial class configurations. Use this to group methods into partial classes by functionality and business logic.',
              items: {
                type: 'object',
                properties: {
                  fileName: { type: 'string' },
                  interface: { type: 'string' },
                  methods: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        accessor: { type: 'string' },
                        returnType: { type: 'string' },
                        static: { type: 'boolean' },
                        async: { type: 'boolean' },
                        arguments: {
                          type: 'array',
                          items: { type: 'string' },
                        },
                      },
                      required: ['name', 'accessor'],
                    },
                  },
                },
                required: ['fileName', 'methods'],
              },
            },
          },
          required: [
            'source_file',
            'destination_folder',
            'new_namespace',
            'main_partial_class_file_name',
            'partial_classes',
          ],
        },
      },
      {
        name: 'list_csharp_methods',
        description: 'List all methods found in a C# class file',
        inputSchema: {
          type: 'object',
          properties: {
            source_file: {
              type: 'string',
              description: 'Absolute full Path to the C# source file to analyze. Ex: C:\\Users\\NithiDhanasekaran\\source\\repos\\Framsikt Product Development\\Framsikt\\Framsikt.BL\\ActionImport.cs',
            },
          },
          required: ['source_file'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'split_csharp_class') {
      // Extract arguments
      const {
        source_file,
        destination_folder,
        new_namespace,
        main_partial_class_file_name,
        main_interface = '',
        partial_classes,
      } = args;

      // Create refactorer instance
      const refactorer = new CSharpRefactorer();

      // Parse source file
      await refactorer.parseSourceFile(source_file);

      // Create destination folder if it doesn't exist
      await fs.mkdir(destination_folder, { recursive: true });

      const results = [];

      // Generate partial class files
      for (const partialClass of partial_classes) {
        const fileName = partialClass.fileName;
        const filePath = path.join(destination_folder, fileName);

        // Generate content for the partial class file
        const content = refactorer.generatePartialClass(partialClass, new_namespace);

        // Write content to file
        await fs.writeFile(filePath, content, 'utf-8');

        results.push(`Generated: ${filePath}`);
      }

      // Generate main partial class file
      const mainFilePath = path.join(destination_folder, main_partial_class_file_name);
      const mainContent = refactorer.generateMainPartialClass(
        new_namespace,
        main_partial_class_file_name,
        main_interface
      );

      await fs.writeFile(mainFilePath, mainContent, 'utf-8');
      results.push(`Generated: ${mainFilePath}`);

      return {
        content: [
          {
            type: 'text',
            text: `Successfully split C# class into partial files:\n${results.join('\n')}`,
          },
        ],
      };
    } else if (name === 'list_csharp_methods') {
      const { source_file } = args;

      // Create refactorer instance
      const refactorer = new CSharpRefactorer();

      // Parse source file
      await refactorer.parseSourceFile(source_file);

      // Format methods information
      if (Object.keys(refactorer.methods).length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No methods found in ${source_file}`,
            },
          ],
        };
      }

      const methodsInfo = [];
      methodsInfo.push(`Methods found in ${source_file}:`);
      methodsInfo.push('='.repeat(50));

      let i = 1;
      for (const [signature, methodBody] of Object.entries(refactorer.methods)) {
        // Extract method name from signature
        const nameMatch = signature.match(/\b(\w+)\s*\(/);
        const methodName = nameMatch ? nameMatch[1] : 'Unknown';

        methodsInfo.push(`${i}. ${methodName}`);
        methodsInfo.push(`   Signature: ${signature}`);
        methodsInfo.push(`   Lines: ${methodBody.split('\n').length}`);
        methodsInfo.push('');
        i++;
      }

      return {
        content: [
          {
            type: 'text',
            text: methodsInfo.join('\n'),
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: 'text',
            text: `Unknown tool: ${name}`,
          },
        ],
      };
    }
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
  console.error('C# Refactorer MCP Server running on stdio');
}

// Run the server if this file is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Server error:', error);
    process.exit(1);
  });
}

module.exports = { CSharpRefactorer, server };