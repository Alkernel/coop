const fs = require('fs');
const path = 'C:/Users/erikk/Desktop/Coop/vercel.json';
const content = fs.readFileSync(path, 'utf8');
const clean = content.replace(/^\uFEFF/, '');
fs.writeFileSync(path, clean, 'utf8');
console.log('BOM removed from vercel.json');
console.log('Content:', clean);
