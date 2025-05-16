// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ProductTrace {
    address public owner;

    constructor() {
        owner = msg.sender;
        producers[msg.sender] = true;
    }

    modifier onlyProducer() {
        require(producers[msg.sender], "Not authorized");
        _;
    }

    mapping(address => bool) public producers;

    function addProducer(address prod) public {
        require(msg.sender == owner, "Only owner");
        producers[prod] = true;
    }

    uint public rawMaterialCount;
    uint public batchCount;

    struct RawMaterial {
        uint id;
        string source;
        string quality;
        uint quantity;
        string pickupTimeManual; // DD/MM/YYYY input
        uint timestampAdded;
        address producer;
    }

    struct ProductionBatch {
        uint id;
        uint[] rawMaterialIds;
        uint startTime;
        uint packagingTime;
        string halalCertHash;
        string startTimeManual; // New field for detailed start time (e.g., "10:21, 14/05/2025")
        string packagingTimeManual; // New field for detailed packaging time (e.g., "17:10, 14/05/2025")
    }

    mapping(uint => RawMaterial) public rawMaterials;
    mapping(uint => ProductionBatch) public batches;

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
        return rawMaterialCount;
    }

    // MULAI PRODUKSI
    function startProduction(uint[] memory _rawMaterialIds, string memory _startTimeManual) public onlyProducer returns (uint) {
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
        return batchCount;
    }

    // INPUT PENGEMASAN
    function packageProduct(uint batchId, string memory _halalCertHash, string memory _packagingTimeManual) public onlyProducer {
        require(batches[batchId].startTime != 0, "Batch not started");
        batches[batchId].packagingTime = block.timestamp;
        batches[batchId].halalCertHash = _halalCertHash;
        batches[batchId].packagingTimeManual = _packagingTimeManual;
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
        uint len = b.rawMaterialIds.length;
        bahanIds = new uint[](len);
        sumber = new string[](len);
        kualitas = new string[](len);
        waktuManual = new string[](len);

        for (uint i = 0; i < len; i++) {
            uint rid = b.rawMaterialIds[i];
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
