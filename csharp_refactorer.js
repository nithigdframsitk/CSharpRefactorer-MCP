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
    const methodPattern = /^(?!#|$)\s*((?:\[[^\]]*\]\s*)*(?:(?:public|private|protected|internal|static|virtual|override|async))\s+[\w<,>\s.()\?\[\]]*\s+([\w<>]+)\s*(?<params>\((?:[^()]|(\?&params))*\))(?:[\s\n]*where\s+[^\{]*)?)(?=\s*\{)/gm;

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
    // this.otherMembers = classContent;
    this.methods = this.parseCSharpMethods(classContent);
  }

  /**
   * Find method by name and return the best match
   * @param {string} methodName - Name of the method to find
   * @returns {Object|null} Method Array of object with signature and content, or null if not found
   */
  findMethodByName(methodName) {
    if (!this.methodsByName[methodName]) {
      return null;
    }

    const methods = this.methodsByName[methodName];

    return methods;

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

    var processedMethods = [];
    var totalLines = 0;

    // Write methods (all methods are guaranteed to exist due to pre-validation)
    for (const methodName of partialClassConfig.methods) {
      const methodInfoList = this.findMethodByName(methodName);

      // If method is already processed, skip it silently (this is allowed)
      if (!methodInfoList) {
        continue;
      }

      for (let key in methodInfoList) {
        let methodInfo = methodInfoList[key];
        // Mark this method as processed
        this.markMethodAsProcessed(methodInfo.signatureKey);

        // Add method content
        content += `${methodInfo.content}\n\n`;

        // Track line count
        totalLines += methodInfo.lineCount;

        // Remove from sourceCode to avoid duplication
        this.sourceCode = this.sourceCode.replace(methodInfo.content, '');

        processedMethods.push({ name: methodName, lines: methodInfo.lineCount });
      }
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
    let content = this.sourceCode;

    // Replace namespace
    if (this.oldNamespace) {
      content = content.replace(
        `namespace ${this.oldNamespace}`,
        `namespace ${newNamespace}`
      );
    }

    // Make the main class partial (extract class name from declaration)
    const mainClassNameMatch = this.classDeclaration.match(/public\s+(?:\w+\s+)*?class\s+(\w+)/);
    if (mainClassNameMatch) {
      const mainClassName = mainClassNameMatch[1];
      // Replace only the specific main class with partial
      const mainClassPattern = new RegExp(`(public\\s+(?:\\w+\\s+)*?)class\\s+(${mainClassName})`, 'g');
      content = content.replace(mainClassPattern, '$1partial class $2');
    }

    // Add interface if specified
    if (mainInterface) {
      const mainClassNameForInterface = mainClassNameMatch ? mainClassNameMatch[1] : '';
      if (mainClassNameForInterface) {
        const classPattern = new RegExp(`(public\\s+(?:\\w+\\s+)*?partial\\s+class\\s+${mainClassNameForInterface}(?:\\s*<[^>{}]+>)?)`, 'g');
        content = content.replace(classPattern, `$1 : ${mainInterface}`);
      }
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

    // Simple and fast pattern to find class declarations
    const classPattern = /(public\s+(?:\w+\s+)*?class\s+(\w+)(?:\s*<[^>{}]+>)?.*?)(?=\s*{)/g;

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
        let escapeNext = false;

        // Find the end of the class by matching braces
        for (let i = braceIndex + 1; i < sourceCode.length; i++) {
          const char = sourceCode[i];
          const nextChar = sourceCode[i + 1];

          // Handle escaped characters
          if (escapeNext) {
            escapeNext = false;
            continue;
          }

          if (char === '\\' && isInString) {
            escapeNext = true;
            continue;
          }

          // Handle string literals
          if (char === '"' && !isInComment && !isInLineComment) {
            isInString = !isInString;
            continue;
          }

          // Skip if we're in a string
          if (isInString) {
            continue;
          }

          // Handle multi-line comments
          if (char === '/' && nextChar === '*' && !isInLineComment) {
            isInComment = true;
            i++; // Skip the '*'
            continue;
          }

          if (char === '*' && nextChar === '/' && isInComment) {
            isInComment = false;
            i++; // Skip the '/'
            continue;
          }

          // Handle single-line comments
          if (char === '/' && nextChar === '/' && !isInComment) {
            isInLineComment = true;
            i++; // Skip the second '/'
            continue;
          }

          if ((char === '\n' || char === '\r') && isInLineComment) {
            isInLineComment = false;
            continue;
          }

          // Count braces only if not in string or comment
          if (!isInComment && !isInLineComment) {
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

  /**
   * Parse method calls within a method body
   * @param {string} methodContent - The method content to analyze
   * @returns {Array} Array of method call objects with class and method names
   */
  parseMethodCalls(methodContent) {
    const methodCalls = [];
    
    // Extract only the method body (content between the first '{' and last '}')
    const firstBraceIndex = methodContent.indexOf('{');
    const lastBraceIndex = methodContent.lastIndexOf('}');
    
    if (firstBraceIndex === -1 || lastBraceIndex === -1 || firstBraceIndex >= lastBraceIndex) {
      return methodCalls; // No valid method body found
    }
    
    const methodBody = methodContent.substring(firstBraceIndex + 1, lastBraceIndex);
    
    // Pattern to match method calls like:
    // - this.MethodName()
    // - ClassName.MethodName()
    // - instance.MethodName()
    // - await MethodName()
    // - MethodName()
    const methodCallPattern = /(?:(?:this|await)\s*\.)?\s*(?:(\w+)\s*\.)?\s*(\w+)\s*\(/g;
    
    let match;
    while ((match = methodCallPattern.exec(methodBody)) !== null) {
      const className = match[1] || 'this'; // Default to 'this' if no class specified
      const methodName = match[2];
      
      // Filter out common keywords and built-in methods
      const excludeKeywords = [
        'if', 'while', 'for', 'foreach', 'switch', 'using', 'lock', 'try', 'catch', 'finally',
        'new', 'return', 'throw', 'yield', 'var', 'int', 'string', 'bool', 'double', 'float',
        'DateTime', 'TimeSpan', 'Guid', 'List', 'Dictionary', 'Array', 'Task', 'async', 'await',
        'Console', 'Debug', 'Trace', 'Math', 'Convert', 'Parse', 'ToString', 'GetType',
        'Equals', 'GetHashCode', 'CompareTo', 'Clone', 'Dispose'
      ];
      
      if (!excludeKeywords.includes(methodName) && methodName.length > 1) {
        methodCalls.push({
          className: className,
          methodName: methodName,
          fullCall: match[0]
        });
      }
    }
    
    return methodCalls;
  }

  /**
   * Build a dependency tree starting from a specific method
   * @param {string} startClassName - The starting class name
   * @param {string} startMethodName - The starting method name
   * @param {number} maxDepth - Maximum depth to traverse (default: 3)
   * @returns {Object} Dependency tree object
   */
  buildDependencyTree(startClassName, startMethodName, maxDepth = 3) {
    const callStack = new Set(); // Track current call stack for circular detection
    const dependencyTree = {
      root: {
        className: startClassName,
        methodName: startMethodName,
        dependencies: []
      }
    };
    
    const buildNode = (className, methodName, currentDepth) => {
      if (currentDepth >= maxDepth) return null;
      
      const nodeKey = `${className}.${methodName}`;
      
      // Check if this method is already in our current call stack (circular dependency)
      if (callStack.has(nodeKey)) {
        return { className, methodName, circular: true, dependencies: [] };
      }
      
      // Add to call stack before processing dependencies
      callStack.add(nodeKey);
      
      // Find the method in our parsed methods
      let methodInfo = null;
      if (className === 'this' || className === startClassName) {
        methodInfo = this.methodsByName[methodName]?.[0];
      }
      
      const node = {
        className,
        methodName,
        dependencies: [],
        found: !!methodInfo,
        lineCount: methodInfo?.lineCount || 0
      };
      
      if (methodInfo) {
        const methodCalls = this.parseMethodCalls(methodInfo.content);
        
        for (const call of methodCalls) {
          const childNode = buildNode(call.className, call.methodName, currentDepth + 1);
          if (childNode) {
            node.dependencies.push(childNode);
          }
        }
      }
      
      // Remove from call stack after processing all dependencies
      callStack.delete(nodeKey);
      
      return node;
    };
    
    dependencyTree.root = buildNode(startClassName, startMethodName, 0);
    return dependencyTree;
  }

  /**
   * Get method body by class name and method name
   * @param {string} className - The class name (use 'this' for current class)
   * @param {string} methodName - The method name
   * @returns {Object|null} Method information object or null if not found
   */
  getMethodBody(className, methodName) {
    // For current class or 'this', search in parsed methods
    if (className === 'this' || !className || this.availableClasses.some(cls => cls.name === className)) {
      const methods = this.methodsByName[methodName];
      if (methods && methods.length > 0) {
        return {
          className: className || 'this',
          methodName: methodName,
          methods: methods.map(method => ({
            signature: method.signature,
            content: method.content,
            lineCount: method.lineCount,
            signatureKey: method.signatureKey
          }))
        };
      }
    }
    
    return null;
  }

  /**
   * Find all methods that call a specific method (reverse dependency)
   * @param {string} targetMethodName - The method name to find callers for
   * @returns {Array} Array of methods that call the target method
   */
  findMethodCallers(targetMethodName) {
    const callers = [];
    
    for (const [methodName, methodList] of Object.entries(this.methodsByName)) {
      for (const method of methodList) {
        const calls = this.parseMethodCalls(method.content);
        const callsTarget = calls.some(call => call.methodName === targetMethodName);
        
        if (callsTarget) {
          callers.push({
            className: 'this',
            methodName: methodName,
            signature: method.signature,
            lineCount: method.lineCount,
            calls: calls.filter(call => call.methodName === targetMethodName)
          });
        }
      }
    }
    
    return callers;
  }

  /**
   * Get method statistics and complexity metrics
   * @param {string} methodName - The method name to analyze
   * @returns {Object|null} Method statistics or null if not found
   */
  getMethodStatistics(methodName) {
    const methods = this.methodsByName[methodName];
    if (!methods || methods.length === 0) {
      return null;
    }
    
    const stats = {
      methodName: methodName,
      overloadCount: methods.length,
      totalLines: 0,
      averageLines: 0,
      methodCalls: [],
      dependencies: []
    };
    
    for (const method of methods) {
      stats.totalLines += method.lineCount;
      const calls = this.parseMethodCalls(method.content);
      stats.methodCalls.push(...calls);
    }
    
    stats.averageLines = Math.round(stats.totalLines / methods.length);
    stats.dependencies = [...new Set(stats.methodCalls.map(call => call.methodName))];
    
    return stats;
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
          description: 'List all method signatures found in a C# class file with line counts. This tool shows the complete method signatures including parameters, return types, and access modifiers. Useful for creating simplified configuration files and estimating partial class sizes.',
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
        {
          name: 'build_dependency_tree',
          description: 'Build a dependency tree starting from a specific method. This shows all methods called by the starting method and their sub-dependencies, useful for understanding code flow and impact analysis.',
          inputSchema: {
            type: 'object',
            properties: {
              source_file: {
                type: 'string',
                description: 'Absolute full path to the C# source file to analyze. Ex: C:\\Users\\user\\source\\MyProject\\MyClass.cs',
              },
              target_class_name: {
                type: 'string',
                description: 'Optional: specific class name to analyze if the file contains multiple classes. If not specified, the first class found will be used.',
              },
              start_method_name: {
                type: 'string',
                description: 'The method name to start building the dependency tree from (e.g., controller action method).',
              },
              max_depth: {
                type: 'number',
                description: 'Maximum depth to traverse in the dependency tree. Default is 3. Higher values may take longer but provide more complete analysis.',
                default: 3
              },
            },
            required: ['source_file', 'start_method_name'],
          },
        },
        {
          name: 'get_method_body',
          description: 'Get the complete method body/content by class name and method name. Useful for detailed code analysis and understanding method implementation.',
          inputSchema: {
            type: 'object',
            properties: {
              source_file: {
                type: 'string',
                description: 'Absolute full path to the C# source file to analyze. Ex: C:\\Users\\user\\source\\MyProject\\MyClass.cs',
              },
              target_class_name: {
                type: 'string',
                description: 'Optional: specific class name to analyze if the file contains multiple classes. If not specified, the first class found will be used.',
              },
              method_name: {
                type: 'string',
                description: 'The method name to retrieve the body for.',
              },
            },
            required: ['source_file', 'method_name'],
          },
        },
        {
          name: 'find_method_callers',
          description: 'Find all methods that call a specific target method (reverse dependency analysis). Useful for impact analysis when modifying a method.',
          inputSchema: {
            type: 'object',
            properties: {
              source_file: {
                type: 'string',
                description: 'Absolute full path to the C# source file to analyze. Ex: C:\\Users\\user\\source\\MyProject\\MyClass.cs',
              },
              target_class_name: {
                type: 'string',
                description: 'Optional: specific class name to analyze if the file contains multiple classes. If not specified, the first class found will be used.',
              },
              target_method_name: {
                type: 'string',
                description: 'The method name to find callers for.',
              },
            },
            required: ['source_file', 'target_method_name'],
          },
        },
        {
          name: 'get_method_statistics',
          description: 'Get detailed statistics and complexity metrics for a specific method including line counts, dependencies, and method calls.',
          inputSchema: {
            type: 'object',
            properties: {
              source_file: {
                type: 'string',
                description: 'Absolute full path to the C# source file to analyze. Ex: C:\\Users\\user\\source\\MyProject\\MyClass.cs',
              },
              target_class_name: {
                type: 'string',
                description: 'Optional: specific class name to analyze if the file contains multiple classes. If not specified, the first class found will be used.',
              },
              method_name: {
                type: 'string',
                description: 'The method name to get statistics for.',
              },
            },
            required: ['source_file', 'method_name'],
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
    } else if (name === 'build_dependency_tree') {
      return await buildDependencyTree(args.source_file, args.target_class_name, args.start_method_name, args.max_depth);
    } else if (name === 'get_method_body') {
      return await getMethodBody(args.source_file, args.target_class_name, args.method_name);
    } else if (name === 'find_method_callers') {
      return await findMethodCallers(args.source_file, args.target_class_name, args.target_method_name);
    } else if (name === 'get_method_statistics') {
      return await getMethodStatistics(args.source_file, args.target_class_name, args.method_name);
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
  methodsInfo.push(`Method signatures found in ${source_file}${target_class_name ? ` for class "${target_class_name}"` : ''}:`);
  methodsInfo.push('='.repeat(50));
  methodsInfo.push('');

  let totalLines = 0;

  // Group methods by name and show overloads with full signatures and line counts
  methodNames.forEach((methodName, index) => {
    const methodOverloads = refactorer.methodsByName[methodName];
    let methodTotalLines = 0;

    methodsInfo.push(`${index + 1}. ${methodName}:`);

    // Show each overload with its full signature
    methodOverloads.forEach((method, overloadIndex) => {
      methodTotalLines += method.lineCount;
      const overloadLabel = methodOverloads.length > 1 ? ` [Overload ${overloadIndex + 1}]` : '';
      methodsInfo.push(`   ${method.signature}${overloadLabel}`);
      methodsInfo.push(`   (${method.lineCount} lines)`);
      if (overloadIndex < methodOverloads.length - 1) {
        methodsInfo.push('');
      }
    });

    totalLines += methodTotalLines;
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

  // Validate all methods in all partial classes before generating any files
  const allErrors = [];
  const allRequestedMethods = [];
  
  for (const partialClass of partial_classes) {
    for (const methodName of partialClass.methods) {
      allRequestedMethods.push({ methodName, fileName: partialClass.fileName });
      
      // Check if method exists
      if (!refactorer.methodsByName[methodName]) {
        allErrors.push(`Method '${methodName}' not found in source code (requested in ${partialClass.fileName})`);
      }
    }
  }
  
  // Check if all methods from source code are included in the configuration
  const availableMethodNames = Object.keys(refactorer.methodsByName);
  const requestedMethodNames = allRequestedMethods.map(m => m.methodName);
  const missingFromConfig = availableMethodNames.filter(methodName => !requestedMethodNames.includes(methodName));
  
  if (missingFromConfig.length > 0) {
    allErrors.push(`Configuration is incomplete. The following methods from source code are not included in any partial class:\n${missingFromConfig.map(method => `  - ${method}`).join('\n')}\n\nAll methods must be assigned to a partial class configuration.`);
  }
  
  // If there are any validation errors, throw an error and don't generate any files
  if (allErrors.length > 0) {
    const errorMessage = `Cannot generate partial classes due to validation errors:\n\n${allErrors.map((error, index) => `${index + 1}. ${error}`).join('\n')}\n\nAvailable methods in source code:\n${availableMethodNames.join(', ')}`;
    throw new Error(errorMessage);
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

  main().catch((error) => {
    console.error('Server error:', error);
    process.exit(1);
  });
}

module.exports = { CSharpRefactorer, server, listCSharpMethodsSimple, ProcessSplitCSharpclassSimple };

async function buildDependencyTree(source_file, target_class_name = null, start_method_name, max_depth = 3) {
  // Create refactorer instance
  const refactorer = new CSharpRefactorer();

  // Parse source file with optional target class name
  await refactorer.parseSourceFile(source_file, target_class_name);

  // Check if the starting method exists
  if (!refactorer.methodsByName[start_method_name]) {
    return {
      content: [
        {
          type: 'text',
          text: `Method '${start_method_name}' not found in ${source_file}${target_class_name ? ` for class "${target_class_name}"` : ''}.\n\nAvailable methods:\n${Object.keys(refactorer.methodsByName).join(', ')}`,
        },
      ],
    };
  }

  // Build dependency tree
  const startClassName = target_class_name || refactorer.availableClasses[0]?.name || 'this';
  const dependencyTree = refactorer.buildDependencyTree(startClassName, start_method_name, max_depth);

  // Format the tree for display
  const formatTree = (node, depth = 0, prefix = '') => {
    const indent = '  '.repeat(depth);
    const status = node.circular ? ' (circular)' : node.found ? '' : ' (not found)';
    const lines = node.lineCount > 0 ? ` [${node.lineCount} lines]` : '';
    
    let result = `${indent}${prefix}${node.methodName}${lines}${status}\n`;
    
    if (node.dependencies && node.dependencies.length > 0 && !node.circular) {
      node.dependencies.forEach((dep, index) => {
        const isLast = index === node.dependencies.length - 1;
        const depPrefix = isLast ? '└── ' : '├── ';
        result += formatTree(dep, depth + 1, depPrefix);
      });
    }
    
    return result;
  };

  const treeDisplay = formatTree(dependencyTree.root);
  
  // Count total methods and found methods
  const countMethods = (node, counts = { total: 0, found: 0, circular: 0 }) => {
    counts.total++;
    if (node.found) counts.found++;
    if (node.circular) counts.circular++;
    
    if (node.dependencies) {
      node.dependencies.forEach(dep => countMethods(dep, counts));
    }
    
    return counts;
  };
  
  const stats = countMethods(dependencyTree.root);

  const result = [];
  result.push(`Dependency Tree for ${start_method_name} in ${source_file}${target_class_name ? ` (class: ${target_class_name})` : ''}:`);
  result.push('='.repeat(80));
  result.push('');
  result.push(treeDisplay);
  result.push(`Statistics:`);
  result.push(`- Total methods in tree: ${stats.total}`);
  result.push(`- Methods found in source: ${stats.found}`);
  result.push(`- Circular references: ${stats.circular}`);
  result.push(`- Max depth analyzed: ${max_depth}`);
  
  return {
    content: [
      {
        type: 'text',
        text: result.join('\n'),
      },
    ],
  };
}

async function getMethodBody(source_file, target_class_name = null, method_name) {
  // Create refactorer instance
  const refactorer = new CSharpRefactorer();

  // Parse source file with optional target class name
  await refactorer.parseSourceFile(source_file, target_class_name);

  // Get method body
  const methodInfo = refactorer.getMethodBody(target_class_name || 'this', method_name);

  if (!methodInfo) {
    return {
      content: [
        {
          type: 'text',
          text: `Method '${method_name}' not found in ${source_file}${target_class_name ? ` for class "${target_class_name}"` : ''}.\n\nAvailable methods:\n${Object.keys(refactorer.methodsByName).join(', ')}`,
        },
      ],
    };
  }

  const result = [];
  result.push(`Method Body for '${method_name}' in ${source_file}${target_class_name ? ` (class: ${target_class_name})` : ''}:`);
  result.push('='.repeat(80));
  result.push('');

  methodInfo.methods.forEach((method, index) => {
    if (methodInfo.methods.length > 1) {
      result.push(`Overload ${index + 1}:`);
      result.push('-'.repeat(40));
    }
    result.push(`Signature: ${method.signature}`);
    result.push(`Line Count: ${method.lineCount}`);
    result.push('');
    result.push('Method Content:');
    result.push('```csharp');
    result.push(method.content);
    result.push('```');
    result.push('');
  });

  return {
    content: [
      {
        type: 'text',
        text: result.join('\n'),
      },
    ],
  };
}

async function findMethodCallers(source_file, target_class_name = null, target_method_name) {
  // Create refactorer instance
  const refactorer = new CSharpRefactorer();

  // Parse source file with optional target class name
  await refactorer.parseSourceFile(source_file, target_class_name);

  // Find callers
  const callers = refactorer.findMethodCallers(target_method_name);

  if (callers.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: `No methods found that call '${target_method_name}' in ${source_file}${target_class_name ? ` for class "${target_class_name}"` : ''}.`,
        },
      ],
    };
  }

  const result = [];
  result.push(`Methods calling '${target_method_name}' in ${source_file}${target_class_name ? ` (class: ${target_class_name})` : ''}:`);
  result.push('='.repeat(80));
  result.push('');

  callers.forEach((caller, index) => {
    result.push(`${index + 1}. ${caller.methodName} (${caller.lineCount} lines)`);
    result.push(`   Signature: ${caller.signature}`);
    result.push(`   Calls to ${target_method_name}: ${caller.calls.length}`);
    caller.calls.forEach(call => {
      result.push(`     - ${call.fullCall}`);
    });
    result.push('');
  });

  result.push(`Total methods calling '${target_method_name}': ${callers.length}`);

  return {
    content: [
      {
        type: 'text',
        text: result.join('\n'),
      },
    ],
  };
}

async function getMethodStatistics(source_file, target_class_name = null, method_name) {
  // Create refactorer instance
  const refactorer = new CSharpRefactorer();

  // Parse source file with optional target class name
  await refactorer.parseSourceFile(source_file, target_class_name);

  // Get method statistics
  const stats = refactorer.getMethodStatistics(method_name);

  if (!stats) {
    return {
      content: [
        {
          type: 'text',
          text: `Method '${method_name}' not found in ${source_file}${target_class_name ? ` for class "${target_class_name}"` : ''}.\n\nAvailable methods:\n${Object.keys(refactorer.methodsByName).join(', ')}`,
        },
      ],
    };
  }

  const result = [];
  result.push(`Statistics for method '${method_name}' in ${source_file}${target_class_name ? ` (class: ${target_class_name})` : ''}:`);
  result.push('='.repeat(80));
  result.push('');
  
  result.push(`Method Name: ${stats.methodName}`);
  result.push(`Overload Count: ${stats.overloadCount}`);
  result.push(`Total Lines: ${stats.totalLines}`);
  result.push(`Average Lines per Overload: ${stats.averageLines}`);
  result.push('');
  
  result.push(`Dependencies (${stats.dependencies.length} unique methods):`);
  stats.dependencies.forEach((dep, index) => {
    result.push(`  ${index + 1}. ${dep}`);
  });
  result.push('');
  
  result.push(`All Method Calls (${stats.methodCalls.length} total):`);
  const callCounts = {};
  stats.methodCalls.forEach(call => {
    const key = `${call.className}.${call.methodName}`;
    callCounts[key] = (callCounts[key] || 0) + 1;
  });
  
  Object.entries(callCounts)
    .sort(([,a], [,b]) => b - a)
    .forEach(([method, count], index) => {
      result.push(`  ${index + 1}. ${method} (${count} calls)`);
    });

  return {
    content: [
      {
        type: 'text',
        text: result.join('\n'),
      },
    ],
  };
}
