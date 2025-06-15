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

    proxy.getQuickInfoAtPosition = (fileName, position) => {
      const prior = info.languageService.getQuickInfoAtPosition(fileName,position);

      if (!prior) {
        const sourceFile = info.languageService.getProgram()?.getSourceFile(fileName) as ts.SourceFile;
        const node = tsutils.getTokenAtPosition(sourceFile, position)
        if (!node) return

        // Check if string and is arg of getMessage or createError
        if (
          node.kind === ts.SyntaxKind.StringLiteral &&
          node.parent &&
          ts.isCallExpression(node.parent) &&
          ts.isPropertyAccessExpression(node.parent.expression)
        ) {
          const propAccess = node.parent.expression;
          const methodName = propAccess.name.getText();
          if (methodName === 'getMessage' || methodName === 'createError') {
            const varName = propAccess.expression.getText();
            // Find the variable declaration for varName
            let messageImportNode;
            ts.forEachChild(sourceFile, child => {
              if (ts.isVariableStatement(child)) {
                child.declarationList.declarations.forEach(decl => {
                  if (
                    decl.name.getText() === varName &&
                    decl.initializer &&
                    ts.isCallExpression(decl.initializer) &&
                    decl.initializer.expression.getText() === 'Messages.loadMessages'
                  ) {
                    messageImportNode = decl.initializer;
                  }
                });
              }
            });
            if (!messageImportNode || !ts.isCallExpression(messageImportNode)) {
              info.project.projectService.logger.info('Unable to find message import node');
              return;
            }
            const callExpr = messageImportNode as ts.CallExpression;
            // Get bundleMsgName (second argument)
            const bundleMsgName =
              callExpr.arguments.length > 1 &&
              ts.isStringLiteral(callExpr.arguments[1]) &&
              callExpr.arguments[1].text;
            if (!bundleMsgName) {
              info.project.projectService.logger.info('Unable to find bundle message name');
              return;
            }
            info.project.projectService.logger.info(`bundleMsgName: ${bundleMsgName}`);
            const messageFilePath = `${info.project.getCurrentDirectory()}/messages/${bundleMsgName}.md`;
            info.project.projectService.logger.info(`filePath: ${messageFilePath}`);
            const messageRawMarkdown = readFileSync(messageFilePath, 'utf8');
            const markdown = markdownLoader(messageFilePath, messageRawMarkdown);
            // @ts-ignore
            const msgKey = node.text as string;
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
        // Find the variable name used in the method call
        if (
          node.kind === ts.SyntaxKind.StringLiteral &&
          node.parent &&
          ts.isCallExpression(node.parent) &&
          ts.isPropertyAccessExpression(node.parent.expression)
        ) {
          const propAccess = node.parent.expression;
          const methodName = propAccess.name.getText();
          if (methodName === 'getMessage' || methodName === 'createError') {
            const varName = propAccess.expression.getText();
            let messageImportNode;
            ts.forEachChild(sourceFile, child => {
              if (ts.isVariableStatement(child)) {
                child.declarationList.declarations.forEach(decl => {
                  if (
                    decl.name.getText() === varName &&
                    decl.initializer &&
                    ts.isCallExpression(decl.initializer) &&
                    decl.initializer.expression.getText() === 'Messages.loadMessages'
                  ) {
                    messageImportNode = decl.initializer;
                  }
                });
              }
            });
            if (!messageImportNode || !ts.isCallExpression(messageImportNode)) {
              projectService.logger.info('Unable to find message import node');
              return;
            }
            const callExpr = messageImportNode as ts.CallExpression;
            const bundleMsgName =
              callExpr.arguments.length > 1 &&
              ts.isStringLiteral(callExpr.arguments[1]) &&
              callExpr.arguments[1].text;
            if (!bundleMsgName) {
              projectService.logger.info('Unable to find bundle message name');
              return;
            }
            projectService.logger.info(`bundleMsgName: ${bundleMsgName}`);
            const messageFilePath = `${info.project.getCurrentDirectory()}/messages/${bundleMsgName}.md`;
            const messageRawMarkdown = readFileSync(messageFilePath, 'utf8');
            // @ts-ignore
            const msgKey = node.text as string;
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
      }
      return prior;
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
