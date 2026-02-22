
import sys

def check_syntax(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Very basic check for balanced braces and parentheses in the whole file
    stack = []
    lines = content.split('\n')
    for i, line in enumerate(lines):
        for char in line:
            if char in '{[(':
                stack.append((char, i+1))
            elif char in '}])':
                if not stack:
                    print(f"Extra closing {char} at line {i+1}")
                    return
                opening, line_num = stack.pop()
                if (opening == '{' and char != '}') or \
                   (opening == '[' and char != ']') or \
                   (opening == '(' and char != ')'):
                    print(f"Mismatched {opening} from line {line_num} with {char} at line {i+1}")
                    return
    if stack:
        opening, line_num = stack.pop()
        print(f"Unclosed {opening} from line {line_num}")
    else:
        print("Basic balance check passed")

if __name__ == "__main__":
    check_syntax(sys.argv[1])
