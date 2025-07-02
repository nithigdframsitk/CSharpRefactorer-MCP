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
   * are the full text of the method, including signature and body.
   */
  parseCSharpMethods(sourceCode) {
    const methods = {};
    const methodsWithRawKey = {};

    // Group 1: The full signature text.
    // Group 2: The method name.
    const methodPattern = /^(?!#|$)\s*((?:\[[^\]]*\]\s*)*(?:(?:public|private|protected|internal|static|virtual|override|async))\s+[\w<,>\s]*\s+([\w<>]+)\s*(?<params>\((?:[^()]|(\?&params))*\))(?:[\s\n]*where\s+[^\{]*)?)(?=\s*\{)/gm;

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
      const signatureKey = fullSignatureRaw.replace(/[\s\r\n]+/g, '').trim();

      // This is the character index where the signature match begins inside the class_body
      const signatureStartIndex = match.index;

      // Find the opening brace '{' that belongs to this specific method
      const braceIndex = sourceCode.indexOf('{', match.index + match[0].length);
      if (braceIndex === -1) {
        // This should not happen due to the lookahead in regex, but it's a safe check
        continue;
      }

      let braceCount = 1;
      var isCommentLine = false;
      // Scan from the character immediately after the opening brace
      for (let j = braceIndex + 1; j < sourceCode.length; j++) {
        const char = sourceCode[j];

        // Check if the current character is part of a comment
        if (char === '/' && sourceCode[j + 1] === '/') {
          isCommentLine = true;
        }

        // Reset comment line flag if we hit a newline
        if (char === '\n' || char === '\r\n') {
          isCommentLine = false;
        }

        if (!isCommentLine) {
          if (char === '{') {
            braceCount++;
          } else if (char === '}') {
            braceCount--;
          }
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
          methods[signatureKey] = (commentBlock.includes(this.classDeclaration) ? "" : commentBlock) + methodText;
          methodsWithRawKey[fullSignatureRaw] = (commentBlock.includes(this.classDeclaration) ? "" : commentBlock) + methodText;

          // Exit the inner loop and find the next method
          break;
        }
      }
      matchNum++;
    }

    this.methodsWithRawKey = methodsWithRawKey;
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
    const classPattern = /(public\s+(?:\w+\s+)*?class\s+\w+(?:\s*<[^>{}]+>)?.*?)(?=\s*{)/;
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
  async generatePartialClass(partialClassConfig, newNamespace) {
    let content = '';

    // Write using statements
    for (const usingStmt of this.usingStatements) {
      content += `${usingStmt}\n`;
    }

    content += '\n';

    // Write namespace declaration
    content += `namespace ${newNamespace}\n{\n`;

    // Write class declaration with partial keyword
    const classNameMatch = this.classDeclaration.match(/public\s+(?:\w+\s+)*?class\s+(\w+)/);
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
      let [signature, signature1] = this.GetSignature(methodInfo);

      // Find the matching method in this.methods
      let matchingMethod = null;
      for (const [storedSignature, methodBody] of Object.entries(this.methods)) {
        const normalizedStored = storedSignature.replace(/\s+/g, '').trim();
        const normalizedConstructed = signature.replace(/\s+/g, '').trim();
        const normalizedConstructed1 = signature1.replace(/\s+/g, '').trim();

        if (normalizedStored.includes(normalizedConstructed) ||
          normalizedStored.endsWith(normalizedConstructed)) {
          matchingMethod = methodBody;
          break;
        }

        if (normalizedStored.includes(normalizedConstructed1) ||
          normalizedStored.endsWith(normalizedConstructed1)) {
          matchingMethod = methodBody;
          break;
        }
      }

      if (matchingMethod) {
        // // Indent the method properly
        // const indentedMethod = matchingMethod
        //   .split('\n')
        //   .map(line => line.trim() ? '        ' + line : line)
        //   .join('\n');
        content += `${matchingMethod}\n\n`;
        this.otherMembers = this.otherMembers.replace(matchingMethod, '');
      } else {
        await fs.writeFile("C:\\Tools\\MCP-Servers\\debug", JSON.stringify(this.methods));
        throw new Error(`Method '${signature}' not found in source code. Check method signature in the config, they must exactly match with source code (case-sensitive).`);
      }
    }

    // Close class and namespace
    content += '    }\n}';

    content = content.replace(/#endregion/g, '//#endregion');
    content = content.replace(/#region/g, '//#region');

    content = content.replace(/^\n\n/, /\n/); // Remove extra newlines

    return content;
  }

  GetSignature(methodInfo) {
    let signature = `${methodInfo.accessor || 'public'} `;
    let signature1 = `${methodInfo.accessor || 'public'} `;

    if (methodInfo.static) {
      signature += 'static ';
    }

    if (methodInfo.async) {
      signature += 'async ';
    }

    if (methodInfo.async) {
      signature1 += 'async ';
    }

    if (methodInfo.static) {
      signature1 += 'static ';
    }

    signature += `${methodInfo.returnType || 'void'} ${methodInfo.name}`;
    signature1 += `${methodInfo.returnType || 'void'} ${methodInfo.name}`;

    if (methodInfo.arguments) {
      signature += `(${methodInfo.arguments.join(', ')})`;
      signature1 += `(${methodInfo.arguments.join(', ')})`;
    } else {
      signature += '()';
      signature1 += '()';
    }

    return [signature, signature1];
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
    version: '0.2.0',
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
        description: `Split a C# class file into multiple partial class files based on a JSON configuration. Methods should be grouped by functionality or business logic. Example Configuration: {
    "sourceFile": "C:\\Path\\To\\Your\\SourceClass.cs",
    "destinationFolder": "C:\\Path\\To\\Your\\Output\\{Main ClassName from the source file}",
    "newNamespace": "Your.New.Namespace", // Use Existing namespace in source file if user not specified
    "mainPartialClassName": "{Main ClassName from the source file}.Core.cs",
    "mainInterface": "IMainInterface", // If interface exists, otherwise leave empty
    "partialClasses": [
        {
            "fileName": "YourClass.{Category}.cs",
            "interface": "", // Optional. Only if interface exists
            "methods": [
                {
                    "accessor": "public",  // Don't include static and async keywords here
                    "returnType": "void", // Don't include static and async keywords here
                    "static": true, // Optional, defaults to false. Must be Set to true if method is static
                    "async": true, // Optional, defaults to false. Must be Set to true if method is async
                    "name": "MethodOne",  // Don't include static and async keywords here
                    "arguments": ["string arg1", "int arg2 = 1"]
                },
                {
                    "accessor": "private",  // Don't include static and async keywords here
                    "static": true, // Optional, defaults to false. Must be Set to true if method is static
                    "async": true, // Optional, defaults to false. Must be Set to true if method is async                    
                    "returnType": "Task<string>", // Don't include static and async keywords here
                    "name": "MethodTwo"  // Don't include static and async keywords here
                }
            ]
        },
        {
            "fileName": "YourClass.{Category}.cs",
            "interface": "", // Optional. Only if interface exists
            "methods": [
                {
                    "accessor": "public",
                    "static": true, // Optional, defaults to false. Must be Set to true if method is static
                    "async": true, // Optional, defaults to false. Must be Set to true if method is async    
                    "returnType": "bool",
                    "name": "MethodThree",
                    "arguments": ["string someArg = 'value'"]
                }
            ]
        }
    ]
}
`,
        inputSchema: {
          type: 'object',
          properties: {
            config_file: {
              type: 'string',
              description: 'Absolute full path to the JSON configuration file. Ex: C:\\Users\\user\\config.json',
            },
          },
          required: ['config_file'],
        },
      },
      {
        name: 'list_csharp_methods',
        description: 'List all methods found in a C# class file with line counts and signatures. This tool is useful for analyzing the structure of a C# class.',
        inputSchema: {
          type: 'object',
          properties: {
            source_file: {
              type: 'string',
              description: 'Absolute full Path to the C# source file to analyze. Ex: C:\\Users\\user\\source\\MyProject\\MyClass.cs',
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
      const { config_file } = args;

      if (!config_file) {
        throw new Error("Missing required argument: config_file");
      }

      // Read and parse the configuration file
      return await ProcessSplitCSharpclass(config_file);
    } else if (name === 'list_csharp_methods') {
      return await listCSharpMethods(args.source_file);
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

async function listCSharpMethods(source_file) {
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
  for (const [signature, methodBody] of Object.entries(refactorer.methodsWithRawKey)) {
    // Extract method name from signature
    const nameMatch = signature.match(/\b(\w+)\s*\(/);
    const methodName = nameMatch ? nameMatch[1] : 'Unknown';

    methodsInfo.push(`${i}. ${methodName}`);
    methodsInfo.push(`   Signature: ${signature}`);
    methodsInfo.push(`   Line Count: ${methodBody.split('\n').length}`);
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
}

async function ProcessSplitCSharpclass(config_file) {
  const configContent = await fs.readFile(config_file, 'utf-8');
  const config = JSON.parse(configContent);

  // Map properties from the config file (camelCase) to the script's variables (snake_case)
  const source_file = config.sourceFile;
  const destination_folder = config.destinationFolder;
  const new_namespace = config.newNamespace;
  const main_partial_class_file_name = config.mainPartialClassName;
  const partial_classes = config.partialClasses;
  const main_interface = config.mainInterface || '';

  // Validate that all required properties were found in the config file
  const requiredKeys = ['sourceFile', 'destinationFolder', 'newNamespace', 'mainPartialClassName', 'partialClasses'];
  for (const key of requiredKeys) {
    if (!config[key]) {
      throw new Error(`Configuration file "${config_file}" is missing required key: "${key}". value should not be empty.`);
    }
  }

  // Create refactorer instance
  const refactorer = new CSharpRefactorer();

  // Parse source file
  await refactorer.parseSourceFile(source_file);

  // if partial_classes dont have all the methods from the parsed source file, throw an error
  const allMethods = Object.keys(refactorer.methods);
  const methodsWithRawKey = Object.keys(refactorer.methodsWithRawKey);
  let i = 0;
  
  var errors = [];

  for (const method in allMethods) {
    i++;
    const methodSignature = allMethods[method];
    const foundInPartial = partial_classes.some(partialClass =>
      partialClass.methods.some(m => {
        // const constructedSignature = `${m.accessor || 'public'} ${m.static ? 'static': ''} ${m.async ? 'async': ''} ${m.returnType || 'void'} ${m.name}(${m.arguments ? m.arguments.join(', ') : ''})`;
        // const constructedSignature1 = `${m.accessor || 'public'} ${m.async ? 'async': ''} ${m.static ? 'static': ''} ${m.returnType || 'void'} ${m.name}(${m.arguments ? m.arguments.join(', ') : ''})`;

        var [constructedSignature, constructedSignature1] = refactorer.GetSignature(m);

        var includes = methodSignature.replace(/\s+/g, '').includes(constructedSignature.replace(/\s+/g, ''));
        var includes1 = methodSignature.replace(/\s+/g, '').includes(constructedSignature1.replace(/\s+/g, ''));

        return includes || includes1;
      })
    );
    if (!foundInPartial) {
      errors.push(`'${methodsWithRawKey[i-1]}'\n`);
    }
  }

  if(errors.length > 0) {
     throw new Error(`Following methods are not found in any partial class configuration. Ensure all methods are included in the 'partialClasses' array. "${config_file}":\n${errors.join('\n')}`);
  }

  // Create destination folder if it doesn't exist
  await fs.mkdir(destination_folder, { recursive: true });

  const results = [];

  // Generate partial class files
  for (const partialClass of partial_classes) {
    const fileName = partialClass.fileName;
    const filePath = path.join(destination_folder, fileName);

    // Generate content for the partial class file
    const content = await refactorer.generatePartialClass(partialClass, new_namespace);

    // Get no of lines in the content
    const lineCount = content.split('\n').length;
    if(lineCount > 5000) {
      throw new Error(`Generated partial file ${fileName} exceeds 5000 lines. Please split the methods into smaller groups in the configuration.`);
    }

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
}

// Main function to run the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('C# Refactorer MCP Server running on stdio');
}

// Run the server if this file is executed directly
if (require.main === module) {

  // ProcessSplitCSharpclass("BusinessPlanConfig.json");
  // listCSharpMethods("C:\\Users\\NithiDhanasekaran\\source\\repos\\146314\\Framsikt\\Framsikt.BL\\Utility.cs")

  main().catch((error) => {
    console.error('Server error:', error);
    process.exit(1);
  });
}

module.exports = { CSharpRefactorer, server };
