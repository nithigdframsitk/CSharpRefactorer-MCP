#!/usr/bin/env node

/**
 * MCP Server for C# Class Refactoring - Simplified Version
 * Provides tools to split C# classes into partial files using only method names in configuration.
 * Automatically handles method signature matching and validation.
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
    this.methodsByName = {};
    this.otherMembers = '';
    this.sourceCode = '';
    this.oldNamespace = '';
    this.processedMethods = new Set();
    this.availableClasses = []; // Add this to store all found classes
  }

  /**
   * Parses a C# source code string to extract all methods from the first class found.
   * @param {string} sourceCode - The C# source code as a string.
   * @returns {Object} A dictionary where keys are the full method signatures and values 
   * are the full text of the method, including signature and body.
   */
  parseCSharpMethods(sourceCode) {
    const methods = {};
    const methodsByName = {};

    // Group 1: The full signature text.
    // Group 2: The method name.
    const methodPattern = /^(?!#|$)\s*((?:\[[^\]]*\]\s*)*(?:(?:public|private|protected|internal|static|virtual|override|async))\s+[\w<,>\s.()\[\]]*\s+([\w<>]+)\s*(?<params>\((?:[^()]|(\?&params))*\))(?:[\s\n]*where\s+[^\{]*)?)(?=\s*\{)/gm;

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
      const methodName = match[2];
      
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
          const methodContent = (commentBlock.includes(this.classDeclaration) ? "" : commentBlock) + methodText;
          const lineCount = methodContent.split('\n').length;
          methods[signatureKey] = methodContent;
          
          // Store method by name for easy lookup
          if (!methodsByName[methodName]) {
            methodsByName[methodName] = [];
          }
          methodsByName[methodName].push({
            signature: fullSignatureRaw,
            content: methodContent,
            signatureKey: signatureKey,
            lineCount: lineCount
          });

          // Exit the inner loop and find the next method
          break;
        }
      }
      matchNum++;
    }

    this.methodsByName = methodsByName;
    return methods;
  }

  /**
   * Parse the source file to extract code elements.
   * @param {string} sourceFilePath - Path to the source file
   * @param {string} targetClassName - Optional: specific class name to process
   */
  async parseSourceFile(sourceFilePath, targetClassName = null) {
    try {
      this.sourceCode = await fs.readFile(sourceFilePath, 'utf-8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Source file not found at ${sourceFilePath}`);
      }
      throw new Error(`Error reading source file: ${error.message}`);
    }

    // Parse all classes first
    this.availableClasses = this.parseAllClasses(this.sourceCode);
    
    if (this.availableClasses.length === 0) {
      throw new Error('No classes found in the source file');
    }

    // If target class name is specified, find and use that class
    let targetClass = null;
    if (targetClassName) {
      targetClass = this.availableClasses.find(cls => cls.name === targetClassName);
      if (!targetClass) {
        throw new Error(`Class '${targetClassName}' not found. Available classes: ${this.availableClasses.map(c => c.name).join(', ')}`);
      }
    } else {
      // Use the first class if no target specified
      targetClass = this.availableClasses[0];
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

    // Set class declaration from the target class
    this.classDeclaration = targetClass.declaration;

    // Use the target class content for method parsing
    const classContent = targetClass.content;
    this.otherMembers = classContent;
    this.methods = this.parseCSharpMethods(classContent);
  }

  /**
   * Find method by name and return the best match
   * @param {string} methodName - Name of the method to find
   * @returns {Object|null} Method object with signature and content, or null if not found
   */
  findMethodByName(methodName) {
    if (!this.methodsByName[methodName]) {
      return null;
    }

    const methods = this.methodsByName[methodName];
    
    // Return the first non-processed method
    for (const method of methods) {
      if (!this.processedMethods.has(method.signatureKey)) {
        return method;
      }
    }
    
    // If all methods are processed, return null
    return null;
  }

  /**
   * Mark a method as processed
   * @param {string} signatureKey - The signature key of the method
   */
  markMethodAsProcessed(signatureKey) {
    this.processedMethods.add(signatureKey);
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

    var errors = [];
    var processedMethods = [];
    var totalLines = 0;

    // Write methods
    for (const methodName of partialClassConfig.methods) {
      const methodInfo = this.findMethodByName(methodName);

      if (methodInfo) {
        // Mark this method as processed
        this.markMethodAsProcessed(methodInfo.signatureKey);
        
        // Add method content
        content += `${methodInfo.content}\n\n`;
        
        // Track line count
        totalLines += methodInfo.lineCount;
        
        // Remove from otherMembers to avoid duplication
        this.otherMembers = this.otherMembers.replace(methodInfo.content, '');
        
        processedMethods.push({ name: methodName, lines: methodInfo.lineCount });
      } else {
        // Check if method exists but is already processed
        const allMethodsForName = this.methodsByName[methodName];
        if (allMethodsForName && allMethodsForName.length > 0) {
          // Method exists but already processed - skip silently
          continue;
        } else {
          // Method doesn't exist at all
          errors.push(`Method '${methodName}' not found in source code.`);
        }
      }
    }

    if (errors.length > 0) {
      const errorMessage = `The following errors occurred:\n\n${errors.map((error, index) => `${index + 1}. ${error}`).join('\n')}\n\nAvailable methods:\n${Object.keys(this.methodsByName).join(', ')}`;
      throw new Error(errorMessage);
    }

    // Close class and namespace
    content += '    }\n}';

    content = content.replace(/#endregion/g, '//#endregion');
    content = content.replace(/#region/g, '//#region');
    content = content.replace(/^\n\n/, /\n/); // Remove extra newlines

    // Calculate final line count including structure
    const finalLineCount = content.split('\n').length;
    
    // Validate 5000-line limit
    if (finalLineCount > 5000) {
      const methodDetails = processedMethods.map(m => `  - ${m.name}: ${m.lines} lines`).join('\n');
      throw new Error(`Generated partial class exceeds 5000-line limit!\n\nFile: ${partialClassConfig.fileName}\nTotal lines: ${finalLineCount}\nMethod lines: ${totalLines}\nStructure lines: ${finalLineCount - totalLines}\n\nMethods included:\n${methodDetails}\n\nPlease split the methods into smaller groups to stay within the 5000-line limit.`);
    }

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

  /**
   * Get all available method names
   * @returns {string[]} Array of method names
   */
  getAvailableMethodNames() {
    return Object.keys(this.methodsByName);
  }

  /**
   * Get all available classes in the source file
   * @returns {Array} Array of class objects with name, declaration, and metadata
   */
  getAvailableClasses() {
    return this.availableClasses.map(cls => ({
      name: cls.name,
      declaration: cls.declaration,
      lineCount: cls.lineCount
    }));
  }

  /**
   * Parse all classes from the source code
   * @param {string} sourceCode - The C# source code
   * @returns {Array} Array of class objects with name, declaration, and full content
   */
  parseAllClasses(sourceCode) {
    const classes = [];
    
    // Enhanced pattern to match various class types including partial, abstract, static, generic, etc.
    const classPattern = /((?:\/\*[\s\S]*?\*\/|\/\/.*$)*\s*(?:\[[^\]]*\]\s*)*(?:public|private|protected|internal)?\s+(?:static|abstract|sealed|partial)*\s*(?:partial\s+)?class\s+([A-Za-z_][A-ZaZ0-9_]*(?:<[^>]+>)?)\s*(?::\s*[^{]+)?)\s*(?=\{)/gm;
    
    let match;
    while ((match = classPattern.exec(sourceCode)) !== null) {
      const fullDeclaration = match[1].trim();
      const className = match[2];
      
      // Find the class body by tracking braces
      const classStartIndex = match.index;
      const braceIndex = sourceCode.indexOf('{', match.index + match[0].length);
      
      if (braceIndex !== -1) {
        let braceCount = 1;
        let isInString = false;
        let isInComment = false;
        let isInLineComment = false;
        
        // Find the end of the class by matching braces
        for (let i = braceIndex + 1; i < sourceCode.length; i++) {
          const char = sourceCode[i];
          const nextChar = sourceCode[i + 1];
          
          // Handle string literals
          if (char === '"' && !isInComment && !isInLineComment) {
            isInString = !isInString;
            continue;
          }
          
          // Handle comments
          if (!isInString) {
            if (char === '/' && nextChar === '*' && !isInLineComment) {
              isInComment = true;
              continue;
            }
            if (char === '*' && nextChar === '/' && isInComment) {
              isInComment = false;
              continue;
            }
            if (char === '/' && nextChar === '/' && !isInComment) {
              isInLineComment = true;
              continue;
            }
            if ((char === '\n' || char === '\r') && isInLineComment) {
              isInLineComment = false;
              continue;
            }
          }
          
          // Count braces only if not in string or comment
          if (!isInString && !isInComment && !isInLineComment) {
            if (char === '{') {
              braceCount++;
            } else if (char === '}') {
              braceCount--;
            }
          }
          
          // Found the end of the class
          if (braceCount === 0) {
            const classContent = sourceCode.slice(classStartIndex, i + 1);
            
            classes.push({
              name: className,
              declaration: fullDeclaration,
              content: classContent,
              startIndex: classStartIndex,
              endIndex: i + 1,
              lineCount: classContent.split('\n').length
            });
            break;
          }
        }
      }
    }
    
    return classes;
  }
}

/**
 * Merge multiple configuration files into a single configuration object
 * @param {string[]} configFiles - Array of configuration file paths
 * @returns {Object} Merged configuration object
 */
async function mergeConfigurations(configFiles) {
  if (!Array.isArray(configFiles) || configFiles.length === 0) {
    throw new Error('At least one configuration file must be provided');
  }

  let mergedConfig = null;
  const allPartialClasses = [];

  for (const configFile of configFiles) {
    try {
      const configContent = await fs.readFile(configFile, 'utf-8');
      const config = JSON.parse(configContent);

      if (mergedConfig === null) {
        // First configuration file sets the base structure
        mergedConfig = {
          sourceFile: config.sourceFile,
          targetClassName: config.targetClassName || null, // Add target class name support
          destinationFolder: config.destinationFolder,
          newNamespace: config.newNamespace,
          mainPartialClassName: config.mainPartialClassName,
          mainInterface: config.mainInterface || '',
          partialClasses: []
        };

        // Validate required properties in the first config
        const requiredKeys = ['sourceFile', 'destinationFolder', 'newNamespace', 'mainPartialClassName'];
        for (const key of requiredKeys) {
          if (!config[key]) {
            throw new Error(`Configuration file "${configFile}" is missing required key: "${key}". Value should not be empty.`);
          }
        }
      } else {
        // Subsequent configuration files - validate consistency
        if (config.sourceFile && config.sourceFile !== mergedConfig.sourceFile) {
          throw new Error(`Source file mismatch in "${configFile}". Expected: "${mergedConfig.sourceFile}", Found: "${config.sourceFile}"`);
        }
        if (config.targetClassName && config.targetClassName !== mergedConfig.targetClassName) {
          throw new Error(`Target class name mismatch in "${configFile}". Expected: "${mergedConfig.targetClassName}", Found: "${config.targetClassName}"`);
        }
        if (config.destinationFolder && config.destinationFolder !== mergedConfig.destinationFolder) {
          throw new Error(`Destination folder mismatch in "${configFile}". Expected: "${mergedConfig.destinationFolder}", Found: "${config.destinationFolder}"`);
        }
        if (config.newNamespace && config.newNamespace !== mergedConfig.newNamespace) {
          throw new Error(`Namespace mismatch in "${configFile}". Expected: "${mergedConfig.newNamespace}", Found: "${config.newNamespace}"`);
        }
        if (config.mainPartialClassName && config.mainPartialClassName !== mergedConfig.mainPartialClassName) {
          throw new Error(`Main partial class name mismatch in "${configFile}". Expected: "${mergedConfig.mainPartialClassName}", Found: "${config.mainPartialClassName}"`);
        }
      }

      // Add partial classes from this configuration
      if (config.partialClasses && Array.isArray(config.partialClasses)) {
        allPartialClasses.push(...config.partialClasses);
      }

    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Configuration file not found: ${configFile}`);
      }
      throw new Error(`Error processing configuration file "${configFile}": ${error.message}`);
    }
  }

  // Check for duplicate file names
  const fileNames = allPartialClasses.map(pc => pc.fileName);
  const duplicateFileNames = fileNames.filter((name, index) => fileNames.indexOf(name) !== index);
  if (duplicateFileNames.length > 0) {
    throw new Error(`Duplicate partial class file names found: ${[...new Set(duplicateFileNames)].join(', ')}`);
  }

  mergedConfig.partialClasses = allPartialClasses;
  return mergedConfig;
}

// Create the MCP server
const server = new Server(
  {
    name: 'csharp-refactorer-simple',
    version: '1.0.0',
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
    tools:
    [
      {
        name: 'list_csharp_classes',
        description: 'List all classes found in a C# source file with their declarations and line counts. This helps identify which class should be processed for refactoring.',
        inputSchema: {
          type: 'object',
          properties: {
            source_file: {
              type: 'string',
              description: 'Absolute full path to the C# source file to analyze. Ex: C:\\Users\\user\\source\\MyProject\\MyFile.cs',
            },
          },
          required: ['source_file'],
        },
      },
      {
        name: 'split_csharp_class',
        description: `Split a C# class file into multiple partial class files based on simplified JSON configuration(s). Only method names are required in the configuration. Methods should be grouped by functionality or business logic.

SINGLE CONFIG EXAMPLE:
{
    "sourceFile": "C:\\Path\\To\\Your\\SourceClass.cs",
    "targetClassName": "YourMainClass", // Optional: specify which class to process if file contains multiple classes
    "destinationFolder": "C:\\Path\\To\\Your\\Output\\{Main ClassName from the source file}",
    "newNamespace": "Your.New.Namespace", // Use existing namespace in source file if user not specified
    "mainPartialClassName": "{Main ClassName from the source file}.Core.cs",
    "mainInterface": "IMainInterface", // If interface exists, otherwise leave empty
    "partialClasses": [
        {
            "fileName": "YourClass.{Category}.cs",
            "interface": "", // Optional. Only if interface exists
            "methods": [
                "MethodOne",
                "MethodTwo",
                "MethodThree"
            ]
        }
    ]
}

MULTIPLE CONFIG EXAMPLE:
For large classes, you can split the configuration into multiple files. Each file should contain the same base properties (sourceFile, destinationFolder, newNamespace, mainPartialClassName) and its own partialClasses array with method names.

Config1.json:
{
    "sourceFile": "C:\\Path\\To\\Your\\SourceClass.cs",
    "targetClassName": "YourMainClass", // Optional: specify which class to process if file contains multiple classes
    "destinationFolder": "C:\\Path\\To\\Your\\Output\\{Main ClassName}",
    "newNamespace": "Your.New.Namespace",
    "mainPartialClassName": "{Main ClassName}.Core.cs",
    "mainInterface": "IMainInterface",
    "partialClasses": [
        {
            "fileName": "YourClass.DatabaseOperations.cs",
            "methods": ["GetUser", "SaveUser", "DeleteUser"]
        }
    ]
}

Config2.json:
{
    "sourceFile": "C:\\Path\\To\\Your\\SourceClass.cs",
    "targetClassName": "YourMainClass", // Optional: specify which class to process if file contains multiple classes
    "destinationFolder": "C:\\Path\\To\\Your\\Output\\{Main ClassName}",
    "newNamespace": "Your.New.Namespace",
    "mainPartialClassName": "{Main ClassName}.Core.cs",
    "partialClasses": [
        {
            "fileName": "YourClass.BusinessLogic.cs",
            "methods": ["ProcessData", "ValidateInput", "CalculateResults"]
        }
    ]
}

NOTES:
- If sourceFile contains multiple classes, use 'targetClassName' to specify which class to process
- Use 'list_csharp_classes' tool first to see all available classes
- Methods already moved to partial classes will be ignored in subsequent processing
- Only method names are required (no signatures or parameter details)
- Methods not found in source will be reported as errors
- Duplicate method assignments across configs will be handled gracefully
- Each partial class is limited to 5000 lines maximum
- Line counts are calculated and enforced automatically`,
        inputSchema: {
          type: 'object',
          properties: {
            config_file: {
              type: 'string',
              description: 'Absolute full path to the JSON configuration file OR comma-separated list of multiple config file paths. Ex: C:\\Users\\user\\config.json OR C:\\Users\\user\\config1.json,C:\\Users\\user\\config2.json',
            },
          },
          required: ['config_file'],
        },
      },
      {
        name: 'list_csharp_methods',
        description: 'List all method names found in a C# class file with line counts. This tool is useful for creating simplified configuration files and estimating partial class sizes.',
        inputSchema: {
          type: 'object',
          properties: {
            source_file: {
              type: 'string',
              description: 'Absolute full Path to the C# source file to analyze. Ex: C:\\Users\\user\\source\\MyProject\\MyClass.cs',
            },
            target_class_name: {
              type: 'string',
              description: 'Optional: specific class name to analyze if the file contains multiple classes. If not specified, the first class found will be used.',
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

      return await ProcessSplitCSharpclassSimple(config_file);
    } else if (name === 'list_csharp_classes') {
      return await listCSharpClasses(args.source_file);
    } else if (name === 'list_csharp_methods') {
      return await listCSharpMethodsSimple(args.source_file, args.target_class_name);
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

async function listCSharpMethodsSimple(source_file, target_class_name = null) {
  // Create refactorer instance
  const refactorer = new CSharpRefactorer();

  // Parse source file with optional target class name
  await refactorer.parseSourceFile(source_file, target_class_name);

  // Format methods information
  const methodNames = refactorer.getAvailableMethodNames();
  
  if (methodNames.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: `No methods found in ${source_file}${target_class_name ? ` for class "${target_class_name}"` : ''}`,
        },
      ],
    };
  }

  const methodsInfo = [];
  methodsInfo.push(`Method names found in ${source_file}${target_class_name ? ` for class "${target_class_name}"` : ''}:`);
  methodsInfo.push('='.repeat(50));
  methodsInfo.push('');

  let totalLines = 0;

  // Group methods by name and show overloads with line counts
  methodNames.forEach((methodName, index) => {
    const methodOverloads = refactorer.methodsByName[methodName];
    const methodLines = methodOverloads[0].lineCount; // Use first overload for line count
    totalLines += methodLines;
    
    methodsInfo.push(`${index + 1}. ${methodName} (${methodLines} lines)`);
    
    if (methodOverloads.length > 1) {
      methodsInfo.push(`   (${methodOverloads.length} overloads)`);
    }
    
    methodsInfo.push('');
  });

  methodsInfo.push('');
  methodsInfo.push(`Total methods: ${methodNames.length}`);
  methodsInfo.push(`Total lines: ${totalLines}`);
  methodsInfo.push('');
  
  // Show available classes if multiple classes exist
  if (refactorer.availableClasses.length > 1) {
    methodsInfo.push('Available classes in this file:');
    refactorer.availableClasses.forEach((cls, index) => {
      methodsInfo.push(`  ${index + 1}. ${cls.name} (${cls.lineCount} lines)`);
    });
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

async function listCSharpClasses(source_file) {
  // Create refactorer instance
  const refactorer = new CSharpRefactorer();

  // Parse source file to get all classes
  await refactorer.parseSourceFile(source_file);

  // Get available classes
  const classes = refactorer.getAvailableClasses();
  
  if (classes.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: `No classes found in ${source_file}`,
        },
      ],
    };
  }

  const classesInfo = [];
  classesInfo.push(`Classes found in ${source_file}:`);
  classesInfo.push('='.repeat(50));
  classesInfo.push('');

  // Display class information
  classes.forEach((cls, index) => {
    classesInfo.push(`${index + 1}. ${cls.name} (${cls.lineCount} lines)`);
    classesInfo.push(`   Declaration: ${cls.declaration}`);
    classesInfo.push('');
  });

  classesInfo.push(`Total classes: ${classes.length}`);
  classesInfo.push('');
  classesInfo.push('Use the "list_csharp_methods" tool with target_class_name to see methods for a specific class.');

  return {
    content: [
      {
        type: 'text',
        text: classesInfo.join('\n'),
      },
    ],
  };
}

async function ProcessSplitCSharpclassSimple(config_file_input) {
  // Parse config file(s) - can be single file or comma-separated list
  const configFiles = config_file_input.split(',').map(file => file.trim());
  
  // Merge all configuration files
  const config = await mergeConfigurations(configFiles);

  // Map properties from the merged config
  const source_file = config.sourceFile;
  const target_class_name = config.targetClassName; // Add target class name support
  const destination_folder = config.destinationFolder;
  const new_namespace = config.newNamespace;
  const main_partial_class_file_name = config.mainPartialClassName;
  const partial_classes = config.partialClasses;
  const main_interface = config.mainInterface || '';

  // Create refactorer instance
  const refactorer = new CSharpRefactorer();

  // Parse source file with optional target class name
  await refactorer.parseSourceFile(source_file, target_class_name);

  // Create destination folder if it doesn't exist
  await fs.mkdir(destination_folder, { recursive: true });

  const results = [];
  results.push(`Processed ${configFiles.length} configuration file(s):`);
  configFiles.forEach(file => results.push(`  - ${file}`));
  results.push('');
  
  // Show which class was processed if multiple classes exist
  if (refactorer.availableClasses.length > 1) {
    const processedClass = target_class_name || refactorer.availableClasses[0].name;
    results.push(`Processing class: ${processedClass}`);
    results.push(`Available classes: ${refactorer.availableClasses.map(c => c.name).join(', ')}`);
    results.push('');
  }

  // Generate partial class files
  for (const partialClass of partial_classes) {
    const fileName = partialClass.fileName;
    const filePath = path.join(destination_folder, fileName);

    // Generate content for the partial class file
    const content = await refactorer.generatePartialClass(partialClass, new_namespace);

    // Get no of lines in the content
    const lineCount = content.split('\n').length;
    if (lineCount > 5000) {
      throw new Error(`Generated partial file ${fileName} exceeds 5000 lines. Please split the methods into smaller groups in the configuration.`);
    }

    // Write content to file
    await fs.writeFile(filePath, content, 'utf-8');

    results.push(`Generated: ${filePath} (${partialClass.methods.length} methods requested, ${lineCount} lines)`);
  }

  // Generate main partial class file
  const mainFilePath = path.join(destination_folder, main_partial_class_file_name);
  const mainContent = refactorer.generateMainPartialClass(
    new_namespace,
    main_partial_class_file_name,
    main_interface
  );

  await fs.writeFile(mainFilePath, mainContent, 'utf-8');
  results.push(`Generated: ${mainFilePath} (main partial class)`);

  // Report any unprocessed methods
  const unprocessedMethods = [];
  for (const [methodName, methods] of Object.entries(refactorer.methodsByName)) {
    const hasUnprocessed = methods.some(method => !refactorer.processedMethods.has(method.signatureKey));
    if (hasUnprocessed) {
      unprocessedMethods.push(methodName);
    }
  }

  if (unprocessedMethods.length > 0) {
    results.push('');
    results.push('Note: The following methods were not assigned to any partial class:');
    unprocessedMethods.forEach(method => results.push(`  - ${method}`));
    results.push('These methods will remain in the main partial class file.');
  }

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
  console.error('C# Refactorer Simple MCP Server running on stdio');
}

// Run the server if this file is executed directly
if (require.main === module) {
  
  ProcessSplitCSharpclassSimple("C:\\Tools\\Split 4 with simple tool\\Config1_UserManagement.json,C:\\Tools\\Split 4 with simple tool\\Config2_OrganizationStructureCore.json,C:\\Tools\\Split 4 with simple tool\\Config3_OrganizationStructureExtended.json,C:\\Tools\\Split 4 with simple tool\\Config4_ServiceAreaManagement.json,C:\\Tools\\Split 4 with simple tool\\Config5_DepartmentOperations.json,C:\\Tools\\Split 4 with simple tool\\Config6_ExcelExportOperations.json,C:\\Tools\\Split 4 with simple tool\\Config7_InvestmentsManagement.json,C:\\Tools\\Split 4 with simple tool\\Config8_AzureCloudOperations.json,C:\\Tools\\Split 4 with simple tool\\Config9_BudgetManagement.json,C:\\Tools\\Split 4 with simple tool\\Config10_ActionTypeManagement.json,C:\\Tools\\Split 4 with simple tool\\Config11_TemplateConfigurationManagement.json,C:\\Tools\\Split 4 with simple tool\\Config12_PublishingNodeOperations.json,C:\\Tools\\Split 4 with simple tool\\Config13_TextProcessingUtilities.json,C:\\Tools\\Split 4 with simple tool\\Config14_ColorVisualManagement.json,C:\\Tools\\Split 4 with simple tool\\Config15_JobManagementApplicationFlags.json,C:\\Tools\\Split 4 with simple tool\\Config16_AdjustmentCodeManagement.json,C:\\Tools\\Split 4 with simple tool\\Config17_MiscellaneousOperations.json,C:\\Tools\\Split 4 with simple tool\\Config18_DataProcessingOperations.json,C:\\Tools\\Split 4 with simple tool\\Config19_UtilityMiscellaneous.json");

  main().catch((error) => {
    console.error('Server error:', error);
    process.exit(1);
  });
}

module.exports = { CSharpRefactorer, server, listCSharpMethodsSimple, ProcessSplitCSharpclassSimple };
