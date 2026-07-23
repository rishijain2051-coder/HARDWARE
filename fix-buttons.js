const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.tsx')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk('app/(dashboard)');
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;
  
  // variant="ghost" ... size="sm"
  const regex1 = /(variant="ghost"[\s\n]*)size="sm"/g;
  if (regex1.test(content)) {
    content = content.replace(regex1, '$1size="icon"');
    changed = true;
  }
  
  // size="sm" ... variant="ghost"
  const regex2 = /size="sm"([\s\n]*variant="ghost")/g;
  if (regex2.test(content)) {
    content = content.replace(regex2, 'size="icon"$1');
    changed = true;
  }

  // Handle the single line cases that we might have missed if there are other props between them
  const regex3 = /(<Button[^>]*?)size="sm"([^>]*?variant="ghost"[^>]*?>)/g;
  if (regex3.test(content)) {
    content = content.replace(regex3, '$1size="icon"$2');
    changed = true;
  }
  const regex4 = /(<Button[^>]*?variant="ghost"[^>]*?)size="sm"([^>]*?>)/g;
  if (regex4.test(content)) {
    content = content.replace(regex4, '$1size="icon"$2');
    changed = true;
  }
  
  // In grn/create/client.tsx and mis/create/client.tsx, the delete button is variant="ghost" size="sm"
  
  if (changed) {
    fs.writeFileSync(file, content);
    console.log('Updated', file);
  }
});
