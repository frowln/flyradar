// A pause the viewer can follow: Maestro itself has no sleep. MS comes from the flow.
var until = new Date().getTime() + Number(MS || 1500);
while (new Date().getTime() < until) {}
