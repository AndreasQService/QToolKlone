import re

def check_jsx_balance(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()

    # Simple regex to find JSX tags
    # This is not perfect for nested templates or strings, but helps find obvious missing closers.
    # We want to ignore self-closing tags <img ... />
    
    # Remove comments
    content = re.sub(r'{\/\*.*?\*\/}', '', content, flags=re.DOTALL)
    content = re.sub(r'\/\/.*', '', content)
    content = re.sub(r'\/\*.*?\*\/', '', content, flags=re.DOTALL)

    # Simplified JSX tag matcher
    # Look for <Tag or </Tag
    # Ignore < followed by space or number (not a tag)
    # Ignore self-closing <Tag ... />
    
    tags = re.findall(r'<(?![\s\d])/?([a-zA-Z0-9\.]+)(?:\s+[^>]*?)?(/?\s*)>', content)
    
    stack = []
    line_count = content.count('\n')
    
    # We also need to check fragments <> and </>
    fragment_indices = [(m.start(), m.group()) for m in re.finditer(r'<(/?)>', content)]
    
    # Better approach: process line by line or find all starts/ends
    
    # Fine-grained search for tag starts and ends
    patterns = [
        (r'<([a-zA-Z0-9\.]+)', 'start'),
        (r'</([a-zA-Z0-9\.]+)>', 'end'),
        (r'/>', 'self_close'),
        (r'<>', 'frag_start'),
        (r'</>', 'frag_end')
    ]
    
    all_marks = []
    for pattern, type in patterns:
        for m in re.finditer(pattern, content):
            all_marks.append((m.start(), type, m.group(1) if type in ['start', 'end'] else ''))
            
    all_marks.sort()
    
    stack = []
    for pos, type, name in all_marks:
        line_num = content[:pos].count('\n') + 1
        if type == 'start':
            stack.append((name, line_num))
        elif type == 'end':
            if not stack:
                print(f"Error: Found closing tag </{name}> at line {line_num} with no opened tag.")
                continue
            last_name, last_line = stack.pop()
            if last_name != name:
                print(f"Error: Mismatched tag at line {line_num}. Expected </{last_name}> (opened at {last_line}), but found </{name}>.")
                # Put it back to continue checking
                stack.append((last_name, last_line))
        elif type == 'frag_start':
            stack.append(('Fragment', line_num))
        elif type == 'frag_end':
            if not stack:
                print(f"Error: Found closing fragment </> at line {line_num} with no opened fragment.")
                continue
            last_name, last_line = stack.pop()
            if last_name != 'Fragment':
                print(f"Error: Mismatched tag at line {line_num}. Expected </{last_name}> (opened at {last_line}), but found </Fragment>.")
                stack.append((last_name, last_line))
        elif type == 'self_close':
            if stack:
                # If we are inside a tag and find />, it closes THAT tag
                # But wait, self-closing tags are like <Tag />
                # The start pattern already pushed it to the stack.
                stack.pop()
                
    if stack:
        print("\nUnclosed tags remaining in stack:")
        for name, line in reversed(stack):
            print(f"- <{name}> opened at line {line}")

check_jsx_balance('DamageForm.jsx')
