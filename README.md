# Product Traceability - Proof of Authority (PoA) Tracker

This project implements a smart contract-based system for tracking products through their supply chain, from raw materials to packaged goods. It's designed with a Proof of Authority (PoA) mindset where authorized producers are responsible for inputting data at various stages.

## Description

The core of the project is the `ProductTrace.sol` smart contract, which allows for:
*   Registering authorized producers.
*   Recording the input of raw materials with details like source, quality, quantity, and pickup time.
*   Starting production batches, linking them to specific raw materials.
*   Marking production batches as packaged, including a Halal certification hash and packaging time.
*   Retrieving a full trace of a product batch, detailing all associated raw materials and production/packaging timestamps.

This system aims to provide transparency and verifiability in the supply chain.

## Features

*   **Producer Management**: Owner can add new producers who are authorized to input data.
*   **Raw Material Logging**: Producers can log detailed information about raw materials.
*   **Production Batch Tracking**: Producers can initiate production batches, linking multiple raw materials.
*   **Product Packaging**: Producers can mark batches as packaged, adding final details like Halal certification.
*   **Full Traceability**: Anyone can retrieve the complete history of a product batch using its ID.
*   **Event-Driven**: Emits events for significant actions (e.g., `ProducerAdded`, `RawMaterialAdded`, `ProductionStarted`, `ProductPackaged`).
*   **Custom Errors**: Uses custom errors for clearer and more gas-efficient error handling.
*   **Ownership**: Contract has an owner with special privileges (e.g., adding producers).

## Contract Overview (`ProductTrace.sol`)

### Key Functionalities

*   `addProducer(address _prod)`: Allows the owner to authorize a new producer.
*   `inputRawMaterial(string memory _source, string memory _quality, uint _quantity, string memory _pickupTimeManual)`: Allows an authorized producer to add a new raw material.
*   `startProduction(uint[] memory _rawMaterialIds, string memory _startTimeManual)`: Allows an authorized producer to start a new production batch, linking it to existing raw materials.
*   `packageProduct(uint batchId, string memory _halalCertHash, string memory _packagingTimeManual)`: Allows an authorized producer to mark a production batch as packaged.
*   `getFullTrace(uint batchId)`: A public view function to retrieve all traceability information for a given batch ID.

### State Variables & Structs

*   `owner`: The immutable address of the contract deployer/owner.
*   `producers`: A mapping `(address => bool)` to track authorized producers.
*   `rawMaterialCount`: Counter for unique raw material IDs.
*   `batchCount`: Counter for unique production batch IDs.
*   `RawMaterial` (struct): Stores details for each raw material (id, source, quality, quantity, pickupTimeManual, timestampAdded, producer).
*   `ProductionBatch` (struct): Stores details for each production batch (id, rawMaterialIds, startTime, packagingTime, halalCertHash, startTimeManual, packagingTimeManual).
*   `rawMaterials`: Mapping `(uint => RawMaterial)` storing raw material data.
*   `batches`: Mapping `(uint => ProductionBatch)` storing production batch data.

### Events

*   `ProducerAdded(address indexed producerAddress)`
*   `RawMaterialAdded(uint indexed materialId, address indexed producer, string source, uint quantity)`
*   `ProductionStarted(uint indexed batchId, address indexed producer, uint[] rawMaterialIds)`
*   `ProductPackaged(uint indexed batchId, address indexed producer, string halalCertHash)`

### Custom Errors

*   `ProductTrace__NotOwner()`
*   `ProductTrace__NotAuthorizedProducer()`
*   `ProductTrace__ZeroAddressNotAllowed()`
*   `ProductTrace__BatchNotStarted()`
*   `ProductTrace__BatchAlreadyPackaged()`
*   `ProductTrace__BatchDoesNotExist()`
*   `ProductTrace__RawMaterialDoesNotExist()`

## Getting Started

### Prerequisites

*   Node.js (v18.x or later recommended)
*   npm (usually comes with Node.js) or yarn
*   Hardhat (will be installed as a project dependency)

### Installation

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd Tracker-PoA 
    ```

2.  **Install dependencies:**
    Using npm:
    ```bash
    npm install
    ```
    Or using yarn:
    ```bash
    yarn install
    ```

## Usage

This project uses Hardhat as the development environment.

### Compile Contracts

To compile the smart contracts:
```bash
npx hardhat compile
```
This will generate ABI files and typechain typings in the `artifacts` and `typechain-types` directories, respectively.

### Running Tests

The project includes unit tests for the `ProductTrace.sol` contract located in `test/ProductTrace.test.js`.

To run the tests:
```bash
npx hardhat test
```

### Deploying the Contract

**1. Local Hardhat Network:**

Hardhat comes with a built-in local Ethereum network for development. You can deploy your contract to this network.

Create a deployment script in the `scripts/` directory (e.g., `scripts/deploy.js`):
```javascript
// scripts/deploy.js
async function main() {
  const ProductTrace = await ethers.getContractFactory("ProductTrace");
  console.log("Deploying ProductTrace...");
  const productTrace = await ProductTrace.deploy();
  await productTrace.waitForDeployment();
  console.log("ProductTrace deployed to:", await productTrace.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
```
Then run the script:
```bash
npx hardhat run scripts/deploy.js --network localhost 
```

**2. Other Networks (Testnets/Mainnet):**

To deploy to public testnets (e.g., Sepolia) or mainnet, you'll need to:
1.  Configure network details (RPC URL, private key for deployment account) in `hardhat.config.js`.
2.  Ensure your deployment account has enough native currency (ETH) to pay for gas.
3.  Run the deployment script specifying the target network: `npx hardhat run scripts/deploy.js --network <networkName>`

## License

This project is licensed under the MIT License. See the SPDX license identifier in `ProductTrace.sol`.