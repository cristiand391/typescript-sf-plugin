This is a TypeScript language service plugin that plugs in the LSP's quickinfo and go-to-def calls to resolve `@salesforce/core`'s npm library's `Messages` class references in code.
`@salesforce/core` allows to define messages in a markdown file and reference them in code like this:

```ts
import { Messages } from '@salesforce/core';

const messages = Messages.loadMessages('@salesforce/plugin-auth', 'logout');
const summary = messages.getMessage('flags.target-org.summary')
```

where the messages are defined in `<project>/messages/logout.md`

Typescript info of supported methods to resolve messages:

```ts
(method) Messages<T extends string>.loadMessages(packageName: string, bundleName: string): Messages<string>
(method) Messages<string>.getMessage(key: string, tokens?: Tokens): string
(method) Messages<string>.createWarning(key: string, tokens?: Tokens, actionTokens?: Tokens): StructuredMessage
(method) Messages<string>.createError(key: string, tokens?: Tokens, actionTokens?: Tokens, exitCodeOrCause?: number | Error, cause?: Error): SfError
```
