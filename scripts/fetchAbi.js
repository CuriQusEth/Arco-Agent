import fetch from 'node-fetch';

async function main() {
    try {
        const res = await fetch('https://testnet.arcscan.app/api?module=contract&action=getabi&address=0x8004B663056A597Dffe9eCcC1965A193B7388713');
        const json = await res.json();
        console.log(json.result);
    } catch(e) {
        console.error(e);
    }
}
main();
