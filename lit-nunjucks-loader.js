const { compile } = require('./');
const loaderUtils = require('loader-utils');

const path = require('path');
const fs = require('fs');

function getLoaderConfig(loaderContext) {
  const query = loaderUtils.getOptions(loaderContext) || {};
  const configKey = query.config || 'handlebarsLoader';
  const config =
    (loaderContext.rootContext ? loaderContext.rootContext[configKey] : loaderContext.options[configKey]) || {};
  delete query.config;
  return {
    ...config,
    ...query
  };
}

module.exports = function(source) {
  const { viewsPath } = getLoaderConfig(this);
  const options = {};
  const sources = fs
    .readdirSync(viewsPath)
    .filter(name => name.endsWith('.liquid'))
    .map(name => {
      const filename = path.join(viewsPath, name);
      this.addDependency(filename);
      return [name.replace(/\.liquid$/, ''), fs.readFileSync(filename, 'utf8')];
    });

  const partials = Object.fromEntries(sources);

  const src = compile(source, { partials }).toString();
  return `module.exports = function({html, unsafeHTML, repeat}){return ${src};}`;
};
