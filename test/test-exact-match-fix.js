const { readFileSync } = require('fs');

// Test the exact matching fix for getDefinitionAndBoundSpan
const markdownContent = `# summary

Open an agent in your org's Agent Builder UI in a browser.

# another-key

Another message content here.

# sum

A different message with the exact key 'sum'.
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

// Simulate the fixed getDefinitionAndBoundSpan logic
function testGetDefinition(messageRawMarkdown, msgKey) {
  console.log(`\n--- Testing getDefinition for key: "${msgKey}" ---`);
  
  // Parse the markdown to get exact key matches
  const markdown = markdownLoader('test.md', messageRawMarkdown);
  
  console.log('Available keys:', Array.from(markdown.keys()));
  console.log(`Exact key "${msgKey}" exists:`, markdown.has(msgKey));
  
  // Check if the exact key exists - if not, return early (void)
  if (!markdown.has(msgKey)) {
    console.log(`Key "${msgKey}" not found - returning undefined (early return)`);
    return undefined;
  }
  
  // Find the exact position of "# msgKey" in the raw markdown
  const pattern = new RegExp(`^# ${msgKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm');
  const match = pattern.exec(messageRawMarkdown);
  if (!match) {
    console.log(`Pattern match failed for "${msgKey}" - returning undefined`);
    return undefined;
  }
  
  const textSpanStart = match.index + 2; // +2 to skip "# " and point to the key
  console.log(`Found "${msgKey}" at position ${textSpanStart}`);
  
  return {
    definitions: [{
      name: `${msgKey} definition`,
      fileName: 'test.md',
      textSpan: {
        start: textSpanStart,
        length: msgKey.length
      }
    }]
  };
}

// Test cases
console.log('=== Testing the fixed getDefinitionAndBoundSpan logic ===');

// Test case 1: Non-existent key that's a substring of an existing key
const result1 = testGetDefinition(markdownContent, 'summ');
console.log('Result for "summ":', result1 ? 'Definition returned' : 'Correctly returned undefined');

// Test case 2: Non-existent key that's a substring of an existing key (original issue)
const result2 = testGetDefinition(markdownContent, 'sum');
console.log('Result for "sum":', result2 ? 'Definition returned' : 'Correctly returned undefined');

// Test case 3: Existing exact key
const result3 = testGetDefinition(markdownContent, 'summary');
console.log('Result for "summary":', result3 ? `Definition at position ${result3.definitions[0].textSpan.start}` : 'No definition');

// Test case 4: Another existing exact key
const result4 = testGetDefinition(markdownContent, 'another-key');
console.log('Result for "another-key":', result4 ? `Definition at position ${result4.definitions[0].textSpan.start}` : 'No definition');

// Now test with markdown that has 'sum' as an actual key
console.log('\n=== Testing with markdown that has "sum" as an actual key ===');
const result5 = testGetDefinition(markdownContent, 'sum');
console.log('Result for "sum" when it exists:', result5 ? `Definition at position ${result5.definitions[0].textSpan.start}` : 'No definition');

// Verify the position is correct
if (result5) {
  const lines = markdownContent.split('\n');
  let currentPos = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === '# sum') {
      console.log(`Expected position for "sum": ${currentPos + 2}`);
      console.log(`Actual position returned: ${result5.definitions[0].textSpan.start}`);
      console.log(`Match: ${currentPos + 2 === result5.definitions[0].textSpan.start}`);
      break;
    }
    currentPos += lines[i].length + 1; // +1 for newline
  }
}