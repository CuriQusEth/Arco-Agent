async function run() {
const rep = await fetch('https://testnet.arcscan.app/api?module=contract&action=getabi&address=0x16e0fa7f7c56b9a767e34b192b51f921be31da34').then(r=>r.json());
const abirep = JSON.parse(rep.result);
const repFns = abirep.filter(x => x.name === 'giveFeedback').map(x => x.name + '(' + x.inputs?.map(y=>y.type + ' ' + (y.indexed ? 'indexed ' : '') + y.name).join(', ') + ')');
console.log(repFns.join('\n'));
}
run();
