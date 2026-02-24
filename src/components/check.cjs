const fs = require('fs');
const content = fs.readFileSync('DamageForm.jsx', 'utf8');
const lines = content.split('\n');

let stack = [];
lines.forEach((line, i) => {
    const lineNum = i + 1;

    // Process line by line, finding tag starts, ends, and self-closes
    // Using a more complex regex to find all marks in order
    const regex = /<div|<\/div|<form|<\/form|<>|<\/>|<ImageEditor|<\/ImageEditor|\/>/g;
    let match;
    while ((match = regex.exec(line)) !== null) {
        const type = match[0];
        if (type === '<div' || type === '<form' || type === '<>' || type === '<ImageEditor') {
            stack.push({ type, line: lineNum });
        } else if (type === '</div>' || type === '</form>' || type === '</>' || type === '</ImageEditor>') {
            const last = stack[stack.length - 1];
            const expected = type.replace('/', '');
            if (last && last.type === expected) {
                stack.pop();
            } else {
                console.log(`Mismatch: Found ${type} at line ${lineNum}, expected closing for ${last ? last.type : 'nothing'}`);
            }
        } else if (type === '/>') {
            // Self-closing tag
            if (stack.length > 0) {
                const last = stack[stack.length - 1];
                if (last.type === '<div' || last.type === '<ImageEditor') {
                    stack.pop();
                }
            }
        }
    }
});

console.log('Final Stack:', stack);
