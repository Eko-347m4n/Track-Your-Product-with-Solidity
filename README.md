# Product Traceability PoA (Proof of Authority / Concept)

This project is a blockchain-based system designed for tracking products through various stages of their lifecycle, from raw material sourcing to final distribution. It aims to provide enhanced transparency, immutability, and accountability in the supply chain.

## Features

*   **Producer Management:**
    *   Contract owner can add and remove authorized producer addresses.
    *   Role-based access control: Only authorized producers can initiate product creation and other key actions.
*   **Product Lifecycle Tracking:**
    *   **Create Product (Raw Material):** Authorized producers can register new products, specifying details like name, source, quality, initial quantity, and pickup time. Products start in the `RAW_MATERIAL` stage.
    *   **Start Production:** The owner of a product (initially the creating producer) can start its production. This process consumes specified quantities of other raw material products and creates a new batch associated with the main product. The main product's stage changes to `PRODUCTION`.
    *   **Package Product:** The product owner can mark a product batch as packaged, adding details like Halal and BPOM certification hashes (or other relevant certifications) and manual packaging time. The product's stage changes to `PACKAGING`.
    *   **Distribute Product:** The product owner can record distribution details for a packaged product, marking its stage as `DISTRIBUTION`.
*   **Comprehensive Traceability:**
    *   `getFullTrace(productId)`: Retrieve a detailed history of a specific product, including its current stage, ownership, batch information (consumed materials, quantities, production/packaging times, certifications), and distribution details.
    *   `getAllProducts()`: View a list of all products registered in the system.
*   **Event-Driven Architecture:** The smart contract emits events for significant actions (e.g., `ProductCreated`, `ProducerAdded`, `ProductStageChanged`, `BatchCreated`), allowing for off-chain services to listen and react.
*   **Data Integrity:** Utilizes custom error messages for clear and specific revert reasons (e.g., `ProductTrace__NotOwner`, `ProductTrace__InvalidProductStage`).

## Technology Stack

*   **Smart Contracts:**
    *   Solidity (Programming Language)
    *   Hardhat (Development Environment, Testing, Deployment)
        *   `@nomicfoundation/hardhat-toolbox`
        *   `@nomicfoundation/hardhat-chai-matchers`
        *   `ethers.js` (via Hardhat)
*   **Frontend (UI):**
    *   React.js (JavaScript Library for UI)
    *   Vite (Build Tool & Dev Server)
    *   `ethers.js` (for blockchain interaction from the client-side - *assumed*)
*   **Testing:**
    *   Chai (Assertion Library)
    *   Mocha (Test Runner - via Hardhat)

## Project Structure

```
Tracker PoA/
├── contracts/
│   ├── ProductTrace.sol  # Main smart contract for product traceability
│   └── Lock.sol          # Example/Utility contract (from Hardhat template)
├── test/
│   ├── ProductTrace.test.js # Comprehensive tests for ProductTrace.sol
│   └── Lock.js              # Tests for Lock.sol
├── scripts/
│   └── deploy.js         # (Assumed) Deployment script for contracts
├── product-trace-ui/
│   ├── src/
│   │   ├── App.jsx       # Main React application component
│   │   └── main.jsx      # React application entry point
│   ├── index.html
│   ├── package.json
│   └── vite.config.js    # (Likely) Vite configuration
├── hardhat.config.js     # Hardhat configuration
├── package.json
└── README.md
```

## Prerequisites

*   Node.js (v18.x or later recommended)
*   npm or yarn

## Setup and Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd "Tracker PoA"
    ```

2.  **Install Hardhat project dependencies:**
    (In the project root directory: `Tracker PoA/`)
    ```bash
    npm install
    # or
    yarn install
    ```

3.  **Install Frontend UI dependencies:**
    ```bash
    cd product-trace-ui
    npm install
    # or
    yarn install
    cd ..
    ```

## Running the Project

### 1. Smart Contracts

*   **Compile Contracts:**
    ```bash
    npx hardhat compile
    ```

*   **Run Tests:**
    ```bash
    npx hardhat test
    ```
    To run tests for a specific contract:
    ```bash
    npx hardhat test test/ProductTrace.test.js
    ```

*   **Deploy to a Local Hardhat Network:**
    1.  **Start a local Hardhat node:**
        Open a new terminal in the project root and run:
        ```bash
        npx hardhat node
        ```
        This will start a local Ethereum node and provide you with several test accounts.

    2.  **Deploy the `ProductTrace` contract:**
        Open another terminal in the project root. If you have a deployment script (e.g., `scripts/deploy.js`), run:
        ```bash
        npx hardhat run scripts/deploy.js --network localhost
        ```
        *(Note: You might need to create or adjust `scripts/deploy.js` to deploy `ProductTrace.sol` and log its address.)*

        A simple `scripts/deploy.js` might look like:
        ```javascript
        // scripts/deploy.js
        async function main() {
          const [deployer] = await ethers.getSigners();
          console.log("Deploying contracts with the account:", deployer.address);

          const ProductTrace = await ethers.getContractFactory("ProductTrace");
          const productTrace = await ProductTrace.deploy();
          await productTrace.waitForDeployment();

          console.log("ProductTrace deployed to:", await productTrace.getAddress());
        }

        main()
          .then(() => process.exit(0))
          .catch((error) => {
            console.error(error);
            process.exit(1);
          });
        ```

### 2. Frontend UI

1.  **Configure Contract Address:**
    After deploying the `ProductTrace` contract, you'll get its address. You'll need to configure this address in your frontend application (e.g., in a config file or environment variable) so it can interact with the deployed contract.

2.  **Start the UI Development Server:**
    ```bash
    cd product-trace-ui
    npm run dev
    # or
    yarn dev
    ```

3.  Open your browser and navigate to `http://localhost:5173` (or the port specified by Vite).

## Smart Contract Overview: `ProductTrace.sol`

*   **Purpose:** Manages the lifecycle and traceability of products through various stages.
*   **Key Entities & Stages:**
    *   **Producers:** Addresses authorized to create products and perform certain actions. The contract deployer is a producer by default.
    *   **Products:** Represent items being tracked. Each product has an owner, stage, and various attributes.
    *   **Batches:** Created during the `PRODUCTION` stage, linking a main product to the raw materials consumed. Batches also store packaging and certification details.
    *   **Stages (enum `ProductStage`):**
        *   `NOT_STARTED` (0) - Default, though products are typically created directly into `RAW_MATERIAL`.
        *   `RAW_MATERIAL` (1) - Initial stage for new products.
        *   `PRODUCTION` (2) - Product is undergoing a manufacturing/assembly process.
        *   `PACKAGING` (3) - Product has been packaged and certified.
        *   `DISTRIBUTION` (4) - Product has been shipped/distributed.
*   **Core Modifiers:**
    *   `onlyOwner`: Restricts function access to the contract deployer/owner.
    *   `onlyProducer`: Restricts function access to registered producers.
    *   `onlyProductOwner(uint256 productId)`: Restricts function access to the current owner of the specified product.
*   **Key Functions (see `ProductTrace.test.js` for detailed interactions):**
    *   `addProducer(address _producer)`
    *   `removeProducer(address _producer)`
    *   `createProduct(string name, string source, string quality, uint256 initialQuantity, string pickupTimeManual)`
    *   `startProduction(uint256 _productId, uint256[] consumedProductIds, uint256[] quantitiesUsed, string startTimeManual)`
    *   `packageProduct(uint256 _productId, string halalCertHash, string bpomCertHash, string packagingTimeManual)`
    *   `distributeProduct(uint256 _productId, string distributionDetails)`
    *   `getFullTrace(uint256 _productId)`
    *   `getAllProducts()`
*   **Key Events:**
    *   `ProducerAdded(address indexed producerAddress)`
    *   `ProducerRemoved(address indexed producerAddress)`
    *   `ProductCreated(uint256 indexed productId, string name, address indexed productOwner, ProductStage initialStage, uint256 timestamp)`
    *   `ProductStageChanged(uint256 indexed productId, ProductStage oldStage, ProductStage newStage, address indexed changedBy, uint256 timestamp)`
    *   `ProductQuantityUpdated(uint256 indexed productId, uint256 quantityUsed, uint256 newAvailableQuantity, uint256 timestamp)`
    *   `BatchCreated(uint256 indexed batchId, uint256 indexed productId, address indexed createdBy, uint256[] consumedProductIds, uint256[] quantitiesUsed, uint256 timestamp)`
    *   `BatchPackaged(uint256 indexed batchId, uint256 indexed productId, address indexed packagedBy, string halalCertHash, string bpomCertHash, uint256 timestamp)`

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues.

## License

(Specify your license here, e.g., MIT, Apache 2.0, or leave blank if not yet decided.)