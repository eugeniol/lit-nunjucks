const nunjucks = require("nunjucks");
const { default: generate } = require("@babel/generator");
const t = require("@babel/types");
const { default: traverse } = require("@babel/traverse");

const n = nunjucks.nodes;

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

function compile(source, opts) {
    return new Parser(opts).compile(source);
}

function parse(source, opts) {
    return new Parser(opts).parse(source);
}

class Parser {
    constructor(opts) {
        this.opts = opts;
    }
    compile(source) {
        const ast = this.parse(source);
        return generate(ast).code;
    }
    parse(source) {
        this.parsedPartials =
            this.opts && this.opts.partials
                ? mapValues(this.opts.partials, parseNunjucks)
                : {};

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
                            path.scope.hasBinding(name) ||
                            path.scope.parentHasBinding(name)
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

        return t.functionDeclaration(
            t.identifier("template"),
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
    }

    wrapTemplate(node) {
        if (node instanceof n.NodeList) {
            if (node.children.length === 1) {
                if (node.children.length === 1)
                    return this.wrap(node.children[0]);
                return node.children.map((it) => this.wrap(it));
            }
            let prevRawData = "";
            let elements = [];
            let expressions = [];

            node.children.forEach((child) => {
                if (isTemplateData(child)) {
                    prevRawData += child.children
                        .map((it) => it.value)
                        .join("");
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
                    node.children.map((c) =>
                        t.templateElement({ raw: c.value })
                    ),
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
            return t.sequenceExpression(
                node.children.map((it) => this.wrap(it))
            );
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
            if (
                node.template instanceof n.Literal &&
                node.template.value in parsedPartials
            ) {
                return this.wrapTemplate(parsedPartials[node.template.value]);
            } else if (!(node.template.value in parsedPartials)) {
                throw new Error(
                    `Template include not found ${node.template.value}`
                );
            }
        }
        if (node instanceof n.LookupVal) {
            return t.memberExpression(
                this.wrap(node.target),
                node.val instanceof n.Literal
                    ? t.identifier(node.val.value)
                    : this.wrap(node.val),
                !(node.val instanceof n.Literal)
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
            if (typeof node.value === "string") {
                return t.stringLiteral(node.value);
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
                t.identifier("repeat"),
                [
                    array,

                    t.arrowFunctionExpression(
                        [t.identifier("t")],
                        t.callExpression(t.identifier("JSON.stringify"), [
                            t.identifier("t"),
                        ])
                    ),

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

            const isArray = t.callExpression(t.identifier("Array.isArray"), [
                array,
            ]);

            return t.conditionalExpression(
                node.else_
                    ? t.logicalExpression(
                          "&&",
                          isArray,
                          t.memberExpression(
                              this.wrap(node.arr),
                              t.identifier("length")
                          )
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
