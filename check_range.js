import fs from 'fs';
const content = fs.readFileSync('c:/QTool/src/components/DamageForm.jsx', 'utf8');
const lines = content.split('\n');

const stack = [];
for (let i = 2129; i <= 2350; i++) {
    const line = lines[i - 1];
    const opens = (line.match(/<div/g) || []).length;
    const closes = (line.match(/<\/div/g) || []).length;
    for (let j = 0; j < opens; j++) stack.push(i);
    for (let j = 0; j < closes; j++) {
        if (stack.length > 0) stack.pop();
        else console.log(`Extra close at line ${i}`);
    }
}
console.log('Stack for range 2129-2350:', stack);
