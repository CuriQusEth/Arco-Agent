async function run() {
const rep = await fetch('https://testnet.arcscan.app/api?module=contract&action=getabi&address=0x16e0fa7f7c56b9a767e34b192b51f921be31da34').then(r=>r.json());
const val = await fetch('https://testnet.arcscan.app/api?module=contract&action=getabi&address=0xdb31f5d9167f8ebc8b30fbbf814c4d297c2d7f99').then(r=>r.json());
const abirep = JSON.parse(rep.result);
const abival = JSON.parse(val.result);

const repFns = abirep.filter(x => x.type === 'event' || (x.type === 'function' && x.stateMutability === 'view')).map(x => x.name + '(' + x.inputs?.map(y=>y.type + ' ' + (y.indexed ? 'indexed ' : '') + y.name).join(', ') + ')');
console.log('REPUTATION:');
console.log(repFns.join('\n'));

const valFns = abival.filter(x => x.type === 'event' || (x.type === 'function' && x.stateMutability === 'view')).map(x => x.name + '(' + x.inputs?.map(y=>y.type + ' ' + (y.indexed ? 'indexed ' : '') + y.name).join(', ') + ')');
console.log('\nVALIDATION:');
console.log(valFns.join('\n'));
}
run();
