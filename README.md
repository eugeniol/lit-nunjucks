# lit-nunjucks

Compile https://mozilla.github.io/nunjucks/ templates into standar lit-html.

## Quickstart


Install the library

```bash
npm install lit-nunjucks
```

```js
const { compile } = require('lit-nunjucks')

```


Givend the input
```jinja
{% if authorized %} 
Hello {{customer.name}}
{% endif %}
```

It will generate
```js
function template({
  authorized
}) {
  return authorized && html`Hello ${customer.name}`;
}
```

## Why
Templates are backend tecnologies, Usually sever renders a template once with a given values. If use a template into a full front end app, everytime our data state change we have to re apply the template. This behaviout is costly and there are such a good alternatives there in order to performatly update the DOM with a new state (React, Vue, lit-html).

- Sometimes you dont want expose all js power to a template developer
- Templates are simpler to learn than learn advance es6 syntax
- You might not want to access globals in your templates such as `window`




* lit-html lets you write HTML templates in JavaScript, then efficiently render and re-render those templates together with data to create and update DOM. https://lit-html.polymer-project.org/

* You've been looking for a more sophisticated templating engine for JavaScript. https://mozilla.github.io/nunjucks/

This project attempts to bring best of both worlds. Use jinja style templates into a front end app performatly.

## Do I need this? 
Probably you don't. 