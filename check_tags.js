import fs from 'fs';
const content = fs.readFileSync('c:/QTool/src/components/DamageForm.jsx', 'utf8');

function count(char) {
    let cnt = 0;
    for (let i = 0; i < content.length; i++) {
        if (content[i] === char) cnt++;
    }
    return cnt;
}

console.log('Braces: {', count('{'), '} ', count('}'));
console.log('Parens: (', count('('), ') ', count(')'));
console.log('Fragments: <>', content.split('<>').length - 1, '</> ', content.split('</>').length - 1);
console.log('Divs: <div', content.split('<div').length - 1, '</div> ', content.split('</div>').length - 1);
