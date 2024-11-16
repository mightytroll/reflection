#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const jsonc_parser_1 = require("jsonc-parser");
let reflectionDataFile = node_path_1.default.resolve(process.argv[2]);
let outputFile = node_path_1.default.resolve(process.argv[3]);
const tsconfig = JSON.parse((0, jsonc_parser_1.stripComments)(node_fs_1.default.readFileSync("./tsconfig.json", "utf8")));
let rootDir = tsconfig.compilerOptions.rootDir;
const reflectionData = require(reflectionDataFile);
let f = node_fs_1.default.openSync(outputFile, "w");
node_fs_1.default.appendFileSync(f, `// @ts-nocheck\n`);
function getImportStatement(reference, alias) {
    let [moduleName, importName] = reference.split(":");
    if (moduleName.charAt(0) == ".") {
        let modulePath = node_path_1.default.relative(node_path_1.default.dirname(outputFile), node_path_1.default.resolve(`./${rootDir}/` + moduleName));
        if (modulePath.charAt(0) != ".") {
            modulePath = "./" + modulePath;
        }
        if (process.argv.includes("--js")) {
            return `import { ${importName} as ${alias} } from "${modulePath}.js"`;
        }
        return `import { ${importName} as ${alias} } from "${modulePath}";`;
    }
    else {
        return `import { ${importName} as ${alias} } from "${moduleName}";`;
    }
}
let aliasCounter = {};
function alias(className) {
    if (!aliasCounter[className]) {
        aliasCounter[className] = 0;
    }
    aliasCounter[className]++;
    return `${className}_${aliasCounter[className]}`;
}
for (const [classReference, classDescription] of Object.entries(reflectionData)) {
    if (classDescription.type != "class")
        continue;
    classDescription.alias = alias(classDescription.name);
    node_fs_1.default.appendFileSync(f, "\n" + getImportStatement(classReference, classDescription.alias));
    classDescription.members.forEach((member) => {
        if (member.abstract)
            return;
        let paramtypes = [];
        member.parameters.forEach((parameter) => {
            if (typeof parameter == "object") {
                if (parameter.reference) {
                    parameter.alias = alias(parameter.type.split(".").pop());
                    node_fs_1.default.appendFileSync(f, "\n  " + getImportStatement(parameter.reference, parameter.alias));
                    paramtypes.push(parameter.alias);
                }
                else {
                    paramtypes.push(`"${parameter.alias}"`);
                }
            }
        });
        let prototype = `${classDescription.alias}.prototype` + (member.name == "__constructor" ? "" : `.${member.name}`);
        node_fs_1.default.appendFileSync(f, `\n    Object.defineProperty(${prototype}, "reflect:paramtypes", { get() { return [ ${paramtypes.join(", ")} ]; }});`);
    });
    node_fs_1.default.appendFileSync(f, `\n`);
}
//# sourceMappingURL=paramtypes.js.map