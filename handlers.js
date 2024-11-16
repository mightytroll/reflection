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
let commandHandlers = [];
let queryHandlers = [];
let domainEventHandlers = [];
for (const [classReference, classDescription] of Object.entries(reflectionData)) {
    if (classDescription.type != "class")
        continue;
    classDescription.alias = alias(classDescription.name);
    if (!classDescription.extends)
        continue;
    switch (classDescription.extends.reference) {
        case "@hexaform/cqrs:CommandHandler":
            node_fs_1.default.appendFileSync(f, "\n" + getImportStatement(classReference, classDescription.alias));
            commandHandlers.push(classDescription.alias);
            break;
        case "@hexaform/cqrs:QueryHandler":
            node_fs_1.default.appendFileSync(f, "\n" + getImportStatement(classReference, classDescription.alias));
            queryHandlers.push(classDescription.alias);
            break;
        case "@hexaform/ddd:DomainEventHandler":
            node_fs_1.default.appendFileSync(f, "\n" + getImportStatement(classReference, classDescription.alias));
            domainEventHandlers.push(classDescription.alias);
            break;
        default:
            continue;
    }
}
node_fs_1.default.appendFileSync(f, "\n\nexport const commandHandlers = [\n  ");
node_fs_1.default.appendFileSync(f, commandHandlers.join(",\n  "));
node_fs_1.default.appendFileSync(f, "\n];");
node_fs_1.default.appendFileSync(f, "\n\nexport const queryHandlers = [\n  ");
node_fs_1.default.appendFileSync(f, queryHandlers.join(",\n  "));
node_fs_1.default.appendFileSync(f, "\n];");
node_fs_1.default.appendFileSync(f, "\n\nexport const domainEventHandlers = [\n  ");
node_fs_1.default.appendFileSync(f, domainEventHandlers.join(",\n  "));
node_fs_1.default.appendFileSync(f, "\n];");
//# sourceMappingURL=handlers.js.map