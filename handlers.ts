#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { stripComments } from "jsonc-parser";

let reflectionDataFile = path.resolve(process.argv[2]);
let outputFile = path.resolve(process.argv[3]);

const tsconfig = JSON.parse(stripComments(fs.readFileSync("./tsconfig.json", "utf8")));
let rootDir = tsconfig.compilerOptions.rootDir;

const reflectionData = require(reflectionDataFile);

let f = fs.openSync(outputFile, "w");
fs.appendFileSync(f, `// @ts-nocheck\n`);

function getImportStatement(reference: string, alias: string) {
    let [moduleName, importName] = reference.split(":");

    if (moduleName.charAt(0) == ".") {
        let modulePath = path.relative(path.dirname(outputFile), path.resolve(`./${rootDir}/` + moduleName));
        if (modulePath.charAt(0) != ".") {
            modulePath = "./" + modulePath;
        }
        return `import { ${importName} as ${alias} } from "${modulePath}";`;
    } else {
        return `import { ${importName} as ${alias} } from "${moduleName}";`;
    }
}

let aliasCounter: any = {}

function alias(className: string) {
    if (!aliasCounter[className]) {
        aliasCounter[className] = 0;
    }
    aliasCounter[className]++;

    return `${className}_${aliasCounter[className]}`;
}

let commandHandlers = [];
let queryHandlers = [];
let domainEventHandlers = [];
for (const [classReference, classDescription] of Object.entries<any>(reflectionData)) {
    if (classDescription.type != "class") continue;
    classDescription.alias = alias(classDescription.name)

    if (!classDescription.extends) continue;

    switch (classDescription.extends.reference) {
        case "@hexaform/cqrs:CommandHandler":
            fs.appendFileSync(f, "\n" + getImportStatement(classReference, classDescription.alias));
            commandHandlers.push(classDescription.alias);

            break;

        case "@hexaform/cqrs:QueryHandler":
            fs.appendFileSync(f, "\n" + getImportStatement(classReference, classDescription.alias));
            queryHandlers.push(classDescription.alias);
            break;

        case "@hexaform/ddd:DomainEventHandler":
            fs.appendFileSync(f, "\n" + getImportStatement(classReference, classDescription.alias));
            domainEventHandlers.push(classDescription.alias);
            break;

        default:
            continue;
    }
}

fs.appendFileSync(f, "\n\nexport const commandHandlers = [\n  ");
fs.appendFileSync(f, commandHandlers.join(",\n  "));
fs.appendFileSync(f, "\n];");

fs.appendFileSync(f, "\n\nexport const queryHandlers = [\n  ");
fs.appendFileSync(f, queryHandlers.join(",\n  "));
fs.appendFileSync(f, "\n];");

fs.appendFileSync(f, "\n\nexport const domainEventHandlers = [\n  ");
fs.appendFileSync(f, domainEventHandlers.join(",\n  "));
fs.appendFileSync(f, "\n];");