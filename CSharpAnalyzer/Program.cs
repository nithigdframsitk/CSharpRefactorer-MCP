using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.MSBuild;
using Microsoft.Build.Locator;
using Newtonsoft.Json;
using System.CommandLine;

namespace CSharpAnalyzer;

public class Program
{
    public static async Task<int> Main(string[] args)
    {
        var rootCommand = new RootCommand("C# Code Analyzer using Roslyn");

        var listClassesCommand = new Command("list-classes", "List all classes in a file or project");
        var listMethodsCommand = new Command("list-methods", "List all methods in a class");
        var buildDependencyTreeCommand = new Command("dependency-tree", "Build dependency tree for a method");

        // Common options
        var fileOption = new Option<string>("--file", "Path to C# source file");
        var projectOption = new Option<string>("--project", "Path to .csproj file");
        var classNameOption = new Option<string>("--class", "Target class name");
        var methodNameOption = new Option<string>("--method", "Target method name");
        var maxDepthOption = new Option<int>("--max-depth", () => 3, "Maximum dependency depth");
        var outputOption = new Option<string>("--output", () => "json", "Output format (json|text)");

        // Add options to commands
        listClassesCommand.AddOption(fileOption);
        listClassesCommand.AddOption(projectOption);
        listClassesCommand.AddOption(outputOption);

        listMethodsCommand.AddOption(fileOption);
        listMethodsCommand.AddOption(projectOption);
        listMethodsCommand.AddOption(classNameOption);
        listMethodsCommand.AddOption(outputOption);

        buildDependencyTreeCommand.AddOption(fileOption);
        buildDependencyTreeCommand.AddOption(projectOption);
        buildDependencyTreeCommand.AddOption(classNameOption);
        buildDependencyTreeCommand.AddOption(methodNameOption);
        buildDependencyTreeCommand.AddOption(maxDepthOption);
        buildDependencyTreeCommand.AddOption(outputOption);

        // Set up handlers
        listClassesCommand.SetHandler(async (file, project, output) =>
        {
            var result = await ListClassesAsync(file, project);
            OutputResult(result, output ?? "json");
        }, fileOption, projectOption, outputOption);

        listMethodsCommand.SetHandler(async (file, project, className, output) =>
        {
            var result = await ListMethodsAsync(file, project, className);
            OutputResult(result, output ?? "json");
        }, fileOption, projectOption, classNameOption, outputOption);

        buildDependencyTreeCommand.SetHandler(async (file, project, className, methodName, maxDepth, output) =>
        {
            var result = await BuildDependencyTreeAsync(file, project, className, methodName, maxDepth);
            OutputResult(result, output ?? "json");
        }, fileOption, projectOption, classNameOption, methodNameOption, maxDepthOption, outputOption);

        // Add commands to root
        rootCommand.AddCommand(listClassesCommand);
        rootCommand.AddCommand(listMethodsCommand);
        rootCommand.AddCommand(buildDependencyTreeCommand);

        try
        {
            return await rootCommand.InvokeAsync(args);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Error: {ex.Message}");
            return 1;
        }
    }

    private static void OutputResult(object result, string format)
    {
        if (format?.ToLower() == "text")
        {
            Console.WriteLine(result.ToString());
        }
        else
        {
            var json = JsonConvert.SerializeObject(result, Formatting.Indented);
            Console.WriteLine(json);
        }
    }

    public static async Task<object> ListClassesAsync(string? filePath, string? projectPath)
    {
        try
        {
            if (!string.IsNullOrEmpty(projectPath))
            {
                return await ListClassesFromProjectAsync(projectPath);
            }
            else if (!string.IsNullOrEmpty(filePath))
            {
                return await ListClassesFromFileAsync(filePath);
            }
            else
            {
                return new { error = "Either --file or --project must be specified" };
            }
        }
        catch (Exception ex)
        {
            return new { error = ex.Message };
        }
    }

    public static async Task<object> ListMethodsAsync(string? filePath, string? projectPath, string? className)
    {
        try
        {
            if (!string.IsNullOrEmpty(projectPath))
            {
                return await ListMethodsFromProjectAsync(projectPath, className);
            }
            else if (!string.IsNullOrEmpty(filePath))
            {
                return await ListMethodsFromFileAsync(filePath, className);
            }
            else
            {
                return new { error = "Either --file or --project must be specified" };
            }
        }
        catch (Exception ex)
        {
            return new { error = ex.Message };
        }
    }

    private static async Task<object> ListClassesFromFileAsync(string filePath)
    {
        var content = await File.ReadAllTextAsync(filePath);
        var tree = CSharpSyntaxTree.ParseText(content);
        var root = await tree.GetRootAsync();

        var classes = root.DescendantNodes()
            .OfType<ClassDeclarationSyntax>()
            .Select(c => new
            {
                name = c.Identifier.ValueText,
                lineCount = c.GetLocation().GetLineSpan().EndLinePosition.Line - 
                           c.GetLocation().GetLineSpan().StartLinePosition.Line + 1,
                startLine = c.GetLocation().GetLineSpan().StartLinePosition.Line + 1,
                endLine = c.GetLocation().GetLineSpan().EndLinePosition.Line + 1,
                modifiers = c.Modifiers.ToString(),
                baseTypes = c.BaseList?.Types.Select(t => t.ToString()).ToArray() ?? Array.Empty<string>(),
                filePath = filePath
            })
            .ToArray();

        return new { classes = classes };
    }

    private static async Task<object> ListClassesFromProjectAsync(string projectPath)
    {
        // Register MSBuild instances
        if (!MSBuildLocator.IsRegistered)
        {
            MSBuildLocator.RegisterDefaults();
        }

        using var workspace = MSBuildWorkspace.Create();
        var project = await workspace.OpenProjectAsync(projectPath);

        var allClasses = new List<object>();

        foreach (var document in project.Documents)
        {
            if (document.FilePath?.EndsWith(".cs") == true)
            {
                var syntaxTree = await document.GetSyntaxTreeAsync();
                if (syntaxTree != null)
                {
                    var root = await syntaxTree.GetRootAsync();
                    var classes = root.DescendantNodes()
                        .OfType<ClassDeclarationSyntax>()
                        .Select(c => new
                        {
                            name = c.Identifier.ValueText,
                            lineCount = c.GetLocation().GetLineSpan().EndLinePosition.Line - 
                                       c.GetLocation().GetLineSpan().StartLinePosition.Line + 1,
                            startLine = c.GetLocation().GetLineSpan().StartLinePosition.Line + 1,
                            endLine = c.GetLocation().GetLineSpan().EndLinePosition.Line + 1,
                            modifiers = c.Modifiers.ToString(),
                            baseTypes = c.BaseList?.Types.Select(t => t.ToString()).ToArray() ?? Array.Empty<string>(),
                            filePath = document.FilePath
                        });

                    allClasses.AddRange(classes);
                }
            }
        }

        return new { classes = allClasses };
    }

    private static async Task<object> ListMethodsFromFileAsync(string filePath, string? className)
    {
        var content = await File.ReadAllTextAsync(filePath);
        var tree = CSharpSyntaxTree.ParseText(content);
        var root = await tree.GetRootAsync();

        var classDeclarations = root.DescendantNodes()
            .OfType<ClassDeclarationSyntax>();

        if (!string.IsNullOrEmpty(className))
        {
            classDeclarations = classDeclarations.Where(c => c.Identifier.ValueText == className);
        }

        var methods = classDeclarations
            .SelectMany(c => c.DescendantNodes().OfType<MethodDeclarationSyntax>()
                .Select(m => new
                {
                    className = c.Identifier.ValueText,
                    methodName = m.Identifier.ValueText,
                    returnType = m.ReturnType.ToString(),
                    parameters = m.ParameterList.Parameters.Select(p => $"{p.Type} {p.Identifier}").ToArray(),
                    modifiers = m.Modifiers.ToString(),
                    lineCount = m.GetLocation().GetLineSpan().EndLinePosition.Line - 
                               m.GetLocation().GetLineSpan().StartLinePosition.Line + 1,
                    startLine = m.GetLocation().GetLineSpan().StartLinePosition.Line + 1,
                    endLine = m.GetLocation().GetLineSpan().EndLinePosition.Line + 1
                }))
            .ToArray();

        return new { methods = methods };
    }

    private static async Task<object> ListMethodsFromProjectAsync(string projectPath, string? className)
    {
        // Register MSBuild instances
        if (!MSBuildLocator.IsRegistered)
        {
            MSBuildLocator.RegisterDefaults();
        }

        using var workspace = MSBuildWorkspace.Create();
        var project = await workspace.OpenProjectAsync(projectPath);

        var allMethods = new List<object>();

        foreach (var document in project.Documents)
        {
            if (document.FilePath?.EndsWith(".cs") == true)
            {
                var syntaxTree = await document.GetSyntaxTreeAsync();
                if (syntaxTree != null)
                {
                    var root = await syntaxTree.GetRootAsync();
                    var classDeclarations = root.DescendantNodes()
                        .OfType<ClassDeclarationSyntax>();

                    if (!string.IsNullOrEmpty(className))
                    {
                        classDeclarations = classDeclarations.Where(c => c.Identifier.ValueText == className);
                    }

                    var methods = classDeclarations
                        .SelectMany(c => c.DescendantNodes().OfType<MethodDeclarationSyntax>()
                            .Select(m => new
                            {
                                className = c.Identifier.ValueText,
                                methodName = m.Identifier.ValueText,
                                returnType = m.ReturnType.ToString(),
                                parameters = m.ParameterList.Parameters.Select(p => $"{p.Type} {p.Identifier}").ToArray(),
                                modifiers = m.Modifiers.ToString(),
                                lineCount = m.GetLocation().GetLineSpan().EndLinePosition.Line - 
                                           m.GetLocation().GetLineSpan().StartLinePosition.Line + 1,
                                startLine = m.GetLocation().GetLineSpan().StartLinePosition.Line + 1,
                                endLine = m.GetLocation().GetLineSpan().EndLinePosition.Line + 1,
                                filePath = document.FilePath
                            }));

                    allMethods.AddRange(methods);
                }
            }
        }

        return new { methods = allMethods };
    }

    public static async Task<object> BuildDependencyTreeAsync(string? filePath, string? projectPath, string? className, string? methodName, int maxDepth)
    {
        try
        {
            // For now, this is a stub that returns a placeholder structure
            // Full implementation would require semantic analysis
            return new
            {
                method = methodName,
                className = className,
                dependencies = new object[]
                {
                    new { name = "Placeholder dependency analysis", type = "stub" }
                },
                note = "Dependency tree analysis requires full semantic model implementation"
            };
        }
        catch (Exception ex)
        {
            return new { error = ex.Message };
        }
    }
}
