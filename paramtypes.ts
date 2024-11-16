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
        if (process.argv.includes("--js")) {
            return `import { ${importName} as ${alias} } from "${modulePath}.js"`;
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

    fs.appendFileSync(f, "\n" + getImportStatement(classReference, classDescription.alias));

    classDescription.members.forEach((member: any) => {
        if (member.abstract) return;

        let paramtypes: Array<string> = [];
        member.parameters.forEach((parameter: any) => {
            if (typeof parameter == "object") {
                if (parameter.reference) {
                    parameter.alias = alias(parameter.type.split(".").pop())
                    fs.appendFileSync(f, "\n  " + getImportStatement(parameter.reference, parameter.alias));
                    paramtypes.push(parameter.alias);
                } else {
                    paramtypes.push(`"${parameter.alias}"`);
                }
            }
        });
        let prototype = `${classDescription.alias}.prototype` + (member.name == "__constructor" ? "" : `.${member.name}`);
        fs.appendFileSync(f, `\n    Object.defineProperty(${prototype}, "reflect:paramtypes", { get() { return [ ${paramtypes.join(", ")} ]; }});`);
    });
    fs.appendFileSync(f, `\n`);
}
