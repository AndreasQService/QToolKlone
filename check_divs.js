import fs from 'fs';
const content = fs.readFileSync('c:/QTool/src/components/DamageForm.jsx', 'utf8');

const stack = [];
const lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Simple regex for <div and </div>
    // This is naive but might help
    const openMatches = line.match(/<div/g);
    const closeMatches = line.match(/<\/div/g);

    if (openMatches) {
        for (let j = 0; j < openMatches.length; j++) {
            stack.push({ line: i + 1, type: 'div' });
        }
    }

    if (closeMatches) {
        for (let j = 0; j < closeMatches.length; j++) {
            if (stack.length > 0) {
                stack.pop();
            } else {
                console.log(`Extra closing div at line ${i + 1}`);
            }
        }
    }
}

console.log('Unclosed divs at end:');
stack.forEach(s => console.log(`Unclosed div from line ${s.line}`));
