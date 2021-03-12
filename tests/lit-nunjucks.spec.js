const { compile } = require("../lit-nunjucks");
const babel = require("@babel/parser");
const { default: generate } = require("@babel/generator");

const toCode = (src, args = "") =>
    generate(babel.parse(`function template({${args}}) ${src}`)).code;

describe("outputs", () => {
    test("should return just value", () =>
        expect(compile(`{{ output }}`)).toEqual(
            toCode("{ return output; }", "output")
        ));
    test("should return just html", () =>
        expect(compile(`source with no vars`)).toEqual(
            toCode("{ return html`source with no vars`; }")
        ));
    test("should return a template with leading html", () => {
        expect(compile(`{{ output }} `)).toEqual(
            toCode("{ return html`${output} `; }", "output")
        );
        expect(compile(` {{ output }} `)).toEqual(
            toCode("{ return html` ${output} `; }", "output")
        );
        expect(compile(` {{ output }}`)).toEqual(
            toCode("{ return html` ${output}`; }", "output")
        );
    });

    test("should return a template with multiple variables", () => {
        expect(compile(`{{ a }} {{ b }} `)).toEqual(
            toCode("{ return html`${a} ${b} `; }", "a,b")
        );
    });
});

describe("filters", () => {
    test("should reutrn filter call", () => {
        expect(compile(`{{ a|filterThis(1) }}`)).toEqual(
            toCode("{ return _F.filterThis(a, 1); }", "_F,a")
        );
    });

    test("should reutrn filter call in template", () => {
        expect(compile(`<div>{{ a|filterThis(1) }}</div>`)).toEqual(
            toCode(
                "{ return html`<div>${_F.filterThis(a, 1)}</div>`; }",
                "_F,a"
            )
        );
    });
});

describe("if else", () => {
    test("{% if customer.authorized %} ", () => {
        console.log(compile(`{% if authorized %} 
Hello {{customer.name}}
{% endif %}`))
        
    });
    test("should compile if else", () => {
        expect(compile(`{%if question %}yes{%else%}no{% endif %}`)).toEqual(
            toCode("{ return question ? html`yes`: html`no` }", "question")
        );
    });
    test("should left side if else", () => {
        expect(compile(`{{"yes" if question else "no"}}`)).toEqual(
            toCode('{ return question ? "yes": "no" }', "question")
        );
    });
    test("should compile if", () => {
        expect(compile(`{%if question %}yes{% endif %}`)).toEqual(
            toCode("{ return question && html`yes` }", "question")
        );
    });
});

describe("forloop", () => {
    test("should repeat items", () => {
        expect(compile(`{%for item in list %}{{item}}{% endfor%}`)).toEqual(
            toCode("{ return repeat(list, (item, index) => item); }", "list")
        );
    });
    test("should name,var in items", () => {
        expect(
            compile(`{%for name, value in list %}{{name}}{% endfor%}`)
        ).toEqual(
            toCode(
                "{ return repeat(list, ({name, value}, index) => name); }",
                "list"
            )
        );
    });
    test("should repeat items and return template template", () => {
        expect(
            compile(`{%for item in list %}<div>{{item}}</div>{% endfor%}`)
        ).toEqual(
            toCode(
                "{ return repeat(list, (item, index) => html`<div>${item}</div>`); }",
                "list"
            )
        );
    });
    test("should support else", () => {
        expect(
            compile(`{%for item in list %}{{item}}{%else%}nothing{% endfor%}`)
        ).toEqual(
            toCode(
                "{return list.length ? repeat(list, (item, index) => item) : html`nothing`; }",
                "list"
            )
        );
    });
});

describe("logical expression", () => {
    test("should support operators", () => {
        expect(compile(`{{ a > 1}}`)).toEqual(toCode("{return a > 1 }", "a"));
        expect(compile(`{{ a >= 1}}`)).toEqual(toCode("{return a >= 1 }", "a"));
        expect(compile(`{{ a == 1}}`)).toEqual(toCode("{return a == 1 }", "a"));
        expect(compile(`{{ a != 1}}`)).toEqual(toCode("{return a != 1 }", "a"));
        expect(compile(`{{ a < 1}}`)).toEqual(toCode("{return a < 1 }", "a"));
        expect(compile(`{{ a <= 1}}`)).toEqual(toCode("{return a <= 1 }", "a"));
    });
    test("should unary operators", () => {
        expect(compile(`{{ not a}}`)).toEqual(toCode("{return !a }", "a"));
    });
    test("should binary operators", () => {
        expect(compile(`{{ a and 1}}`)).toEqual(
            toCode("{return a && 1 }", "a")
        );
        expect(compile(`{{ a and (b or c) and d}}`)).toEqual(
            toCode("{return a && (b || c) && d }", "a,b,c,d")
        );
    });
});
describe("binary expression", () => {
    test("should support operators", () => {
        expect(compile(`{{ a ~ 1}}`)).toEqual(toCode("{return a + 1 }", "a"));
    });
});

describe("lookup val", () => {
    test("should support operators", () => {
        expect(compile(`{{ something.about.me }}`)).toEqual(
            toCode("{return something.about.me }")
        );
        expect(compile(`{{ something[about][me] }}`)).toEqual(
            toCode("{return something[about][me] }")
        );
        expect(compile(`{{ something[a+1] }}`)).toEqual(
            toCode("{return something[a+1] }")
        );
    });
    test("should support expressions in lookup", () => {
        expect(compile(`{{ something[a+b].me }}`)).toEqual(
            toCode("{return something[a+b].me }")
        );
    });
    test("should unary operators", () => {
        expect(compile(`{{ not a}}`)).toEqual(toCode("{return !a }", "a"));
    });
    test("should binary operators", () => {
        expect(compile(`{{ a and 1}}`)).toEqual(
            toCode("{return a && 1 }", "a")
        );
        expect(compile(`{{ a and (b or c) and d}}`)).toEqual(
            toCode("{return a && (b || c) && d }", "a,b,c,d")
        );
    });
});

describe("set variable", () => {
    test("should declare top level variable a and initialize", () => {
        expect(compile(`{% set a = 1 %}`)).toEqual(
            toCode("{var a; a = 1; return }")
        );
    });
    test("set order.name = 1", () => {
        expect(compile(`{% set order.name = 1 %}`)).toEqual(
            toCode("{order.name=1;return}")
        );
    });
    test("set variable", () => {
        expect(compile(`<div>{% set a = 1 %}</div>`)).toEqual(
            toCode("{var a; return html`<div>${(()=>{a=1})()}</div>`}")
        );
    });
});

describe("include", () => {
    it("should not throw if argument is  string", () => {
        compile(`{%include 'name'%}`, { partials: { name: "foo" } });
    });
    it("should throw if argument is not string", () => {
        expect(() => compile(`{%include name%}`)).toThrow();
    });
});

describe("comments", () => {
    it("shuld compile comments", () => {
        compile(`
        text before
        {# this is a comment#}
        text after
        {# this is a another comment #}
        {value}
        `);
    });
});

describe("complex", () => {
    test("should support partials", () => {
        console.log(
            compile(`{%include 'extra-content'%}`, {
                partials: {
                    "extra-content": "This is the extra content",
                },
            })
        );
    });
});
