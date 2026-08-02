import fs from 'fs';
import path from 'path';

const componentsDir = 'c:\\Users\\asus\\Documents\\Futverse-app\\src\\components';

const files = fs.readdirSync(componentsDir).filter(f => f.endsWith('.tsx'));

let modifiedCount = 0;

for (const file of files) {
  if (file === 'ThaiDatePicker.tsx') continue;
  
  const filePath = path.join(componentsDir, file);
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Basic check if it has type="date"
  if (content.includes('type="date"') || content.includes("type='date'")) {
    
    // Replace <input type="date" ... /> or similar with <ThaiDatePicker ... />
    // It's tricky with regex because attributes could span multiple lines.
    // So let's look for "<input" and then check if it has type="date".
    
    let hasModifications = false;
    let newContent = '';
    let i = 0;
    while (i < content.length) {
      const inputIdx = content.indexOf('<input', i);
      if (inputIdx === -1) {
        newContent += content.slice(i);
        break;
      }
      
      const closeIdx = content.indexOf('>', inputIdx);
      if (closeIdx === -1) {
        newContent += content.slice(i);
        break;
      }
      
      const tagContent = content.slice(inputIdx, closeIdx + 1);
      
      // If this input has type="date"
      if (/type\s*=\s*(["'])date\1/.test(tagContent)) {
        // Replace <input with <ThaiDatePicker and remove type="date"
        let newTag = tagContent.replace('<input', '<ThaiDatePicker');
        newTag = newTag.replace(/\btype\s*=\s*(["'])date\1/, '');
        
        // Also if it doesn't self close properly, we should ensure it does, but React inputs are usually self closing '/>'
        
        newContent += content.slice(i, inputIdx) + newTag;
        hasModifications = true;
      } else {
        newContent += content.slice(i, closeIdx + 1);
      }
      
      i = closeIdx + 1;
    }
    
    if (hasModifications) {
      // Add import at top
      if (!newContent.includes('ThaiDatePicker')) {
         const importStr = "import { ThaiDatePicker } from './ThaiDatePicker';\n";
         // insert after last import or at top
         const firstImport = newContent.indexOf('import ');
         if (firstImport !== -1) {
             newContent = newContent.slice(0, firstImport) + importStr + newContent.slice(firstImport);
         } else {
             newContent = importStr + newContent;
         }
      }
      
      fs.writeFileSync(filePath, newContent, 'utf-8');
      modifiedCount++;
      console.log(`Updated ${file}`);
    }
  }
}

console.log(`Finished updating ${modifiedCount} files.`);
