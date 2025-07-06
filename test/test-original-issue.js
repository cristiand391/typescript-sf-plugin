const { readFileSync } = require('fs');

// Test the original issue scenario: 'sum' doesn't exist but 'summary' does
const originalIssueMarkdown = `# summary

Open an agent in your org's Agent Builder UI in a browser.
`;

// Copy the markdownLoader and regex patterns from the main code
const REGEXP_NO_CONTENT = /^\s*$/g;
const REGEXP_NO_CONTENT_SECTION = /^#\s*/gm;
const REGEXP_MD_IS_LIST_ROW = /^[*-]\s+|^ {2}/;
const REGEXP_MD_LIST_ITEM = /^[*-]\s+/gm;

const markdownLoader = (filePath, fileContents) => {
  const map = new Map();
  const hasContent = (lineItem) => !REGEXP_NO_CONTENT.exec(lineItem);

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
    }
  }

  return map;
};

// Test the ORIGINAL (broken) behavior vs the FIXED behavior
function testOriginalBehavior(messageRawMarkdown, msgKey) {
  console.log(`\n--- Original (broken) behavior for key: "${msgKey}" ---`);
  
  // This is the old logic that had the bug
  const textSpanStart = messageRawMarkdown.indexOf(msgKey);
  console.log(`indexOf("${msgKey}") result:`, textSpanStart);
  
  if (textSpanStart >= 0) {
    console.log(`Would return definition at position ${textSpanStart} (WRONG - substring match)`);
    return { definitions: [{ textSpan: { start: textSpanStart, length: msgKey.length } }] };
  } else {
    console.log(`Would return undefined (correct behavior)`);
    return undefined;
  }
}

function testFixedBehavior(messageRawMarkdown, msgKey) {
  console.log(`\n--- Fixed behavior for key: "${msgKey}" ---`);
  
  // Parse the markdown to get exact key matches
  const markdown = markdownLoader('test.md', messageRawMarkdown);
  
  console.log('Available exact keys:', Array.from(markdown.keys()));
  
  // Check if the exact key exists - if not, return early (void)
  if (!markdown.has(msgKey)) {
    console.log(`Exact key "${msgKey}" not found - returning undefined (CORRECT)`);
    return undefined;
  }
  
  // Find the exact position of "# msgKey" in the raw markdown
  const pattern = new RegExp(`^# ${msgKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm');
  const match = pattern.exec(messageRawMarkdown);
  if (!match) {
    console.log(`Pattern match failed - returning undefined`);
    return undefined;
  }
  
  const textSpanStart = match.index + 2; // +2 to skip "# " and point to the key
  console.log(`Found exact key "${msgKey}" at position ${textSpanStart} (CORRECT)`);
  
  return {
    definitions: [{
      textSpan: {
        start: textSpanStart,
        length: msgKey.length
      }
    }]
  };
}

console.log('=== Testing the original issue scenario ===');
console.log('Markdown content:');
console.log(originalIssueMarkdown);

// Test the problematic case: looking for 'sum' when only 'summary' exists
console.log('\n🔍 Testing the exact issue: looking for "sum" when only "summary" exists');

const originalResult = testOriginalBehavior(originalIssueMarkdown, 'sum');
const fixedResult = testFixedBehavior(originalIssueMarkdown, 'sum');

console.log('\n📊 Summary:');
console.log(`Original behavior: ${originalResult ? 'Returns wrong definition (BUG)' : 'Returns undefined'}`);
console.log(`Fixed behavior: ${fixedResult ? 'Returns definition' : 'Returns undefined (CORRECT)'}`);

// Also test that existing keys still work
console.log('\n✅ Testing that existing keys still work correctly');
const originalResultSummary = testOriginalBehavior(originalIssueMarkdown, 'summary');
const fixedResultSummary = testFixedBehavior(originalIssueMarkdown, 'summary');

console.log('\n📊 Summary for "summary" key:');
console.log(`Original behavior: ${originalResultSummary ? 'Returns definition' : 'Returns undefined'}`);
console.log(`Fixed behavior: ${fixedResultSummary ? 'Returns definition' : 'Returns undefined'}`);

if (originalResultSummary && fixedResultSummary) {
  console.log(`Position consistency: Original=${originalResultSummary.definitions[0].textSpan.start}, Fixed=${fixedResultSummary.definitions[0].textSpan.start}`);
}