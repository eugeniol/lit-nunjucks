const fs = require("fs");
const { compile, Parser } = require("../lit-nunjucks");
const babel = require("@babel/parser");
const { default: generate } = require("@babel/generator");

const toCode = (src, args = "") =>
  generate(babel.parse(`function template({${args}}, _F) ${src}`)).code;

describe("outputs", () => {
  test("should return just value", () =>
    expect(compile(`{{ output }}`)).toEqual(
      toCode("{ return output; }", "output")
    ));
  test("should return just html", () =>
    expect(compile(`<p>source with no vars</p>`)).toEqual(
      toCode("{ return html`<p>source with no vars</p>`; }")
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
      toCode("{ return _F.filterThis(a, 1); }", "a")
    );
  });

  test("should reutrn filter call in template", () => {
    expect(compile(`<div>{{ a|filterThis(1) }}</div>`)).toEqual(
      toCode("{ return html`<div>${_F.filterThis(a, 1)}</div>`; }", "a")
    );
  });
});

describe("if else", () => {
  test("{% if customer.authorized %} ", () => {
    compile(`{{ form_billing_expiration_date }}{{ payment.cc_exp_date }}`);
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
      toCode('{ return question ? html`yes` : "" }', "question")
    );
  });
});

describe("forloop", () => {
  test("should repeat items", () => {
    expect(compile(`{%for item in list %}{{item}}{% endfor%}`)).toEqual(
      toCode(
        '{ return Array.isArray(list) ? list.map((item, index) => item) : "" }',
        "list"
      )
    );
  });
  test("should name,var in items", () => {
    expect(compile(`{%for name, value in list %}{{name}}{% endfor%}`)).toEqual(
      toCode(
        '{ return Array.isArray(list) ? list.map(({name, value}, index) => name) : ""; }',
        "list"
      )
    );
  });
  test("should repeat items and return template template", () => {
    expect(
      compile(`{%for item in list %}<div>{{item}}</div>{% endfor%}`)
    ).toEqual(
      toCode(
        '{ return Array.isArray(list) ? list.map((item, index) => html`<div>${item}</div>`) : ""; }',
        "list"
      )
    );
  });
  test("should support else", () => {
    expect(
      compile(`{%for item in list %}{{item}}{%else%}nothing{% endfor%}`)
    ).toEqual(
      toCode(
        "{return Array.isArray(list) && list.length ? list.map((item, index) => item) : html`nothing`; }",
        "list"
      )
    );
  });
  it("should support filters in loop", () => {
    expect(
      compile(`{% for i in "foobar" | list %}{{ i }},{% endfor %}`)
    ).toEqual(
      toCode(
        '{return Array.isArray(_F.list("foobar")) ? _F.list("foobar").map((i, index) => html`${i},`):"";}'
      )
    );
  });

  it("should loop thru objects", () => {});
});
describe("group", () => {
  it("should return groups as sequence", () => {
    expect(compile(`{{ (1,2) }}`)).toEqual(toCode("{return 1, 2}"));
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
    expect(compile(`{{ a and 1}}`)).toEqual(toCode("{return a && 1 }", "a"));
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
      toCode("{return something.about.me }", "something")
    );
    expect(compile(`{{ something[about][me] }}`)).toEqual(
      toCode("{return something[about][me] }", "something")
    );
    expect(compile(`{{ something[a+1] }}`)).toEqual(
      toCode("{return something[a+1] }", "something")
    );
  });
  test("should support expressions in lookup", () => {
    expect(compile(`{{ something[a+b].me }}`)).toEqual(
      toCode("{return something[a+b].me }", "something")
    );
  });
  test("should unary operators", () => {
    expect(compile(`{{ not a}}`)).toEqual(toCode("{return !a }", "a"));
  });
  test("should read nested properties or arrays", () => {
    expect(compile(`{{a.selling_plan.options[0].value}}`)).toEqual(
      toCode("{return a.selling_plan.options[0].value;}", "a")
    );
    expect(compile(`{{a[0].value}}`)).toEqual(
      toCode("{return a[0].value;}", "a")
    );
  });
  test("should binary operators", () => {
    expect(compile(`{{ a and 1}}`)).toEqual(toCode("{return a && 1 }", "a"));
    expect(compile(`{{ a and (b or c) and d}}`)).toEqual(
      toCode("{return a && (b || c) && d }", "a,b,c,d")
    );
  });
});

describe("set variable", () => {
  test("should declare top level variable a and initialize", () => {
    expect(compile(`{% set a = 1 %}`)).toEqual(
      toCode("{var a; return (()=>{ a = 1; })() }")
    );
  });
  test("set order.name = 1", () => {
    expect(compile(`{% set order.name = 1 %}`)).toEqual(
      toCode("{ return (()=>{order.name=1;})()}", "order")
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

  it("should not fail if ignore missing", () => {
    expect(compile(`{% include "missing.html" ignore missing %}`, {})).toEqual(
      toCode("{return null}", "")
    );
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
    compile(`{%include 'extra-content'%}`, {
      partials: {
        "extra-content": "This is the extra content",
      },
    });
  });
});

describe("members arguments", () => {
  it("should declare order variable", () => {
    expect(compile(`{% set order_id = order.public_id.foo.bar %}`)).toEqual(
      toCode(
        `{ 
var order_id;
return (() => {
  order_id = order.public_id.foo.bar;
})();}`,
        "order"
      )
    );
  });
});

describe("literals", () => {
  it("should support true/false", () => {
    expect(compile(" {% set foo = true %} ")).toEqual(
      toCode("{var foo; return html` ${(()=>{foo=true;})()} `;}", "")
    );
    expect(compile(" {% set foo = false %} ")).toEqual(
      toCode("{var foo; return html` ${(()=>{foo=false;})()} `;}", "")
    );
  });
  it("should support null", () => {
    expect(compile(" {% set foo = null %} ")).toEqual(
      toCode("{var foo; return html` ${(()=>{foo=null;})()} `;}", "")
    );
  });
});

describe("arrays", () => {
  it("should support arrays", () => {
    expect(
      compile(`
        {% set items = [
            { name: 'foo' },
            { name: 'bar' },
            { name: 'bear' }]
        %}
        
        {{ items | join(",", "name") }}        
        `)
    ).toEqual(
      toCode(
        "{var items; return html`\n" +
          "        ${(() => {\n    items = [{\n" +
          '      "name": "foo"\n' +
          "    }, {\n" +
          '      "name": "bar"\n' +
          "    }, {\n" +
          '      "name": "bear"\n' +
          "    }];\n" +
          "  })()}\n" +
          "        \n" +
          '        ${_F.join(items, ",", "name")}        \n' +
          "        `;\n" +
          "}",
        ""
      )
    );
  });
});
