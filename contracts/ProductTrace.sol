// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Uncomment this line to use console.log
// import "hardhat/console.sol";

contract ProductTrace {
    address public immutable owner;

    // --- Custom Errors ---
    // General
    error ProductTrace__NotOwner();
    error ProductTrace__NotAuthorizedProducer();
    error ProductTrace__ZeroAddressNotAllowed();
    error ProductTrace__ArrayLengthMismatch();
    error ProductTrace__ZeroQuantityNotAllowed();

    // Product Specific
    error ProductTrace__ProductNotFound();
    error ProductTrace__NotProductOwner();
    error ProductTrace__InvalidProductStage(uint productId, Stage currentStage, Stage requiredStage);
    error ProductTrace__InsufficientProductQuantity(uint productId, uint requested, uint available);
    error ProductTrace__ProductAlreadyUsedAsInput(); // If a product instance can only be consumed once

    // Batch Specific
    error ProductTrace__BatchNotFound();
    error ProductTrace__BatchNotStarted(); // Retained if direct batch manipulation implies a start
    error ProductTrace__BatchAlreadyPackaged();
    error ProductTrace__NoInputsForProduction();

    // --- Events ---
    event ProducerAdded(address indexed producerAddress);
    event ProducerRemoved(address indexed producerAddress);

    // Product Lifecycle Events
    event ProductCreated(uint indexed productId, string name, address indexed productOwner, Stage initialStage, uint timestamp);
    event ProductStageChanged(uint indexed productId, Stage oldStage, Stage newStage, address indexed changedBy, uint timestamp);
    event ProductQuantityUpdated(uint indexed productId, uint quantityUsedOrReduced, uint newAvailableQuantity, uint timestamp);

    // Batch Lifecycle Events (linked to a Product)
    event BatchCreated(uint indexed batchId, uint indexed productId, address indexed createdBy, uint[] consumedProductIds, uint[] quantitiesUsed, uint timestamp);
    event BatchPackaged(uint indexed batchId, uint indexed productId, address indexed packagedBy, string halalCertHash, string bpomCertHash, uint timestamp);

    // --- Enums ---
    enum Stage {
        NotStarted, // Default, or for products initiated but not yet defined as raw material
        RawMaterial, // Product is defined and available as a raw material
        Production,  // Product is currently undergoing production
        Packaging,   // Product has been produced and is being packaged
        Distribution // Product is packaged and ready for/in distribution
    }

    // --- Structs ---
    struct Product {
        uint id;
        string name; // e.g., "Organic Apples Batch A123", "Finished Juice Batch B789"
        string source; // Source, relevant if it's a raw material
        string quality; // Quality, relevant if it's a raw material
        uint initialQuantity; // Initial quantity when created as RawMaterial
        uint availableQuantity; // Current available quantity (can be consumed)
        string pickupTimeManual; // Manual pickup time, relevant for raw materials
        Stage stage;
        uint timestamp; // Timestamp of the last stage change or creation
        address productOwner; // The producer who created/owns this product instance
        uint currentBatchId; // If in Production/Packaging, links to the active batch
        string distributionDetails; // Details for the distribution stage
    }

    constructor() {
        owner = msg.sender;
        producers[msg.sender] = true;
        emit ProducerAdded(msg.sender);
    }

    struct ProductionBatch {
        uint id; // Corresponds to the mapping key
        uint[] rawMaterialIds;
        uint[] quantitiesUsed;
        uint startTime;
        uint packagingTime;
        string halalCertHash;
        string bpomCertHash; // New field for BPOM certificate hash
        string startTimeManual; // New field for detailed start time (e.g., "10:21, 14/05/2025")
        string packagingTimeManual; // New field for detailed packaging time (e.g., "17:10, 14/05/2025")
    }

    struct FullTraceDetails {
        // Product Details
        uint productId;
        string productName;
        string productSource; // if applicable (e.g. initial raw material)
        string productQuality; // if applicable
        uint productInitialQuantity;
        uint productAvailableQuantity;
        string productPickupTimeManual; // if applicable
        Stage productStage;
        uint productLastUpdateTimestamp;
        address productOwner;
        string productDistributionDetails;

        // Batch Details (if applicable)
        uint batchId;
        uint[] consumedProductIds; // IDs of products used as raw materials for this batch
        string[] consumedProductNames;
        string[] consumedProductSources;
        uint[] consumedQuantitiesUsed;
        uint batchStartTime;
        uint batchPackagingTime;
        string batchHalalCertHash;
        string batchBpomCertHash;
        string batchStartTimeManual;
        string batchPackagingTimeManual;
    }

    // --- State Variables ---
    mapping(address => bool) public producers;
    mapping(uint => Product) public products;
    mapping(uint => ProductionBatch) public batches;

    uint public productCount;
    uint public batchCount;

    // --- Modifiers ---
    modifier onlyProducer() {
        if (!producers[msg.sender]) {
            revert ProductTrace__NotAuthorizedProducer();
        }
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert ProductTrace__NotOwner();
        }
        _;
    }

    modifier onlyProductOwner(uint _productId) {
        if (products[_productId].id == 0) {
            revert ProductTrace__ProductNotFound();
        }
        if (msg.sender != products[_productId].productOwner) {
            revert ProductTrace__NotProductOwner();
        }
        _;
    }
    // --- Owner Functions ---
    function addProducer(address _prod) public onlyOwner {
        if (_prod == address(0)) {
            revert ProductTrace__ZeroAddressNotAllowed();
        }
        producers[_prod] = true;
        emit ProducerAdded(_prod);
    }

    function removeProducer(address _prod) public onlyOwner {
        if (_prod == address(0)) {
            revert ProductTrace__ZeroAddressNotAllowed();
        }
        if (!producers[_prod]) {
            revert ProductTrace__NotAuthorizedProducer();
        }
        producers[_prod] = false;
        emit ProducerRemoved(_prod);
    }

    // --- Producer Functions ---

    // Step 1: Create a Product (initially as a Raw Material)
    function createProduct(
        string memory _name,
        string memory _source,
        string memory _quality,
        uint _initialQuantity,
        string memory _pickupTimeManual
    ) public onlyProducer returns (uint) {
        if (_initialQuantity == 0) {
            revert ProductTrace__ZeroQuantityNotAllowed();
        }
        productCount++;
        uint newProductId = productCount;

        products[newProductId] = Product({
            id: newProductId,
            name: _name,
            source: _source,
            quality: _quality,
            initialQuantity: _initialQuantity,
            availableQuantity: _initialQuantity,
            pickupTimeManual: _pickupTimeManual,
            stage: Stage.RawMaterial,
            timestamp: block.timestamp,
            productOwner: msg.sender,
            currentBatchId: 0,
            distributionDetails: ""
        });

        emit ProductCreated(newProductId, _name, msg.sender, Stage.RawMaterial, block.timestamp);
        return newProductId;
    }

    // Step 2: Start Production for a Product, consuming other Products (as Raw Materials)
    function startProduction(
        uint _productId,
        uint[] memory _consumedProductIds,
        uint[] memory _quantitiesUsed,
        string memory _startTimeManual
    ) public onlyProductOwner(_productId) returns (uint) {
        Product storage productToProcess = products[_productId];

        if (productToProcess.stage != Stage.RawMaterial) {
            revert ProductTrace__InvalidProductStage(_productId, productToProcess.stage, Stage.RawMaterial);
        }
        if (_consumedProductIds.length != _quantitiesUsed.length) {
            revert ProductTrace__ArrayLengthMismatch();
        }
        if (_consumedProductIds.length == 0) {
            revert ProductTrace__NoInputsForProduction();
        }

        for (uint i = 0; i < _consumedProductIds.length; i++) {
            uint consumedId = _consumedProductIds[i];
            uint quantityToUse = _quantitiesUsed[i];
            Product storage consumedProduct = products[consumedId];

            if (consumedProduct.id == 0) {
                revert ProductTrace__ProductNotFound(); // Consumed product does not exist
            }
            if (consumedProduct.stage != Stage.RawMaterial) {
                // Consumed products must be in RawMaterial stage
                revert ProductTrace__InvalidProductStage(consumedId, consumedProduct.stage, Stage.RawMaterial);
            }
            if (quantityToUse == 0) {
                revert ProductTrace__ZeroQuantityNotAllowed();
            }
            if (quantityToUse > consumedProduct.availableQuantity) {
                revert ProductTrace__InsufficientProductQuantity(consumedId, quantityToUse, consumedProduct.availableQuantity);
            }
            // Update available quantity of consumed product
            consumedProduct.availableQuantity -= quantityToUse;
            emit ProductQuantityUpdated(consumedId, quantityToUse, consumedProduct.availableQuantity, block.timestamp);
        }

        // Create a new batch for this production
        batchCount++;
        uint newBatchId = batchCount;
        batches[newBatchId] = ProductionBatch({
            id: newBatchId,
            rawMaterialIds: _consumedProductIds, // Storing IDs of Products used as raw materials
            quantitiesUsed: _quantitiesUsed,
            startTime: block.timestamp,
            packagingTime: 0,
            halalCertHash: "",
            bpomCertHash: "",
            startTimeManual: _startTimeManual,
            packagingTimeManual: ""
        });

        // Update the main product being processed
        Stage oldStage = productToProcess.stage;
        productToProcess.stage = Stage.Production;
        productToProcess.timestamp = block.timestamp;
        productToProcess.currentBatchId = newBatchId;

        emit BatchCreated(newBatchId, _productId, msg.sender, _consumedProductIds, _quantitiesUsed, block.timestamp);
        emit ProductStageChanged(_productId, oldStage, Stage.Production, msg.sender, block.timestamp);
        return newBatchId;
    }

    // Step 3: Package a Product
    function packageProduct(
        uint _productId,
        string memory _halalCertHash,
        string memory _bpomCertHash,
        string memory _packagingTimeManual
    ) public onlyProductOwner(_productId) {
        Product storage productToPackage = products[_productId];
        if (productToPackage.stage != Stage.Production) {
            revert ProductTrace__InvalidProductStage(_productId, productToPackage.stage, Stage.Production);
        }
        if (productToPackage.currentBatchId == 0) {
            revert ProductTrace__BatchNotFound(); // Should not happen if stage is Production
        }

        ProductionBatch storage batch = batches[productToPackage.currentBatchId];
        if (batch.id == 0) { // Should be redundant due to currentBatchId check on product
            revert ProductTrace__BatchNotFound();
        }
        if (batch.packagingTime != 0) {
            revert ProductTrace__BatchAlreadyPackaged();
        }

        batch.packagingTime = block.timestamp;
        batch.halalCertHash = _halalCertHash;
        batch.bpomCertHash = _bpomCertHash;
        batch.packagingTimeManual = _packagingTimeManual;

        Stage oldStage = productToPackage.stage;
        productToPackage.stage = Stage.Packaging;
        productToPackage.timestamp = block.timestamp;

        emit BatchPackaged(batch.id, _productId, msg.sender, _halalCertHash, _bpomCertHash, block.timestamp);
        emit ProductStageChanged(_productId, oldStage, Stage.Packaging, msg.sender, block.timestamp);
    }

    // Step 4: Distribute a Product
    function distributeProduct(uint _productId, string memory _distributionDetails) public onlyProductOwner(_productId) {
        Product storage productToDistribute = products[_productId];
        if (productToDistribute.stage != Stage.Packaging) {
            revert ProductTrace__InvalidProductStage(_productId, productToDistribute.stage, Stage.Packaging);
        }

        Stage oldStage = productToDistribute.stage;
        productToDistribute.stage = Stage.Distribution;
        productToDistribute.timestamp = block.timestamp;
        productToDistribute.distributionDetails = _distributionDetails;

        emit ProductStageChanged(_productId, oldStage, Stage.Distribution, msg.sender, block.timestamp);
    }

    // --- Getter Functions ---
    function getFullTrace(uint _productId) public view returns (FullTraceDetails memory) {
        Product storage product = products[_productId];
        if (product.id == 0) {
            revert ProductTrace__ProductNotFound();
        }

        FullTraceDetails memory details;

        // Populate Product Details
        details.productId = product.id;
        details.productName = product.name;
        details.productSource = product.source;
        details.productQuality = product.quality;
        details.productInitialQuantity = product.initialQuantity;
        details.productAvailableQuantity = product.availableQuantity;
        details.productPickupTimeManual = product.pickupTimeManual;
        details.productStage = product.stage;
        details.productLastUpdateTimestamp = product.timestamp;
        details.productOwner = product.productOwner;
        details.productDistributionDetails = product.distributionDetails;

        // Populate Batch Details if applicable (Production stage onwards)
        if (product.stage >= Stage.Production && product.currentBatchId != 0) {
            ProductionBatch storage batch = batches[product.currentBatchId];
            if (batch.id == 0) {
                // This case should ideally not be reached if product.currentBatchId is valid
                // but as a safeguard:
                return details; // Return with only product details
            }

            details.batchId = batch.id;
            details.consumedProductIds = batch.rawMaterialIds; // These are now product IDs
            details.consumedQuantitiesUsed = batch.quantitiesUsed;
            details.batchStartTime = batch.startTime;
            details.batchPackagingTime = batch.packagingTime;
            details.batchHalalCertHash = batch.halalCertHash;
            details.batchBpomCertHash = batch.bpomCertHash;
            details.batchStartTimeManual = batch.startTimeManual;
            details.batchPackagingTimeManual = batch.packagingTimeManual;

            uint numConsumed = batch.rawMaterialIds.length;
            details.consumedProductNames = new string[](numConsumed);
            details.consumedProductSources = new string[](numConsumed);

            for (uint i = 0; i < numConsumed; i++) {
                Product storage consumedProduct = products[batch.rawMaterialIds[i]];
                if (consumedProduct.id != 0) {
                    details.consumedProductNames[i] = consumedProduct.name;
                    details.consumedProductSources[i] = consumedProduct.source; // Or other relevant info
                } else {
                    // Handle case where a consumed product ID might be invalid (should be prevented by startProduction logic)
                    details.consumedProductNames[i] = "Error: Product Not Found";
                    details.consumedProductSources[i] = "";
                }
            }
        }
        return details;
    }

    function getBatchRawMaterialIds(uint _batchId) public view returns (uint[] memory) {
        return batches[_batchId].rawMaterialIds;
    }

    function getBatchQuantitiesUsed(uint _batchId) public view returns (uint[] memory) {
        return batches[_batchId].quantitiesUsed;
    }

    function getAllProducts() public view returns (Product[] memory) {
        Product[] memory all = new Product[](productCount);
        for (uint i = 1; i <= productCount; i++) {
            all[i - 1] = products[i];
        }
        return all;
    }
}
