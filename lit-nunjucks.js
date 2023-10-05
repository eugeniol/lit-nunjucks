const nunjucks = require("nunjucks");
const { default: generate } = require("@babel/generator");
const t = require("@babel/types");
const { default: traverse } = require("@babel/traverse");
const camelCase = require("lodash.camelcase");
const bundleStrings = require("./bundler");

const n = nunjucks.nodes;

function convertKeysToCamelCase(obj = {}) {
  return Object.entries(obj).reduce((acc, [key, value]) => {
    acc[camelCase(key)] = value;
    return acc;
  }, {});
}

const mapValues = (obj, fn) =>
  Object.entries(obj).reduce((a, [key, val]) => {
    a[key] = fn(val);
    return a;
  }, {});

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

const isTemplateData = (child) =>
  child instanceof n.Output &&
  child.children.every((it) => it instanceof n.TemplateData);

function parseNunjucks(source) {
  try {
    return nunjucks.parser.parse(source);
  } catch (err) {
    throw err;
  }
}

function combineAsts(main, opts) {
  const { partials } = opts;
  const partialsWithCamelCaseKeys = convertKeysToCamelCase(partials);

  const modules = Object.entries({
    main: main,
    ...partialsWithCamelCaseKeys,
  }).map(([name, source]) => ({
    name: name,
    code: new Parser(name, opts).parse(source),
  }));

  return modules;
}

function compile(main, opts) {
  return combineAsts(main, opts);
}

function parse(main, opts) {
  return combineAsts(main, opts);
}

class Parser {
  constructor(name, opts) {
    (this.name = name), (this.opts = opts);
  }
  compile(source) {
    const ast = this.parse(source);
    return generate(ast).code;
  }
  parse(source) {
    this.parsedPartials =
      this.opts && this.opts.partials
        ? mapValues(convertKeysToCamelCase(this.opts.partials), parseNunjucks)
        : {};

    this.modulesToImport = [];

    const root = parseNunjucks(source);
    try {
      return this.transform(root);
    } catch (err) {
      throw err;
    }
  }

  transform(node) {
    this.statements = [];

    const templateStatements = this.wrapTemplate(node);

    const block = t.blockStatement([
      ...this.statements,
      t.returnStatement(templateStatements),
    ]);

    let variblesToDeclare = [];
    let variblesInScope = [];

    traverse(t.file(t.program([block])), {
      AssignmentExpression(path) {
        if (path.find((path) => path.isMemberExpression())) {
          return;
        }
        if (!t.isIdentifier(path.node.left)) {
          return;
        }
        const firstPart = path.node.left.name.split(".")[0];
        if (
          !(
            path.scope.hasBinding(firstPart) ||
            path.scope.parentHasBinding(firstPart)
          ) &&
          !variblesToDeclare.includes(firstPart)
        ) {
          variblesToDeclare.push(firstPart);
        }
      },
      Identifier(path) {
        // skip if is not a top level identifier
        if (
          t.isMemberExpression(path.parent) &&
          t.isIdentifier(path.parent.object)
        ) {
          const name = path.parent.object.name;
          if (
            !(
              path.scope.hasBinding(name) || path.scope.parentHasBinding(name)
            ) &&
            !variblesInScope.includes(name)
          )
            variblesInScope.push(name);
          return;
        }
        if (path.find((path) => path.isMemberExpression())) {
          return;
        }
        const firstPart = path.node.name.split(".")[0];
        if (
          !(
            path.scope.hasBinding(firstPart) ||
            path.scope.parentHasBinding(firstPart)
          ) &&
          !variblesInScope.includes(firstPart) &&
          !["html", "repeat", "_F"].includes(firstPart)
        ) {
          variblesInScope.push(firstPart);
        }
      },
    });
    variblesInScope = variblesInScope.filter(
      (v) => !variblesToDeclare.includes(v)
    );

    traverse(t.file(t.program([block])), {
      TaggedTemplateExpression(path) {
        path.traverse({
          CallExpression(innerPath) {
            if (
              innerPath.node.callee.type === "Identifier" &&
              innerPath.node.arguments.length === 0
            ) {
              const properties = [t.spreadElement(t.identifier("_state"))];
              for (const variable of variblesToDeclare) {
                properties.push(
                  t.objectProperty(
                    t.identifier(variable),
                    t.identifier(variable)
                  )
                );
              }
              const objectArg = t.objectExpression(properties);

              innerPath.node.arguments.push(objectArg);
              innerPath.node.arguments.push(t.identifier("_F"));
            }
          },
        });
      },
    });

    const functionDeclaration = t.functionDeclaration(
      t.identifier(this.name),
      [t.identifier("_state"), t.identifier("_F")],
      t.blockStatement([
        ...(variblesToDeclare.length
          ? [
              t.variableDeclaration(
                "var",
                variblesToDeclare.map((target) =>
                  t.variableDeclarator(t.identifier(target))
                )
              ),
            ]
          : []),
        ...this.statements,
        t.returnStatement(templateStatements),
      ])
    );

    const importDeclarations = this.modulesToImport.length
      ? this.modulesToImport.map((moduleName) =>
          t.importDeclaration(
            [t.importDefaultSpecifier(t.identifier(moduleName))],
            t.stringLiteral(moduleName)
          )
        )
      : [];

    const exportDefaultDeclaration =
      t.exportDefaultDeclaration(functionDeclaration);

    return t.program([...importDeclarations, exportDefaultDeclaration]);
  }

  wrapTemplate(node) {
    if (node instanceof n.NodeList) {
      if (node.children.length === 1) {
        if (node.children.length === 1) return this.wrap(node.children[0]);
        return node.children.map((it) => this.wrap(it));
      }
      let prevRawData = "";
      let elements = [];
      let expressions = [];

      node.children.forEach((child) => {
        if (isTemplateData(child)) {
          prevRawData += child.children.map((it) => it.value).join("");
        } else {
          elements.push(t.templateElement({ raw: prevRawData }));
          prevRawData = "";
          if (child instanceof n.Output) {
            const r = this.wrap(child.children[0]);
            expressions = [...expressions, r];
          } else {
            expressions = expressions.concat(this.wrap(child));
          }
        }
      });

      elements.push(t.templateElement({ raw: prevRawData }));

      return t.taggedTemplateExpression(
        t.identifier("html"),
        t.templateLiteral(
          elements,
          expressions.filter((it) => it)
        )
      );
    }
    return this.wrap(node);
  }
  wrap(node) {
    const { parsedPartials } = this;

    if (
      node instanceof n.Output &&
      node.children.length === 1 &&
      node.children[0] instanceof n.TemplateData
    ) {
      return t.taggedTemplateExpression(
        t.identifier("html"),
        t.templateLiteral(
          node.children.map((c) => t.templateElement({ raw: c.value })),
          []
        )
      );
    }
    if (node instanceof n.Output) {
      return this.wrap(node.children[0]);
    }
    if (node instanceof n.Array) {
      return t.arrayExpression(node.children.map((c) => this.wrap(c)));
    }
    if (node instanceof n.Dict) {
      return t.objectExpression(
        node.children.map((pair) =>
          t.objectProperty(
            t.stringLiteral(pair.key.value),
            this.wrap(pair.value)
          )
        )
      );
    }

    if (node instanceof n.Group) {
      return t.sequenceExpression(node.children.map((it) => this.wrap(it)));
    }

    if (node instanceof n.NodeList) {
      // TODO get rid of this
      if (node.children.length === 1) return this.wrap(node.children[0]);
      return node.children.map((it) => this.wrap(it));
    }

    if (node instanceof n.Set) {
      return t.callExpression(
        t.arrowFunctionExpression(
          [],
          t.blockStatement(
            node.targets.map((target) =>
              t.expressionStatement(
                t.assignmentExpression(
                  "=",
                  this.wrap(target),
                  this.wrap(node.value)
                )
              )
            )
          )
        ),
        []
      );
    }
    if (node instanceof n.Include) {
      const camelCaseValue = camelCase(node.template.value);
      if (
        node.template instanceof n.Literal &&
        camelCaseValue in parsedPartials
      ) {
        this.modulesToImport.push(camelCaseValue);
        return t.callExpression(t.identifier(camelCaseValue), []);
      } else if (
        !(node.template.value in parsedPartials) &&
        node.ignoreMissing
      ) {
        return t.nullLiteral();
        return this.wrapTemplate(parsedPartials[node.template.value]);
      } else if (!(node.template.value in parsedPartials)) {
        throw new Error(`Template include not found ${node.template.value}`);
      }
    }
    if (node instanceof n.LookupVal) {
      return t.memberExpression(
        t.memberExpression(t.identifier("_state"), this.wrap(node.target)),
        node.val instanceof n.Literal
          ? Number.isInteger(node.val.value)
            ? t.numericLiteral(node.val.value)
            : t.identifier(node.val.value)
          : this.wrap(node.val),
        !(node.val instanceof n.Literal) || Number.isInteger(node.val.value)
      );
    }
    if (node instanceof n.Symbol) {
      return t.identifier(node.value);
    }
    if (node instanceof n.FunCall) {
      if (node.name instanceof n.Symbol) {
        return t.callExpression(
          t.identifier(`_F.${node.name.value}`),
          // this.wrap(),
          [].concat(this.wrap(node.args, false))
        );
      }
    }
    if (node instanceof n.Literal) {
      if (node.value === null) {
        return t.nullLiteral();
      }
      if (typeof node.value === "string") {
        return t.stringLiteral(node.value);
      }
      if (typeof node.value === "boolean") {
        return t.booleanLiteral(node.value);
      }
      if (typeof node.value === "number") {
        return t.numericLiteral(node.value);
      }
    }
    if (node instanceof n.Value) {
      return t.identifier(node.value);
    }
    if (node instanceof n.Compare) {
      if (node.ops.length > 1) {
        throw new Error("Multiple Operand not supported");
      }
      return t.binaryExpression(
        node.ops[0].type,
        this.wrap(node.expr),
        this.wrap(node.ops[0].expr)
      );
    }

    if (node instanceof n.Not) {
      return t.unaryExpression("!", this.wrap(node.target));
    }
    if (node instanceof n.BinOp) {
      if (LOGICAL_EXPRESSIONS[node.typename]) {
        return t.logicalExpression(
          LOGICAL_EXPRESSIONS[node.typename],
          this.wrap(node.left),
          this.wrap(node.right)
        );
      }
      if (BINARY_EXPRESSIONS[node.typename]) {
        return t.binaryExpression(
          BINARY_EXPRESSIONS[node.typename],
          this.wrap(node.left),
          this.wrap(node.right)
        );
      }
    }

    if (node instanceof n.If || node instanceof n.InlineIf) {
      return t.conditionalExpression(
        this.wrap(node.cond),
        this.wrapTemplate(node.body),
        node.else_ ? this.wrapTemplate(node.else_) : t.stringLiteral("")
      );
    }

    if (node instanceof n.For) {
      const array = this.wrap(node.arr);
      const repeatCallExpression = t.callExpression(
        t.memberExpression(array, t.identifier("map")),
        [
          t.arrowFunctionExpression(
            [
              node.name instanceof n.Array
                ? t.objectPattern(
                    node.name.children.map((it) =>
                      t.objectProperty(
                        t.identifier(it.value),
                        t.identifier(it.value),
                        false,
                        true
                      )
                    )
                  )
                : this.wrap(node.name),
              t.identifier("index"),
            ],
            this.wrapTemplate(node.body)
          ),
        ]
      );

      const isArray = t.callExpression(t.identifier("Array.isArray"), [array]);

      return t.conditionalExpression(
        node.else_
          ? t.logicalExpression(
              "&&",
              isArray,
              t.memberExpression(this.wrap(node.arr), t.identifier("length"))
            )
          : isArray,

        repeatCallExpression,
        node.else_ ? this.wrapTemplate(node.else_) : t.stringLiteral("")
      );
    }

    throw [node.typename, node];
  }
}

module.exports = { compile, parse, Parser };
