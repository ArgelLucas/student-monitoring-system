import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const source = path.resolve('src');
const files=[];
function visit(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){
  const f=path.join(dir,item.name); if(item.isDirectory())visit(f); else if(/\.(js|jsx)$/.test(item.name))files.push(f);
}}
visit(source);
for(const f of files){
  const code=fs.readFileSync(f,'utf8');
  if(f.endsWith('.js'))execFileSync(process.execPath,['--check',f],{stdio:'pipe'});
  for(const result of code.matchAll(/(?:from\s*|import\s*)['"](\.{1,2}\/[^'"]+)['"]/g)){
    const relative=result[1];const target=path.resolve(path.dirname(f),relative);
    const candidates=[target,target+'.js',target+'.jsx',path.join(target,'index.js'),path.join(target,'index.jsx')];
    if(!candidates.some(f=>fs.existsSync(f)))throw Error(`Missing relative import in ${f}: ${relative}`);
  }
}
console.log(`Checked ${files.length} JavaScript/React source files and their relative imports.`);
console.log('JSX compilation will be validated by npm run build after installing dependencies.');
