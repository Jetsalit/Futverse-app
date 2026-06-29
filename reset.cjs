const { execSync } = require('child_process');
try {
  console.log(execSync('git status').toString());
  console.log(execSync('git checkout .').toString());
  console.log(execSync('git clean -fd').toString());
} catch(e) {
  console.error(e.message);
}
