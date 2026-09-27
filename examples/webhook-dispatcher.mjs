// Compatibility exports for offline examples. The active dispatcher belongs to
// the local worker; never launch a second standalone delivery process.
import {pathToFileURL} from 'node:url';
export {sign,isPublicIPv4} from '../local/webhooks.mjs';
export async function dispatch(){throw Error('Use the managed local worker after approving webhook activation.');}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)dispatch().catch(()=>{console.error('Standalone delivery is disabled. See docs/webhooks-local.md.');process.exitCode=1;});
