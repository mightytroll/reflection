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

for (const [classReference, classDescription] of Object.entries<any>(reflectionData)) {
    if (classDescription.type != "class") continue;
    classDescription.alias = alias(classDescription.name)

    if (!classDescription.extends || classDescription.extends.reference != "@hexaform/kernel:Controller") continue;

    fs.appendFileSync(f, "\n" + getImportStatement(classReference, classDescription.alias));
}
