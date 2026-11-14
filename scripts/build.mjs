import {mkdir,rm,copyFile} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});
for(const x of ['index.html','app.mjs','style.css'])await copyFile('site/'+x,'dist/'+x);
await copyFile('src/replay.mjs','dist/replay.mjs');
console.log('Standalone offline website staged in dist/');
