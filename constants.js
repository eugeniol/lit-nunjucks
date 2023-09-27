const LOGICAL_EXPRESSIONS = {
  Or: "||",
  And: "&&",
};

const BINARY_EXPRESSIONS = {
  In: "in",
  Is: "===",
  Add: "+",
  Concat: "+",
  Sub: "-",
  Mul: "*",
  Div: "/",
  FloorDiv: "/",
  Mod: "%",
  Pow: "**",
};

const TEMPLATES_LIBRARY_VARIABLE_IDENTIFIER = "$$T";
const LIT_HTML_VARIABLE_IDENTIFIER = "html";
const FILTERS_VARIABLE_IDENTIFIER = "_F";

module.exports = {
  LOGICAL_EXPRESSIONS,
  BINARY_EXPRESSIONS,
  TEMPLATES_LIBRARY_VARIABLE_IDENTIFIER,
  LIT_HTML_VARIABLE_IDENTIFIER,
  FILTERS_VARIABLE_IDENTIFIER
};
