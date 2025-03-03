# @cristiand391/typescript-sf-plugin

A TS service language plugin to resolve's sfdx-core's messages from code.
See: https://github.com/microsoft/TypeScript/wiki/Writing-a-Language-Service-Plugin

This was done for my team's dev-choice week in 2 days, code needs some polish 😛

### Hover/quick info

https://github.com/user-attachments/assets/7fb26e94-dabf-4155-b481-2dd7e75ec49d


### Go to definition

https://github.com/user-attachments/assets/b46a12d5-b4e9-4c79-b936-a60b5c6ee921

### Testing

1. Clone this repo and install deps (`npm install`)
2. Clone any of our plugin repos like https://github.com/salesforcecli/plugin-org/
2. `cd` in to the repo and install the TS lang plugin: `yarn add --dev file:/path/to/typescript-sf-plugin`
3. Add it in the `plugins` array in the plugin's tsconfig:
```json
"plugins": [{
  "name": "@cristiand391/typescript-sf-plugin",
}]
```
See: https://www.typescriptlang.org/tsconfig/#plugins

5. enjoy :shipit:
