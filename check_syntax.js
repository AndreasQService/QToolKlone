
import fs from 'fs';
import process from 'process';
const content = fs.readFileSync(process.argv[2], 'utf8');
const stack = [];
const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let char of line) {
        if ('{[('.includes(char)) {
            stack.push({ char, line: i + 1 });
        } else if ('}])'.includes(char)) {
            if (stack.length === 0) {
                console.log(`Extra closing ${char} at line ${i + 1}`);
                process.exit(1);
            }
            const top = stack.pop();
            if ((top.char === '{' && char !== '}') ||
                (top.char === '[' && char !== ']') ||
                (top.char === '(' && char !== ')')) {
                console.log(`Mismatched ${top.char} from line ${top.line} with ${char} at line ${i + 1}`);
                process.exit(1);
            }
        }
    }
}
if (stack.length > 0) {
    const top = stack.pop();
    console.log(`Unclosed ${top.char} from line ${top.line}`);
    process.exit(1);
} else {
    console.log("Basic balance check passed");
}
