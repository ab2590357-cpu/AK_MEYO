# A-X-HK Plugins

Adding a new command is now simple: drop a `.js` file anywhere inside `plugins/` (except files/folders beginning with `_`) and restart/redeploy the bot.

You do **not** edit `src/index.js`, the command registry, or the menu. The plugin loader discovers the file automatically, the registry accepts it, and its category appears in the menu automatically.

## One command

```js
export default {
  name: 'hello',
  aliases: ['hi'],
  category: 'fun',
  description: 'Say hello',
  usage: 'hello',
  async run(ctx) {
    await ctx.reply('Hello 👋');
  }
};
```

Save it as something like `plugins/custom/hello.js`.

## Multiple related commands in one plugin

```js
export default [
  {
    name: 'one',
    category: 'tools',
    async run(ctx) { await ctx.reply('One'); }
  },
  {
    name: 'two',
    aliases: ['second'],
    category: 'tools',
    async run(ctx) { await ctx.reply('Two'); }
  }
];
```

## Useful command fields

- `name` — required command name without the prefix.
- `aliases` — optional alternate names.
- `category` — menu category. New category names are picked up automatically.
- `description` — shown by command/help tools.
- `usage` — short usage hint.
- `ownerOnly`, `groupOnly`, `adminOnly`, `botAdminRequired` — optional permission flags already supported by the bot.
- `cooldown` — optional cooldown seconds.
- `run(ctx)` — required command handler.

## Existing bot commands

The original A-X-HK command packs are now under `plugins/core/`. They still use the existing internal registry API so their behavior stays unchanged. New plugins do not need to import that registry; the loader registers exported command objects for you.

## Disable a plugin

Rename `something.js` to `something.disabled.js`, or prefix a plugin file/folder with `_`.

`_example.plugin.js` is intentionally ignored and can be copied as a starting template.
