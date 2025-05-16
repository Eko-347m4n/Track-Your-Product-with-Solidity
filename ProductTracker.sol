// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

contract ProductTrackerWithRoles {
    address public owner;

    constructor() {
        owner = msg.sender;
        authorizedProducers[msg.sender] = true;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Bukan pemilik kontrak");
        _;
    }

    modifier onlyProducer() {
        require(authorizedProducers[msg.sender], "Hanya produsen yang diizinkan");
        _;
    }

    mapping(address => bool) public authorizedProducers;

    // Role Management
    function addProducer(address producer) public onlyOwner {
        authorizedProducers[producer] = true;
    }

    function removeProducer(address producer) public onlyOwner {
        authorizedProducers[producer] = false;
    }

    // Counters
    uint public rawMaterialCount;
    uint public productionCount;
    uint public distributionCount;

    struct RawMaterial {
        uint id;
        string source;
        string quality;
        uint timestampCollected;
        address supplier;
    }

    struct Production {
        uint id;
        uint rawMaterialId;
        uint startTime;
        uint packagingTime;
        string halalCertHash;
        uint expiryDate;
        address producer;
    }

    struct Distribution {
        uint id;
        uint productionId;
        uint entryToOutlet;
        uint exitFromOutlet;
        address outlet;
    }

    mapping(uint => RawMaterial) public rawMaterials;
    mapping(uint => Production) public productions;
    mapping(uint => Distribution) public distributions;

    // --- FUNGSI 1: Input Bahan Baku ---
    function inputRawMaterial(
        string memory _source,
        string memory _quality,
        uint _timestampCollected
    ) public returns (uint) {
        require(_timestampCollected <= block.timestamp, "Waktu pengambilan tidak valid (masa depan)");
        rawMaterialCount++;
        rawMaterials[rawMaterialCount] = RawMaterial(
            rawMaterialCount,
            _source,
            _quality,
            _timestampCollected,
            msg.sender
        );
        return rawMaterialCount;
    }

    // --- FUNGSI 2: Input Produksi (Hanya Produsen) ---
    function inputProduction(
        uint _rawMaterialId,
        uint _startTime,
        uint _packagingTime,
        string memory _halalCertHash,
        uint _expiryDate
    ) public onlyProducer returns (uint) {
        require(_rawMaterialId > 0 && _rawMaterialId <= rawMaterialCount, "ID bahan baku tidak ditemukan");
        RawMaterial memory rm = rawMaterials[_rawMaterialId];
        require(_startTime >= rm.timestampCollected + 1 hours, "Produksi terlalu cepat setelah bahan baku");
        require(_packagingTime >= _startTime, "Waktu pengemasan harus setelah produksi");

        productionCount++;
        productions[productionCount] = Production(
            productionCount,
            _rawMaterialId,
            _startTime,
            _packagingTime,
            _halalCertHash,
            _expiryDate,
            msg.sender
        );
        return productionCount;
    }

    // --- FUNGSI 3: Input Distribusi (Hanya Produsen) ---
    function inputDistribution(
        uint _productionId,
        uint _entryToOutlet,
        uint _exitFromOutlet
    ) public onlyProducer returns (uint) {
        require(_productionId > 0 && _productionId <= productionCount, "ID produksi tidak ditemukan");
        Production memory p = productions[_productionId];
        require(_entryToOutlet >= p.packagingTime + 1 hours, "Distribusi terlalu cepat setelah pengemasan");
        require(_exitFromOutlet >= _entryToOutlet, "Keluar outlet harus setelah masuk");

        distributionCount++;
        distributions[distributionCount] = Distribution(
            distributionCount,
            _productionId,
            _entryToOutlet,
            _exitFromOutlet,
            msg.sender
        );
        return distributionCount;
    }

    // --- GETTER HUMAN-READABLE ---
    function getProductDetail(uint _distributionId)
        public
        view
        returns (
            string memory bahanBakuAsal,
            string memory kualitas,
            string memory produsen,
            uint waktuAmbil,
            uint produksiMulai,
            uint dikemas,
            string memory sertifikatHalalHash,
            uint kadaluarsa,
            uint masukOutlet,
            uint keluarOutlet
        )
    {
        require(_distributionId > 0 && _distributionId <= distributionCount, "Distribusi tidak ditemukan");

        Distribution memory d = distributions[_distributionId];
        Production memory p = productions[d.productionId];
        RawMaterial memory r = rawMaterials[p.rawMaterialId];

        return (
            r.source,
            r.quality,
            addressToString(p.producer),
            r.timestampCollected,
            p.startTime,
            p.packagingTime,
            p.halalCertHash,
            p.expiryDate,
            d.entryToOutlet,
            d.exitFromOutlet
        );
    }

    // --- QR DATA GENERATOR (Off-chain manual) ---
    function generateQRString(uint _distributionId) public view returns (string memory) {
        require(_distributionId > 0 && _distributionId <= distributionCount, "Distribusi tidak ditemukan");
        Distribution memory d = distributions[_distributionId];
        Production memory p = productions[d.productionId];
        RawMaterial memory r = rawMaterials[p.rawMaterialId];

        return string(
            abi.encodePacked(
                "Asal: ", r.source,
                "; Kualitas: ", r.quality,
                "; Diambil: ", uintToString(r.timestampCollected),
                "; Produksi: ", uintToString(p.startTime),
                "; Kemas: ", uintToString(p.packagingTime),
                "; Kadaluarsa: ", uintToString(p.expiryDate),
                "; Masuk Outlet: ", uintToString(d.entryToOutlet),
                "; Dibeli: ", uintToString(d.exitFromOutlet)
            )
        );
    }

    // --- Utilities (address to string, uint to string) ---
    function addressToString(address _addr) internal pure returns (string memory) {
        bytes32 value = bytes32(uint256(uint160(_addr)));
        bytes memory alphabet = "0123456789abcdef";
        bytes memory str = new bytes(42);
        str[0] = '0';
        str[1] = 'x';
        for (uint i = 0; i < 20; i++) {
            str[2+i*2] = alphabet[uint(uint8(value[i + 12] >> 4))];
            str[3+i*2] = alphabet[uint(uint8(value[i + 12] & 0x0f))];
        }
        return string(str);
    }

    function uintToString(uint v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint j = v;
        uint length;
        while (j != 0) {
            length++;
            j /= 10;
        }
        bytes memory bstr = new bytes(length);
        uint k = length;
        while (v != 0) {
            k = k - 1;
            bstr[k] = bytes1(uint8(48 + v % 10));
            v /= 10;
        }
        return string(bstr);
    }
}
