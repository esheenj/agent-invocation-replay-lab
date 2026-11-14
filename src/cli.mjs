#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {replay} from './replay.mjs';
const file=process.argv[2];
if(!file){console.error('Usage: node src/cli.mjs scenario.json');process.exit(1);}
try{
 const input=await readFile(file,'utf8');
 if(input.length>1048576)throw Error('Input exceeds 1 MiB.');
 const result=replay(input);
 console.log(JSON.stringify(result,null,2));
}catch(err){console.error('Invalid scenario: '+err.message);process.exitCode=1;}
