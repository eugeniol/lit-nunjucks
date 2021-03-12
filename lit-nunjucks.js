const nunjucks = require("nunjucks");
const { default: generate } = require("@babel/generator");
const t = require("@babel/types");
const { default: traverse } = require("@babel/traverse");

const n = nunjucks.nodes;
const snakeCase = require("lodash/snakeCase");
const { map, mapValues } = require("lodash");

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

function parse(source) {
    try {
        return nunjucks.parser.parse(source);
    } catch (err) {
        console.error(err);
        throw err;
    }
}

function compile(source, opts) {
    return new Parser(opts).compile(source);
}

class Parser {
    constructor(opts) {
        this.opts = opts;
    }
    compile(source) {
        this.parsedPartials =
            this.opts && this.opts.partials
                ? mapValues(this.opts.partials, parse)
                : {};

        const root = parse(source);
        return generate(this.transform(root)).code;
    }

    transform(node) {
        this.stack = [];

        this.statements = [];
        this.inTemplate = false;

        const templateStatements = this.wrap(node);

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
                    !["html", "repeat"].includes(firstPart)
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
    enter(tag, ...args) {
        this.stack.unshift([tag, ...args]);
    }
    exit() {
        this.stack.pop();
    }
    wrap(node) {
        const { statements, inTemplate, parsedPartials } = this;

        if (node instanceof n.NodeList) {
            if (
                node.children.some(
                    (it) =>
                        it instanceof n.Output &&
                        it.children[0] instanceof n.TemplateData
                )
            ) {
                let prevRawData = "";
                let elements = [],
                    expressions = [];

                // if (
                //     !(node.children.length % 2) &&
                //     !isTemplateData(node.children[0])
                // ) {
                //     // if children are even we should add one more element
                //     // to top or bottom
                //     elements.push(
                //         t.templateElement({
                //             raw: "",
                //         })
                //     );
                // }

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
                            this.inTemplate = true;
                            expressions = expressions.concat(this.wrap(child));
                            this.inTemplate = false;
                        }
                    }
                });

                elements.push(t.templateElement({ raw: prevRawData }));

                // if (
                //     !(node.children.length % 2) &&
                //     isTemplateData(node.children[0])
                // ) {
                //     // if children are even we should add one more element
                //     // to top or bottom
                //     elements.push(
                //         t.templateElement({
                //             raw: "",
                //         })
                //     );
                // }
                try {
                    return t.taggedTemplateExpression(
                        t.identifier("html"),

                        t.templateLiteral(elements, expressions)
                    );
                } catch (err) {
                    console.log(elements, expressions);
                    throw err;
                }
            }
            if (node.children.length === 1) {
                return this.wrap(node.children[0]);
            }

            return node.children.map((it) => this.wrap(it));
        }
        if (node instanceof n.Set) {
            if (inTemplate) {
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
            } else {
                node.targets.map((target) => {
                    statements.push(
                        t.expressionStatement(
                            t.assignmentExpression(
                                "=",
                                this.wrap(target),
                                this.wrap(node.value)
                            )
                        )
                    );
                });
                return;
                // statements.push(
                //     t.variableDeclaration(
                //         "var",
                //         node.targets.map((target) =>
                //             t.variableDeclarator(
                //                 t.identifier(target.value),
                //                 this.wrap(node.value)
                //             )
                //         )
                //     )
                // );
            }
        }
        if (node instanceof n.Include) {
            if (
                node.template instanceof n.Literal &&
                node.template.value in parsedPartials
            ) {
                this.enter("include", node.template.value);
                const r = this.wrap(parsedPartials[node.template.value]);
                this.exit();

                return r;
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
                    [].concat(this.wrap(node.args))
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
            if (node.else_) {
                return t.conditionalExpression(
                    this.wrap(node.cond),
                    this.wrap(node.body),
                    this.wrap(node.else_)
                );
            } else {
                try {
                    return t.logicalExpression(
                        "&&",
                        this.wrap(node.cond),
                        this.wrap(node.body)
                    );
                } catch (err) {
                    console.log(this.stack, this.inTemplate);
                    console.log(node.body);
                    throw err;
                }
            }
        }

        if (node instanceof n.For) {
            const repeatCallExpression = t.callExpression(
                t.identifier("repeat"),
                [
                    this.wrap(node.arr),
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
                        this.wrap(node.body)
                    ),
                ]
            );
            return node.else_
                ? t.conditionalExpression(
                      t.memberExpression(
                          this.wrap(node.arr),
                          t.identifier("length")
                      ),
                      repeatCallExpression,
                      this.wrap(node.else_)
                  )
                : repeatCallExpression;
        }

        throw [node.typename, node];
    }
}

module.exports = { compile };
