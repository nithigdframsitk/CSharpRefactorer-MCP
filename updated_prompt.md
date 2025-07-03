# Sequential Thinking Plan for C# File Splitting by Business Logic

## Overview
This task requires splitting a C# utility file into logical partial classes based on business functionality while adhering to line count constraints. This updated plan uses the simplified MCP server that only requires method names (not full signatures) for configuration.

## Sequential Thinking Plan

### Phase 1: Initial Analysis and Setup
**Step 1.1: File Discovery and Validation**
- Tool: `list_csharp_methods`
- Target: `C:\Users\NithiDhanasekaran\source\repos\Framsikt Product Development\Framsikt\Framsikt.BL\Utility.cs`
- Validation: Confirm file exists and method names with line counts are extracted successfully
- Expected Output: Complete list of method names with individual line counts and total line count
- Branch A: If file not found → Report error and terminate
- Branch B: If methods found → Continue to Step 1.2

**Step 1.2: Method Inventory Assessment**
- Tool: Manual analysis
- Action: Count total method names and calculate total line count for categorization strategy
- Validation: Total method count > 0 and total line count available
- Expected Output: Total method count, total line count, and categorization strategy
- Branch A: If <10 methods → Single category approach
- Branch B: If 10-50 methods → Standard categorization
- Branch C: If >50 methods → Batch processing approach

### Phase 2: Business Logic Analysis and Categorization

**Step 2.1: Initial Method Analysis (First 80 method names)**
- Tool: Sequential thinking analysis
- Action: Analyze method names and their line counts to identify business logic patterns
- Validation: Each method categorized with reasoning based on method name and line count consideration
- Expected Output: Initial category definitions with method name assignments and estimated line counts
- Categories to consider: Data validation, file operations, string manipulation, calculations, etc.

**Step 2.2: Category Definition and Line Count Validation**
- Tool: Manual calculation
- Action: For each identified category, calculate total line count using individual method line counts
- Validation: Categories are logically coherent, business-focused, and do not exceed 5000 lines
- Expected Output: Category definitions with method name lists and accurate line count totals
- Branch A: If category >5000 lines → Split into sub-categories
- Branch B: If category <5000 lines → Keep as single category

**Step 2.3: Iterative Method Processing (Remaining methods in batches of 80)**
- Tool: Sequential analysis per batch
- Action: For each batch of 80 method names:
  - Analyze method names and line counts for business logic patterns
  - Attempt to fit into existing categories (checking 5000-line limit)
  - Create new categories if needed
  - Ensure logical grouping by functionality
  - Recalculate category line counts after each addition
- Validation: All methods assigned to categories, no duplicates, no category exceeds 5000 lines
- Branch A: Category Refinements
  - Integrate: If a method aligns with an existing category and doesn't exceed line limit, add it there
  - Generalize: If a category name can be broadened to encompass more methods, update it
  - Logical Grouping: Organize methods by their business functionality, avoiding generic or temporary names like "Remaining Methods," "part1," "part2," or "final"
  - Cleanup: Remove any temporary configurations created during this process
- Branch B: If new functionality → Create new category
- Branch C: If adding method would exceed 5000 lines → Split category or create new one

### Phase 3: Configuration Generation and Validation

**Step 3.1: Simplified JSON Configuration Creation**
- Tool: Configuration generator
- Action: Create JSON configuration for each final category using simplified schema (method names only)
- Validation: Each configuration file validates against simplified schema
- Expected Output: Valid JSON configurations with method names only

**Simplified Configuration Schema:**
```json
{
    "sourceFile": "C:\\Path\\To\\Source.cs",
    "destinationFolder": "C:\\Path\\To\\Output",
    "newNamespace": "Your.Namespace",
    "mainPartialClassName": "YourClass.Core.cs",
    "targetClassName": "YourMainClass", // Optional: specify which class to process if file contains multiple classes
    "partialClasses": [
        {
            "fileName": "YourClass.CategoryName.cs",
            "methods": [
                "MethodName1",
                "MethodName2",
                "MethodName3"
            ]
        }
    ]
}
```

**Step 3.2: Comprehensive Validation Check**
- Tool: Cross-reference validation
- Action: Verify all original method names are included exactly once across all configurations and that no partial class exceeds 5000 lines
- Validation: All methods from original list are accounted for and line count constraints are met
- Branch A: If discrepancies found or line limits exceeded → Return to Step 2.3 for adjustment
- Branch B: If validation passes → Continue to Step 3.3

**Step 3.3: Final Configuration Review**
- Tool: Manual review
- Action: Review each configuration for logical coherence and business grouping
- Validation: Categories make business sense and maintain functionality cohesion

### Phase 4: Execution and Cleanup

**Step 4.1: Split Execution**
- Tool: `split_csharp_class`
- Action: Execute split operation with ALL configurations simultaneously
- Input: Comma-separated list of configuration files
- Validation: Verify all partial files created successfully and each respects the 5000-line limit
- Branch A: If errors occur (including line limit violations) → Report errors and halt
- Branch B: If successful → Continue to Step 4.2

**Step 4.2: Original File Cleanup**
- Tool: File system operation
- Action: Delete original source file after confirming successful split
- Validation: Partial files exist and original file removed
- Expected Output: Confirmation of successful split and cleanup

## Key Advantages of Simplified Approach

1. **Easier Configuration**: Only method names required, no complex signatures
2. **Automatic Overload Handling**: The system automatically handles method overloads
3. **Graceful Duplicate Handling**: Already processed methods are silently skipped
4. **Better Error Messages**: Clear feedback with available method names and line counts
5. **Faster Setup**: Quick configuration creation with method name lists
6. **Line Count Enforcement**: Automatic validation of 5000-line limit per partial class

## Success Criteria
- All methods from original file are preserved
- Each partial class respects the 5000-line limit (enforced automatically)
- Methods are logically grouped by business functionality, avoiding generic names
- Try to use fewer configuration files through logical grouping
- All configurations use simplified format (method names only)
- Original file is safely removed after successful split

## Error Handling
- At each step, document any issues encountered
- Provide specific error messages with available method names
- Maintain rollback capability until final validation
- Leverage simplified server's graceful error handling

**Target File**: `C:\Users\NithiDhanasekaran\source\repos\Framsikt Product Development\Framsikt\Framsikt.BL\Utility.cs`

**MCP Server Tools to Use:**
- `list_csharp_methods` - Lists method names with line counts
- `split_csharp_class` - Splits using method names only with 5000-line enforcement

Execute this sequential thinking plan step-by-step, ensuring each validation passes before proceeding to the next step.
