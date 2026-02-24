import fs from 'fs';
const content = fs.readFileSync('c:/QTool/src/components/DamageForm.jsx', 'utf8');

const lines = content.split('\n');
let depth = 0;
const stack = [];

lines.forEach((line, i) => {
    const opens = (line.match(/<div/g) || []).length;
    const closes = (line.match(/<\/div/g) || []).length;

    for (let j = 0; j < opens; j++) stack.push(i + 1);
    for (let j = 0; j < closes; j++) {
        if (stack.length > 0) stack.pop();
        else console.log(`Extra closing div at line ${i + 1}`);
    }
});

console.log('Final Stack:', stack);
