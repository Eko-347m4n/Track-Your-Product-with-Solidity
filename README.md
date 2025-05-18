# Track your product with solidity

Run

`npx hardhat node`

in another terminal run `npx hardhat run scripts/deploy.js --network ()`

after deploy, to intract:
`npx hardhat console --network ()`

## How to intract

### Add produsen

bash `await productTrace.addProducer("0xProdusenAddress")`

### Fetch raw material

bash  `await tracker.rawMaterials(1)`

### Input rawmaterial

bash `await tracker.inputRawMaterial("Desa Cibogo", "Premium", 100, "18/05/2025")`

### Start Production

bash `await tracker.startProduction([1, 2], "10:00, 19/05/2025")`

### Package Product

bash `await tracker.packageProduct(1, "Qm123abc456def", "15:00, 20/05/2025")`

### Get Full Trace

bash 

`const info = await tracker.getFullTrace(1) `

`console.log(info)`

### Fetch batch

bash `await tracker.batches(1)`
