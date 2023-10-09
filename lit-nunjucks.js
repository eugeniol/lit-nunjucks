const nunjucks = require("nunjucks");
const { default: generate } = require("@babel/generator");
const t = require("@babel/types");
const { default: traverse } = require("@babel/traverse");
const camelCase = require("lodash.camelcase");

const n = nunjucks.nodes;

function generateDestructuringAST(variableNames) {
  const properties = variableNames.map((name) =>
    t.objectProperty(t.identifier(name), t.identifier(name), false, true)
  );
  const left = t.objectPattern(properties);
  const right = t.identifier("_state");

  const declarator = t.variableDeclarator(left, right);

  const declaration = t.variableDeclaration("let", [declarator]);

  return declaration;
}

function pushOrUpdate(arr, name, jsName) {
  const obj = arr.find((item) => item.name === name);

  if (obj) {
    obj.count += 1;
  } else {
    arr.push({ name, jsName, count: 1 });
    return 1;
  }

  return obj.count;
}

function removeFileExtension(filename) {
  return filename.replace(/\.[^\.]+$/, "");
}

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
let allImportedModules = [];

const isTemplateData = (child) =>
  child instanceof n.Output &&
  child.children.every((it) => it instanceof n.TemplateData);

function parseNunjucks(source) {
  return nunjucks.parser.parse(source);
}

function compile(source, opts) {
  return new Parser(opts).compile(source);
}

function parse(source, { partials = {}, ...otherOpts } = {}) {
  if (otherOpts.isModule) {
    return Object.entries({
      "main.liquid": source,
      ...partials,
    }).reduce((acc, [path, content]) => {
      acc[path] = new Parser({
        name: path,
        jsName: camelCase(removeFileExtension(path)),
        ...otherOpts,
        partials: partials,
      }).parse(content);
      return acc;
    }, {});
  }

  return new Parser({
    ...otherOpts,
    name: "template",
    jsName: "template",
  }).parse(source);
}

class Parser {
  constructor(opts = {}) {
    this.opts = opts;
    this.localScopeVariables = [];
  }

  compile(source) {
    const ast = this.parse(source);
    return generate(ast).code;
  }

  parse(source) {
    this.modulesToImport = [];
    return this.transform(parseNunjucks(source));
  }

  transform(node) {
    this.statements = [];
    const templateStatements = this.wrapTemplate(node);
    const block = t.blockStatement([
      ...this.statements,
      t.returnStatement(templateStatements),
    ]);

    let variblesToDeclare = [...this.localScopeVariables];
    let variblesInScope = [];

    traverse(t.file(t.program([block])), {
      CallExpression: (path) =>
        this.handleCallExpression(path, variblesInScope),
      AssignmentExpression: (path) =>
        this.handleAssignmentExpression(path, variblesToDeclare),
      Identifier: (path) => this.handleIdentifier(path, variblesInScope),
    });

    variblesInScope = variblesInScope.filter(
      (v) => !variblesToDeclare.includes(v)
    );

    if (!this.opts.isModule) {
      return t.functionDeclaration(
        t.identifier(this.opts.jsName),
        [
          t.objectPattern(
            variblesInScope.map((val) =>
              t.objectProperty(
                t.identifier(val),
                t.identifier(val),
                false,
                true
              )
            )
          ),
          t.identifier("_F"),
        ],
        t.blockStatement([
          ...(variblesToDeclare.length
            ? [
                t.variableDeclaration(
                  "let",
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
    }

    traverse(t.file(t.program([block])), {
      TaggedTemplateExpression: (path) =>
        this.handleTaggedTemplateExpression(path, variblesToDeclare),
    });

    const functionDeclaration = t.functionDeclaration(
      t.identifier(this.opts.jsName),
      [t.identifier("_state"), t.identifier("_F")],
      t.blockStatement([
        generateDestructuringAST(
          variblesInScope.filter(
            (val) =>
              val !== "_state" &&
              !this.modulesToImport.some((obj) => obj.jsName === val)
          )
        ),
        ...(variblesToDeclare.length
          ? [
              t.variableDeclaration(
                "let",
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
      ? this.modulesToImport.map(({ name, jsName }) =>
          t.importDeclaration(
            [t.importDefaultSpecifier(t.identifier(jsName))],
            t.stringLiteral(name + ".liquid")
          )
        )
      : [];

    const exportDefaultDeclaration =
      t.exportDefaultDeclaration(functionDeclaration);

    return t.program([...importDeclarations, exportDefaultDeclaration]);
  }

  wrapTemplate(node) {
    if (!(node instanceof n.NodeList)) {
      return this.wrap(node);
    }

    if (node.children.length === 1) {
      return this.wrap(node.children[0]);
    }

    const { elements, expressions } = this.processChildren(node.children);

    return this.createTaggedTemplateExpression(elements, expressions);
  }

  processChildren(children) {
    let prevRawData = "";
    let elements = [];
    let expressions = [];

    children.forEach((child) => {
      if (isTemplateData(child)) {
        prevRawData += child.children.map((it) => it.value).join("");
      } else {
        elements.push(this.createTemplateElement(prevRawData));
        prevRawData = "";
        expressions = expressions.concat(this.wrapChild(child));
      }
    });

    elements.push(this.createTemplateElement(prevRawData));

    return { elements, expressions };
  }

  createTemplateElement(rawData) {
    return t.templateElement({ raw: rawData });
  }

  wrapChild(child) {
    if (child instanceof n.Output) {
      return [this.wrap(child.children[0])];
    }
    return this.wrap(child);
  }

  createTaggedTemplateExpression(elements, expressions) {
    return t.taggedTemplateExpression(
      t.identifier("html"),
      t.templateLiteral(
        elements,
        expressions.map((it) => this.processExpression(it))
      )
    );
  }

  processExpression(expression) {
    if (expression.type === "Identifier") {
      return this.handleIdentifierExpression(expression);
    }

    if (
      expression.type === "ConditionalExpression" &&
      expression.test.type === "Identifier"
    ) {
      return this.handleConditionalExpression(expression);
    }

    return expression;
  }

  handleCallExpression(path, variblesInScope) {
    for (const arg of path.node.arguments) {
      if (arg.type === "Identifier" && !variblesInScope.includes(arg.name)) {
        variblesInScope.push(arg.name);
      }
    }
  }

  handleAssignmentExpression(path, variblesToDeclare) {
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
  }

  handleIdentifier(path, variblesInScope) {
    if (
      t.isMemberExpression(path.parent) &&
      t.isIdentifier(path.parent.object)
    ) {
      const name = path.parent.object.name;
      if (
        !(path.scope.hasBinding(name) || path.scope.parentHasBinding(name)) &&
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
  }

  handleTaggedTemplateExpression(path, variblesToDeclare) {
    path.traverse({
      CallExpression: (innerPath) => {
        if (
          innerPath.node.callee.type === "Identifier" &&
          innerPath.node.arguments.length === 0
        ) {
          const properties = [t.spreadElement(t.identifier("_state"))];
          for (const variable of variblesToDeclare) {
            properties.push(
              t.objectProperty(t.identifier(variable), t.identifier(variable))
            );
          }
          const objectArg = t.objectExpression(properties);

          innerPath.node.arguments.push(objectArg);
          innerPath.node.arguments.push(t.identifier("_F"));
        }
      },
    });
  }

  handleIdentifierExpression(identifier) {
    const nameIdentifier = t.identifier(identifier.name);
    return t.conditionalExpression(
      t.binaryExpression(
        "===",
        t.unaryExpression("typeof", nameIdentifier),
        t.stringLiteral("undefined")
      ),
      t.memberExpression(t.identifier("_state"), nameIdentifier),
      nameIdentifier
    );
  }

  handleConditionalExpression(expression) {
    const nameIdentifier = t.identifier(expression.test.name);
    const clonedNode = t.clone(expression);
    clonedNode.test = t.conditionalExpression(
      t.binaryExpression(
        "===",
        t.unaryExpression("typeof", nameIdentifier),
        t.stringLiteral("undefined")
      ),
      t.memberExpression(t.identifier("_state"), nameIdentifier),
      nameIdentifier
    );
    return clonedNode;
  }

  wrap(node) {
    if (node instanceof n.Output) {
      return this.handleOutput(node);
    }
    if (node instanceof n.Array) {
      return this.handleArray(node);
    }
    if (node instanceof n.Dict) {
      return this.handleDict(node);
    }
    if (node instanceof n.Group) {
      return this.handleGroup(node);
    }
    if (node instanceof n.NodeList) {
      return this.handleNodeList(node);
    }
    if (node instanceof n.Set) {
      return this.handleSet(node);
    }
    if (node instanceof n.Include) {
      return this.handleInclude(node);
    }
    if (node instanceof n.LookupVal) {
      return this.handleLookupVal(node);
    }
    if (node instanceof n.Symbol) {
      return this.handleSymbol(node);
    }
    if (node instanceof n.FunCall) {
      return this.handleFunCall(node);
    }
    if (node instanceof n.Literal) {
      return this.handleLiteral(node);
    }
    if (node instanceof n.Value) {
      return this.handleValue(node);
    }
    if (node instanceof n.Compare) {
      return this.handleCompare(node);
    }
    if (node instanceof n.Not) {
      return this.handleNot(node);
    }
    if (node instanceof n.BinOp) {
      return this.handleBinOp(node);
    }
    if (node instanceof n.If || node instanceof n.InlineIf) {
      return this.handleIf(node);
    }
    if (node instanceof n.For) {
      return this.handleFor(node);
    }
    throw [node.typename, node];
  }

  handleOutput(node) {
    if (
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
    return this.wrap(node.children[0]);
  }

  handleArray(node) {
    return t.arrayExpression(node.children.map((c) => this.wrap(c)));
  }

  handleDict(node) {
    return t.objectExpression(
      node.children.map((pair) =>
        t.objectProperty(t.stringLiteral(pair.key.value), this.wrap(pair.value))
      )
    );
  }

  handleGroup(node) {
    return t.sequenceExpression(node.children.map((it) => this.wrap(it)));
  }

  handleNodeList(node) {
    if (node.children.length === 1) return this.wrap(node.children[0]);
    return node.children.map((it) => this.wrap(it));
  }

  handleSet(node) {
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

  handleInclude(node) {
    const name = node.template.value;
    const jsName = camelCase(name);
    const count = pushOrUpdate(allImportedModules, name);
    const uniqueJsName = `${jsName}__${count}`;
    this.modulesToImport.push({
      name: name,
      jsName: uniqueJsName,
    });
    return t.callExpression(t.identifier(uniqueJsName), []);
  }

  handleLookupVal(node) {
    const member = t.memberExpression(
      this.wrap(node.target),
      node.val instanceof n.Literal
        ? Number.isInteger(node.val.value)
          ? t.numericLiteral(node.val.value)
          : t.identifier(node.val.value)
        : this.wrap(node.val),
      !(node.val instanceof n.Literal) || Number.isInteger(node.val.value)
    );
    return member;
  }

  handleSymbol(node) {
    return t.identifier(node.value);
  }

  handleFunCall(node) {
    if (node.name instanceof n.Symbol) {
      return t.callExpression(
        t.identifier(`_F.${node.name.value}`),
        [].concat(this.wrap(node.args, false))
      );
    }
  }

  handleLiteral(node) {
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

  handleValue(node) {
    return t.identifier(node.value);
  }

  handleCompare(node) {
    if (node.ops.length > 1) {
      throw new Error("Multiple Operand not supported");
    }
    return t.binaryExpression(
      node.ops[0].type,
      this.wrap(node.expr),
      this.wrap(node.ops[0].expr)
    );
  }

  handleNot(node) {
    return t.unaryExpression("!", this.wrap(node.target));
  }

  handleBinOp(node) {
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

  handleIf(node) {
    return t.conditionalExpression(
      this.wrap(node.cond),
      this.wrapTemplate(node.body),
      node.else_ ? this.wrapTemplate(node.else_) : t.stringLiteral("")
    );
  }

  handleFor(node) {
    if (!this.localScopeVariables.includes(node.name.value)) {
      this.localScopeVariables.push(node.name.value);
    }
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
}

module.exports = { compile, parse, Parser };
