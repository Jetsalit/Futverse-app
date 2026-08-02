const fs = require('fs');
const path = 'src/components/PlayerDashboard.tsx';
const content = fs.readFileSync(path, 'utf8');
const isCRLF = content.includes('\r\n');
let lines = content.split(/\r?\n/);

// Keep only up to line 769 (index 768)
lines = lines.slice(0, 769);

// Add the closing tags for the component
lines.push('    </div>');
lines.push('  );');
lines.push('}');

// Join with the original line ending
const newContent = lines.join(isCRLF ? '\r\n' : '\n');
fs.writeFileSync(path, newContent);

console.log('PlayerDashboard.tsx has been successfully fixed and truncated!');
