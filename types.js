const { default: generate } = require("@babel/generator");
const t = require("@babel/types");

console.log(
    generate(
        t.functionDeclaration(
            t.identifier("myFunction"),
            [t.identifier("arg1"), t.identifier("arg2")],
            t.blockStatement([
                t.returnStatement(
                  t.conditionalExpression(
                    t.identifier("true"),
                    t.stringLiteral("hello"),
                    t.stringLiteral("bye")
                ),
                )
            ])
        )
    ).code
);
