#!/usr/bin/env node

import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { stripComments } from "jsonc-parser";

const tsconfig = JSON.parse(stripComments(fs.readFileSync("./tsconfig.json", "utf8")));
let rootDir = tsconfig.compilerOptions.rootDir;

const packageJson = JSON.parse(stripComments(fs.readFileSync("./package.json", "utf8")));
let entryPoint = path.resolve(`./${packageJson.main}`);

/**
 * This is a helper function for logging.
 * It uses the rest parameter syntax to accept an arbitrary number of arguments and
 * could be used for debugging purposes by uncommenting the console.log(...args); line.
 * @param args
 */
function log(...args: any[]) {
    // console.log(...args);
}

/**
 * Changes the current working directory of the Node.js process to the "src" directory.
 * This affects the base directory from which the script operates, especially when reading files.
 */
process.chdir(rootDir);

/**
 * Recursively scans a directory for TypeScript files.
 */
function scan(directory: string): string[] {
    let files = fs.readdirSync(directory).map(file => path.resolve(directory + path.sep + file));

    return files.map((file) => {
        return fs.statSync(file).isDirectory() ? scan(file) : file;
    }).flat().filter((fileName) => fileName.endsWith(".ts"));
}

/**
 * Creates an array of file paths to be analyzed, starting with the main script and
 * including all TypeScript files found by the scan function.
 */
let files = [
    entryPoint,
    ...scan(".")
];

/**
 * Create a TypeScript program object using the file paths.
 * This program object is used to analyze the files.
 */
let program = ts.createProgram(files, {});

/**
 * Retrieve a TypeScript type checker using the program object.
 * This type checker object is used to analyze the type system.
 */
let typeChecker = program.getTypeChecker();

/**
 * Filters the source files to include only those that are within the current working directory,
 * ignoring external library definitions and other files outside the project's scope.
 */
let basePath = process.cwd() + path.sep;
let sourceFiles = program.getSourceFiles().filter((sourceFile: ts.SourceFile) => {
    return sourceFile.fileName.startsWith(basePath);
});

let registry: any = {};

/**
 * Iterate over each source file, extracting module names,
 * analyzing import declarations to resolve import paths,
 * and inspecting each node (e.g., class, interface)
 * to gather information such as inheritance (extends),
 * members (methods, properties), and parameters, including their types.
 */
sourceFiles.forEach((sourceFile: ts.SourceFile) => {
    /**
     * Compute relative module name based on the file path, adjusting it to remove the .ts extension.
     * This name serves as an identifier for the module within the registry.
     */
    let relativePath = "./" + path.relative(basePath, sourceFile.fileName);
    if (relativePath.endsWith(".d.ts")) return;
    let moduleName = path.dirname(relativePath) + "/" + path.basename(relativePath, ".ts");
    log(moduleName);

    let imports: any = {};

    /**
     * Iterate over all nodes (syntactic constructs) in the file.
     */
    sourceFile.forEachChild((node: ts.Node) => {
        /**
         * For nodes that are import declarations, extract the path of the import and any imported identifiers.
         * This is crucial for resolving type references and inheritance later on.
         */
        if (ts.isImportDeclaration(node)) {
            let importPath: string = "";
            node.forEachChild((node: ts.Node) => {
                if (ts.isStringLiteral(node)) {
                    importPath = node.text;

                    /**
                     * For relative imports (those starting with .),
                     * resolve the absolute path to ensure accurate linkage.
                     */
                    if (importPath.charAt(0) == ".") {
                        importPath = path.resolve(path.dirname(sourceFile.fileName), importPath);
                    }
                }
            });
            node.forEachChild((node: ts.Node) => {
                /**
                 * Capture both default imports and named imports,
                 * and store this information in the imports object
                 * with the structure indicating the source of each import.
                 */
                if (ts.isImportClause(node)) {
                    node.forEachChild((node: ts.Node) => {
                        /**
                         * Handle default imports.
                         */
                        if (ts.isIdentifier(node)) {
                            imports[node.escapedText as string] = {
                                from: importPath
                            }
                        }
                        /**
                         * Handle named imports.
                         */
                        if (ts.isNamedImports(node)) {
                            node.elements.forEach((importSpecifier: ts.ImportSpecifier) => {
                                if (importSpecifier.propertyName) {
                                    imports[importSpecifier.name.escapedText as string] = {
                                        // @ts-ignore
                                        name: importSpecifier.propertyName.escapedText,
                                        from: importPath
                                    }
                                }
                                else {
                                    imports[importSpecifier.name.escapedText as string] = {
                                        name: importSpecifier.name.escapedText,
                                        from: importPath
                                    }
                                }
                            });
                        }
                    });
                }
            });
        }
    });

    /**
     * Analyze exported symbols and extract class and interface definitions.
     */
    let moduleSymbol = typeChecker.getSymbolAtLocation(sourceFile);
    moduleSymbol?.exports?.forEach((exportedSymbol, name) => {
        let fullyQualifiedExportName: string;
        let reflectionData: any;

        let exportedDeclaration = exportedSymbol.declarations?.pop();
        if (exportedDeclaration?.kind == ts.SyntaxKind.ClassDeclaration) {
            log(" ", exportedSymbol.escapedName, "(class)");

            reflectionData = {
                type: "class",
                name: exportedSymbol.escapedName,
                members: []
            }

            /**
             * Check if the class extends another class.
             */
            // @ts-ignore
            if (exportedDeclaration?.heritageClauses) {
                // @ts-ignore
                log("   ", "extends", exportedDeclaration?.heritageClauses[0].types[0].expression.escapedText);

                // @ts-ignore
                let parentName = exportedDeclaration?.heritageClauses[0].types[0].expression.escapedText;

                let typeReferenceModulePath = imports[parentName.split(".")[0]]?.from;
                let typeReferenceModule;
                if (typeReferenceModulePath) {
                    if (typeReferenceModulePath.charAt(0) == "/") {
                        let relativePath = "./" + path.relative(basePath, typeReferenceModulePath);
                        typeReferenceModule = relativePath + ":" + imports[parentName.split(".")[0]]?.name;
                    } else {
                        typeReferenceModule = typeReferenceModulePath + ":" + imports[parentName.split(".")[0]]?.name;
                    }
                } else {
                    // console.log(parentName);
                }

                reflectionData.extends = {
                    type: parentName.split(".").pop(),
                    reference: typeReferenceModule
                };
            }

            /**
             * Analyze constructor and methods and extract parameter types, return types and modifiers.
             */
            exportedSymbol.members?.forEach((memberSymbol) => {
                let memberDeclaration = memberSymbol.declarations?.pop();
                if (memberDeclaration?.kind == ts.SyntaxKind.Constructor ||
                    memberDeclaration?.kind == ts.SyntaxKind.MethodDeclaration) {
                    log("   ", memberSymbol.escapedName);

                    let member: any = {
                        name: memberSymbol.escapedName,
                        // @ts-ignore
                        abstract: memberDeclaration.modifiers?.some((keyword) => { return keyword.kind == ts.SyntaxKind.AbstractKeyword }),
                        parameters: []
                    }

                    // @ts-ignore
                    memberDeclaration?.parameters.forEach((param) => {
                        if (param.type) {
                            let parameter;
                            switch (param.type.kind) {
                                /**
                                 * Parameter is a type reference. This can be a class, interface or type alias.
                                 */
                                case ts.SyntaxKind.TypeReference:
                                    let typeName = param.type.typeName?.escapedText ? param.type.typeName.escapedText : `${param.type.typeName.left.escapedText}.${param.type.typeName.right.escapedText}`;
                                    log("     ", typeName, imports[typeName.split(".")[0]]?.from);

                                    let typeReferenceModulePath = imports[typeName.split(".")[0]]?.from;
                                    let typeReferenceModule;
                                    if (typeReferenceModulePath) {
                                        if (typeReferenceModulePath.charAt(0) == "/") {
                                            let relativePath = "./" + path.relative(basePath, typeReferenceModulePath);
                                            typeReferenceModule = relativePath + ":" + typeName.split(".").pop();
                                        } else {
                                            typeReferenceModule = typeReferenceModulePath + ":" + typeName.split(".").pop();
                                        }
                                    } else {
                                        // console.log(typeName);
                                    }

                                    parameter = {
                                        type: typeName,
                                        reference: typeReferenceModule
                                    };
                                    break;

                                case ts.SyntaxKind.AnyKeyword:
                                    log("     ", "any");

                                    parameter = {
                                        type: "any"
                                    };
                                    break;

                                case ts.SyntaxKind.NumberKeyword:
                                    log("     ", "number");

                                    parameter = {
                                        type: "number"
                                    };
                                    break;

                                case ts.SyntaxKind.ObjectKeyword:
                                    log("     ", "object");

                                    parameter = {
                                        type: "object"
                                    };
                                    break;

                                case ts.SyntaxKind.StringKeyword:
                                    log("     ", "string");

                                    parameter = {
                                        type: "string"
                                    };
                                    break;

                                case ts.SyntaxKind.ArrayType:
                                    log("     ", "array");

                                    // TODO: Handle array types (e.g. Array<string>).

                                    parameter = {
                                        type: "array"
                                    };
                                    break;

                                case ts.SyntaxKind.TypeLiteral:
                                    log("     ", "literal");

                                    parameter = {
                                        type: "literal"
                                    };
                                    break;

                                default:
                                    log("     ", param.type.kind);

                                    parameter = {
                                        type: "unknown"
                                    };
                            }

                            member.parameters.push(parameter);
                        } else {
                            log("      unknown");

                            member.parameters.push({});
                        }
                    });

                    reflectionData.members.push(member);
                }
            });
        }

        if (exportedDeclaration?.kind == ts.SyntaxKind.InterfaceDeclaration) {
            log(" ", exportedSymbol.escapedName, "(interface)");

            reflectionData = {
                type: "interface",
                name: exportedSymbol.escapedName
            }
        }

        if (reflectionData) {
            fullyQualifiedExportName = moduleName + ":" + reflectionData.name
            registry[fullyQualifiedExportName] = reflectionData;
        }
    });
});

// console.log(registry);
function getConstructorRecursive(reference: string): any {
    if (registry[reference]) {
        let constructor = registry[reference].members?.find((member: any) => {
            return member.name == "__constructor";
        });

        if (constructor) {
            return constructor;
        } else {
            if (registry[reference].extends) {
                return registry[reference].extends.reference;
            }
        }
    }
}
Object.values(registry).forEach((reflectedClass: any) => {
    if (reflectedClass.type == "class" && reflectedClass.extends && !reflectedClass.members.some((member: any) => { return member.name == "__constructor" })) {
        // console.log(reflectedClass.name);
        let inheritedConstructor = getConstructorRecursive(reflectedClass.extends.reference);
        if (inheritedConstructor) {
            reflectedClass.members.push(inheritedConstructor);
        }
    }
})

console.log(JSON.stringify(registry, null, 2));
// fs.writeFileSync("../cache/reflection.json", JSON.stringify(registry, null, 2), {  });