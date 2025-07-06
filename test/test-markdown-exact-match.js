const { readFileSync } = require('fs');
const { writeFileSync } = require('fs');
const path = require('path');

// Test the markdownLoader function and the exact matching logic
const markdownContent = `# summary

Open an agent in your org's Agent Builder UI in a browser.

# another-key

Another message content here.
`;

// Simulate the markdownLoader function from the main code
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

// Test current behavior
console.log('Testing markdownLoader...');
const parsed = markdownLoader('test.md', markdownContent);
console.log('Parsed keys:', Array.from(parsed.keys()));

// Test exact vs substring matching
console.log('\n--- Testing exact vs substring matching ---');
console.log('Looking for "sum":');
console.log('- Exact match exists:', parsed.has('sum'));
console.log('- Substring indexOf result:', markdownContent.indexOf('sum'));

console.log('\nLooking for "summary":');
console.log('- Exact match exists:', parsed.has('summary'));
console.log('- Substring indexOf result:', markdownContent.indexOf('summary'));

// Test how to find the correct position for exact matches
console.log('\n--- Finding correct positions ---');
const findExactKeyPosition = (rawMarkdown, key) => {
  // Look for "# " + key at the start of a line
  const pattern = new RegExp(`^# ${key}$`, 'm');
  const match = pattern.exec(rawMarkdown);
  if (match) {
    return match.index + 2; // +2 to skip "# "
  }
  return -1;
};

console.log('Position of "sum" (should be -1):', findExactKeyPosition(markdownContent, 'sum'));
console.log('Position of "summary" (should be valid):', findExactKeyPosition(markdownContent, 'summary'));