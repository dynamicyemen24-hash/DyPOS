const fs = require('fs');
const content = fs.readFileSync('api/auth.py', 'utf8');
const found = [];
for (const line of content.split('\n')) {
  if (line.includes('Password Reset')) {
    found.push(JSON.stringify(line));
  }
}
console.log('matches:', found.length);
found.forEach(l => console.log(l));
