import { Langfuse } from 'langfuse';
const l = new Langfuse();
const g = l.trace({name: 'test'}).generation({name: 'test'});
g.end({ level: "ERROR", statusMessage: "boom" });
