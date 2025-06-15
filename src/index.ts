import type * as ts from "typescript/lib/tsserverlibrary";
import * as tsutils from 'tsutils'
import { readFileSync } from 'node:fs'

function init(modules: { typescript: typeof import("typescript/lib/tsserverlibrary") }) {
  const ts = modules.typescript;

  function create(info: ts.server.PluginCreateInfo) {
    // Diagnostic logging
    info.project.projectService.logger.info(
      "plugin @cristiand391/typescript-sf-plugin was loaded successfully"
    );

    // Set up decorator object
    const proxy: ts.LanguageService = Object.create(null);
    for (let k of Object.keys(info.languageService) as Array<keyof ts.LanguageService>) {
      const x = info.languageService[k]!;
      // @ts-expect-error - JS runtime trickery which is tricky to type tersely
      proxy[k] = (...args: Array<{}>) => x.apply(info.languageService, args);
    }

    // Find the variable declaration assigned from Messages.loadMessages
    function findMessagesLoadCall(ts: typeof import('typescript/lib/tsserverlibrary'), sourceFile: ts.SourceFile, varName: string): ts.CallExpression | undefined {
      let found: ts.CallExpression | undefined;
      ts.forEachChild(sourceFile, child => {
        if (ts.isVariableStatement(child)) {
          child.declarationList.declarations.forEach(decl => {
            if (
              decl.name.getText() === varName &&
              decl.initializer &&
              ts.isCallExpression(decl.initializer) &&
              decl.initializer.expression.getText() === 'Messages.loadMessages'
            ) {
              found = decl.initializer;
            }
          });
        }
      });
      return found;
    }

    // Extract bundle name from Messages.loadMessages call
    function getBundleMsgName(ts: typeof import('typescript/lib/tsserverlibrary'), callExpr: ts.CallExpression): string | undefined {
      if (callExpr.arguments.length > 1 && ts.isStringLiteral(callExpr.arguments[1])) {
        return callExpr.arguments[1].text;
      }
      return undefined;
    }

    // Given a node, try to resolve the context for a Salesforce message reference
    function resolveMessageContext(ts: typeof import('typescript/lib/tsserverlibrary'), info: ts.server.PluginCreateInfo, sourceFile: ts.SourceFile, node: ts.Node) {
      if (
        node.kind === ts.SyntaxKind.StringLiteral &&
        node.parent &&
        ts.isCallExpression(node.parent) &&
        ts.isPropertyAccessExpression(node.parent.expression)
      ) {
        const propAccess = node.parent.expression;
        const methodName = propAccess.name.getText();
        if (methodName === 'getMessage' || methodName === 'createError' || methodName === 'createWarning') {
          const varName = propAccess.expression.getText();
          const callExpr = findMessagesLoadCall(ts, sourceFile, varName);
          if (!callExpr) return;
          const bundleMsgName = getBundleMsgName(ts, callExpr);
          if (!bundleMsgName) return;
          const messageFilePath = `${info.project.getCurrentDirectory()}/messages/${bundleMsgName}.md`;
          // @ts-ignore
          const msgKey = node.text as string;
          return { bundleMsgName, messageFilePath, msgKey };
        }
      }
      return undefined;
    }

    proxy.getQuickInfoAtPosition = (fileName, position) => {
      const prior = info.languageService.getQuickInfoAtPosition(fileName,position);
      if (!prior) {
        const sourceFile = info.languageService.getProgram()?.getSourceFile(fileName) as ts.SourceFile;
        const node = tsutils.getTokenAtPosition(sourceFile, position)
        if (!node) return
        const context = resolveMessageContext(ts, info, sourceFile, node);
        if (context) {
          const { messageFilePath, msgKey } = context;
          info.project.projectService.logger.info(`filePath: ${messageFilePath}`);
          const messageRawMarkdown = readFileSync(messageFilePath, 'utf8');
          const markdown = markdownLoader(messageFilePath, messageRawMarkdown);
          info.project.projectService.logger.info(`msg key: ${msgKey}`);
          const message = markdown.get(msgKey) ?? 'could not find msg, sorry';
          return {
            kind: ts.ScriptElementKind.string,
            textSpan: {
              start: node.getStart(),
              length: 10,
            },
            kindModifiers: '',
            documentation: [{
              text: Array.isArray(message) ? message.join('\n\n') : message as string,
              kind: 'text'
            }]
          };
        }
      }
      return prior;
    }
    
    proxy.getDefinitionAndBoundSpan = (fileName, position) => {
      const prior = info.languageService.getDefinitionAndBoundSpan(fileName, position)
      if (!prior) {
        const projectService = info.project.projectService
        projectService.logger.info('no definition found')
        const sourceFile = info.languageService.getProgram()?.getSourceFile(fileName) as ts.SourceFile;
        const node = tsutils.getTokenAtPosition(sourceFile, position)
        if (!node) return
        const context = resolveMessageContext(ts, info, sourceFile, node);
        if (context) {
          const { messageFilePath, msgKey } = context;
          const messageRawMarkdown = readFileSync(messageFilePath, 'utf8');
          const textSpanStart = messageRawMarkdown.indexOf(msgKey);
          return {
            definitions: [{
              name: `${msgKey} definition`,
              containerKind: ts.ScriptElementKind.string,
              containerName: '',
              kind: ts.ScriptElementKind.string,
              fileName: messageFilePath,
              textSpan: {
                start: textSpanStart,
                length: msgKey.length
              }
            }],
            textSpan: {
              start: 0,
              length: 5
            }
          };
        }
      }
      return prior;
    }

    // getCompletionsAtPosition is needed to provide the list of message keys as completion suggestions
    // when the user triggers completion (e.g., Tab or Ctrl+Space) in the first argument of getMessage/createError/createWarning.
    // Without this, the user will not see custom message keys as suggestions.
    proxy.getCompletionsAtPosition = (fileName, position, options) => {
      const prior = info.languageService.getCompletionsAtPosition(fileName, position, options);
      const sourceFile = info.languageService.getProgram()?.getSourceFile(fileName) as ts.SourceFile;
      const node = tsutils.getTokenAtPosition(sourceFile, position);
      if (!node) return prior;
      // Check if we're in the first argument of getMessage/createError/createWarning
      if (
        node.kind === ts.SyntaxKind.StringLiteral &&
        node.parent &&
        ts.isCallExpression(node.parent) &&
        node.parent.arguments.length > 0 &&
        node.parent.arguments[0] === node &&
        ts.isPropertyAccessExpression(node.parent.expression)
      ) {
        const propAccess = node.parent.expression;
        const methodName = propAccess.name.getText();
        if (["getMessage", "createError", "createWarning"].includes(methodName)) {
          const varName = propAccess.expression.getText();
          const callExpr = findMessagesLoadCall(ts, sourceFile, varName);
          if (!callExpr) return prior;
          const bundleMsgName = getBundleMsgName(ts, callExpr);
          if (!bundleMsgName) return prior;
          const messageFilePath = `${info.project.getCurrentDirectory()}/messages/${bundleMsgName}.md`;
          let messageRawMarkdown: string;
          try {
            messageRawMarkdown = readFileSync(messageFilePath, 'utf8');
          } catch {
            return prior;
          }
          const markdown = markdownLoader(messageFilePath, messageRawMarkdown);
          const entries = Array.from(markdown.entries()).map(([key, value]) => {
            const doc = Array.isArray(value) ? value.join('\n\n') : (typeof value === 'string' ? value : JSON.stringify(value));
            return {
              name: key,
              kind: ts.ScriptElementKind.string,
              kindModifiers: '',
              sortText: '0',
              // VSCode/TS supports 'documentation' for completion entry details
              documentation: doc,
            };
          });
          return {
            isGlobalCompletion: false,
            isMemberCompletion: false,
            isNewIdentifierLocation: false,
            entries,
          };
        }
      }
      return prior;
    }

    // getCompletionEntryDetails is needed to provide the message content as documentation/hover details
    // when the user hovers or selects a completion entry from the list provided by getCompletionsAtPosition.
    // Without this, the user will not see the message content as documentation for the selected key.
    proxy.getCompletionEntryDetails = (fileName, position, entryName, formatOptions, source, preferences, data) => {
      // Try to resolve message context for the completion entry
      const sourceFile = info.languageService.getProgram()?.getSourceFile(fileName) as ts.SourceFile;
      const node = tsutils.getTokenAtPosition(sourceFile, position);
      if (node) {
        // Try to find the context for the message key
        if (
          node.parent &&
          ts.isCallExpression(node.parent) &&
          node.parent.arguments.length > 0 &&
          ts.isPropertyAccessExpression(node.parent.expression)
        ) {
          const propAccess = node.parent.expression;
          const methodName = propAccess.name.getText();
          if (["getMessage", "createError", "createWarning"].includes(methodName)) {
            const varName = propAccess.expression.getText();
            const callExpr = findMessagesLoadCall(ts, sourceFile, varName);
            if (callExpr) {
              const bundleMsgName = getBundleMsgName(ts, callExpr);
              if (bundleMsgName) {
                const messageFilePath = `${info.project.getCurrentDirectory()}/messages/${bundleMsgName}.md`;
                let messageRawMarkdown: string;
                try {
                  messageRawMarkdown = readFileSync(messageFilePath, 'utf8');
                } catch {
                  return info.languageService.getCompletionEntryDetails(fileName, position, entryName, formatOptions, source, preferences, data);
                }
                const markdown = markdownLoader(messageFilePath, messageRawMarkdown);
                const value = markdown.get(entryName);
                if (value) {
                  const doc = Array.isArray(value) ? value.join('\n\n') : (typeof value === 'string' ? value : JSON.stringify(value));
                  return {
                    name: entryName,
                    kind: ts.ScriptElementKind.string,
                    kindModifiers: '',
                    displayParts: [{ text: '', kind: 'text' }],
                    documentation: [{ text: doc, kind: 'markdown' }],
                    tags: [],
                  };
                }
              }
            }
          }
        }
      }
      // fallback to default
      return info.languageService.getCompletionEntryDetails(fileName, position, entryName, formatOptions, source, preferences, data);
    }

    return proxy;
  }

  return { create };
  }
  
  export = init;
  

type StoredMessage = string | string[] | { [s: string]: StoredMessage };
type StoredMessageMap = Map<string, StoredMessage>;
type FileParser = (filePath: string, fileContents: string) => StoredMessageMap;

const REGEXP_NO_CONTENT = /^\s*$/g;
const REGEXP_NO_CONTENT_SECTION = /^#\s*/gm;
const REGEXP_MD_IS_LIST_ROW = /^[*-]\s+|^ {2}/;
const REGEXP_MD_LIST_ITEM = /^[*-]\s+/gm;

const markdownLoader: FileParser = (filePath: string, fileContents: string): StoredMessageMap => {
  const map = new Map<string, StoredMessage>();
  const hasContent = (lineItem: string): boolean => !REGEXP_NO_CONTENT.exec(lineItem);

  // Filter out sections that don't have content
  const sections = fileContents.split(REGEXP_NO_CONTENT_SECTION).filter(hasContent);

  for (const section of sections) {
    const lines = section.split('\n');
    const firstLine = lines.shift();
    const rest = lines.join('\n').trim();

    if (firstLine && rest.length > 0) {
      const key = firstLine.trim();
      const nonEmptyLines = lines.filter((line) => !!line.trim());
      // If every entry in the value is a list item, then treat this as a list. Indented lines are part of the list.
      if (nonEmptyLines.every((line) => REGEXP_MD_IS_LIST_ROW.exec(line))) {
        const listItems = rest.split(REGEXP_MD_LIST_ITEM).filter(hasContent);
        const values = listItems.map((item) =>
          item
            .split('\n')
            // new lines are ignored in markdown lists
            .filter((line) => !!line.trim())
            // trim off the indentation
            .map((line) => line.trim())
            // put it back together
            .join('\n')
        );
        map.set(key, values);
      } else {
        map.set(key, rest);
      }
    } else {
      // use error instead of SfError because messages.js should have no internal dependencies.
      throw new Error(
        `Invalid markdown message file: ${filePath}\nThe line "# <key>" must be immediately followed by the message on a new line.`
      );
    }
  }

  return map;
};
