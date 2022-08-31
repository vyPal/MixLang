var x = 12;
console.log("Thank you, so let's get it over with")

console.log("x is now set to "+x)

console.log("I'll add another 12 and send it to you, python\n")

x += 12

;(() => {
const fs = require('fs');
const path = require('path');
let dout = {};
dout['x'] = x;
fs.writeFileSync(path.join(__dirname, 'out.json'), JSON.stringify(dout));
})()