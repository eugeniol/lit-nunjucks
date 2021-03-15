const { compile } = require("./lit-nunjucks");
const loaderUtils = require("loader-utils");

const path = require("path");
const fs = require("fs");

function getLoaderConfig(loaderContext) {
    const query = loaderUtils.getOptions(loaderContext) || {};
    const configKey = query.config || "handlebarsLoader";
    const config =
        (loaderContext.rootContext
            ? loaderContext.rootContext[configKey]
            : loaderContext.options[configKey]) || {};
    delete query.config;
    return {
        ...config,
        ...query,
    };
}

const hardPreprocess = (source) => source.replace(/\{%\s+assign\b/g, "{% set");
const readFile = (filename) =>
    hardPreprocess(fs.readFileSync(filename, "utf8"));
module.exports = function (source) {
    source = hardPreprocess(source);
    const { viewsPath } = getLoaderConfig(this);
    const options = {};
    const sources = fs
        .readdirSync(viewsPath)
        .filter((name) => name.endsWith(".liquid"))
        .map((name) => {
            const filename = path.join(viewsPath, name);
            this.addDependency(filename);
            return [name.replace(/\.liquid$/, ""), readFile(filename)];
        });

    const partials = Object.fromEntries(sources);

    const src = compile(source, { partials }).toString();
    return `module.exports = function({html, unsafeHTML, repeat}){return ${src};}`;
};
