const fs = require('fs');
const path = require('path');

const EXTS = ['.js', '.ts', '.jsx', '.tsx', '.json', '.php'];
const EXCLUDES = ['node_modules', '.git', '.next', 'build', 'dist', 'extract.js'];

function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (EXCLUDES.some(exclude => filePath.includes(exclude))) continue; // Salta brutalmente
    if (fs.statSync(filePath).isDirectory()) {
      getAllFiles(filePath, fileList);
    } else {
      if (EXTS.includes(path.extname(filePath))) {
        fileList.push(filePath);
      }
    }
  }
  return fileList;
}

const allFiles = getAllFiles(__dirname);
let output = '';

allFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  output += `\n=== ${path.basename(file)} ===\n${content}\n`;
});

fs.writeFileSync('ai_context.txt', output);
console.log('Fatto! ai_context.txt generato istantaneamente.');