// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Uncomment this line to use console.log
// import "hardhat/console.sol";

contract ProductTrace {
    address public immutable owner;

    // --- Custom Errors ---
    error ProductTrace__NotOwner();
    error ProductTrace__NotAuthorizedProducer();
    error ProductTrace__ZeroAddressNotAllowed();
    error ProductTrace__BatchNotStarted();
    error ProductTrace__BatchAlreadyPackaged();
    error ProductTrace__BatchDoesNotExist();
    error ProductTrace__RawMaterialDoesNotExist(); // Added for getFullTrace robustness

    // --- Events ---
    event ProducerAdded(address indexed producerAddress);
    event RawMaterialAdded(uint indexed materialId, address indexed producer, string source, uint quantity);
    event ProductionStarted(uint indexed batchId, address indexed producer, uint[] rawMaterialIds);
    event ProductPackaged(uint indexed batchId, address indexed producer, string halalCertHash);

    constructor() {
        owner = msg.sender;
        producers[msg.sender] = true;
        emit ProducerAdded(msg.sender);
    }

    mapping(address => bool) public producers;

    uint public rawMaterialCount;
    uint public batchCount;

    struct RawMaterial {
        uint id; // Corresponds to the mapping key
        string source; // Source of the raw material
        string quality;
        uint quantity;
        string pickupTimeManual; // Manually entered pickup time, e.g., "DD/MM/YYYY"
        uint timestampAdded; // Blockchain timestamp when added
        address producer; // Address of the producer who added this material
    }

    struct ProductionBatch {
        uint id; // Corresponds to the mapping key
        uint[] rawMaterialIds;
        uint startTime;
        uint packagingTime;
        string halalCertHash;
        string startTimeManual; // New field for detailed start time (e.g., "10:21, 14/05/2025")
        string packagingTimeManual; // New field for detailed packaging time (e.g., "17:10, 14/05/2025")
    }

    mapping(uint => RawMaterial) public rawMaterials;
    mapping(uint => ProductionBatch) public batches;

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

    // --- Owner Functions ---
    function addProducer(address _prod) public onlyOwner {
        if (_prod == address(0)) {
            revert ProductTrace__ZeroAddressNotAllowed();
        }
        producers[_prod] = true;
        emit ProducerAdded(_prod);
    }

    // --- Producer Functions ---
    // INPUT BAHAN BAKU
    function inputRawMaterial(string memory _source, string memory _quality, uint _quantity, string memory _pickupTimeManual) public onlyProducer returns (uint) {
        rawMaterialCount++;
        rawMaterials[rawMaterialCount] = RawMaterial({
            id: rawMaterialCount,
            source: _source,
            quality: _quality,
            quantity: _quantity,
            pickupTimeManual: _pickupTimeManual,
            timestampAdded: block.timestamp,
            producer: msg.sender
        });
        emit RawMaterialAdded(rawMaterialCount, msg.sender, _source, _quantity);
        return rawMaterialCount;
    }

    // MULAI PRODUKSI
    function startProduction(uint[] memory _rawMaterialIds, string memory _startTimeManual) public onlyProducer returns (uint) {
        // Optional: Check if raw material IDs exist
        for (uint i = 0; i < _rawMaterialIds.length; i++) {
            if (rawMaterials[_rawMaterialIds[i]].id == 0) {
                 revert ProductTrace__RawMaterialDoesNotExist();
            }
        }

        batchCount++;
        batches[batchCount] = ProductionBatch({
            id: batchCount,
            rawMaterialIds: _rawMaterialIds,
            startTime: block.timestamp,
            packagingTime: 0,
            halalCertHash: "",
            startTimeManual: _startTimeManual,
            packagingTimeManual: ""
        });
        emit ProductionStarted(batchCount, msg.sender, _rawMaterialIds);
        return batchCount;
    }

    // INPUT PENGEMASAN
    function packageProduct(uint batchId, string memory _halalCertHash, string memory _packagingTimeManual) public onlyProducer {
        ProductionBatch storage batch = batches[batchId];
        if (batch.id == 0) { // Check if batch exists (assuming id is never 0 for a valid batch)
            revert ProductTrace__BatchDoesNotExist();
        }
        if (batch.startTime == 0) { // Should not happen if batch.id != 0 and batch was created by startProduction
            revert ProductTrace__BatchNotStarted(); // Or a more specific error like "BatchCorrupted"
        }
        if (batch.packagingTime != 0) {
            revert ProductTrace__BatchAlreadyPackaged();
        }

        batch.packagingTime = block.timestamp;
        batch.halalCertHash = _halalCertHash;
        batch.packagingTimeManual = _packagingTimeManual;
        emit ProductPackaged(batchId, msg.sender, _halalCertHash);
    }

    // GETTER: DETAIL UNTUK QR KONSUMEN
    function getFullTrace(uint batchId) public view returns (
        uint[] memory bahanIds,
        string[] memory sumber,
        string[] memory kualitas,
        string[] memory waktuManual,
        uint waktuProduksi,
        uint waktuKemas,
        string memory halalHash,
        string memory waktuProduksiManual,
        string memory waktuKemasManual
    ) {
        ProductionBatch memory b = batches[batchId];
        if (b.id == 0) { // Check if batch exists
            revert ProductTrace__BatchDoesNotExist();
        }

        uint len = b.rawMaterialIds.length;
        bahanIds = new uint[](len);
        sumber = new string[](len);
        kualitas = new string[](len);
        waktuManual = new string[](len);

        for (uint i = 0; i < len; i++) {
            uint rid = b.rawMaterialIds[i];
            if (rawMaterials[rid].id == 0) {
                revert ProductTrace__RawMaterialDoesNotExist();
            }
            RawMaterial memory rm = rawMaterials[rid];
            bahanIds[i] = rm.id;
            sumber[i] = rm.source;
            kualitas[i] = rm.quality;
            waktuManual[i] = rm.pickupTimeManual;
        }

        return (
            bahanIds,
            sumber,
            kualitas,
            waktuManual,
            b.startTime,
            b.packagingTime,
            b.halalCertHash,
            b.startTimeManual,
            b.packagingTimeManual
        );
    }
}
