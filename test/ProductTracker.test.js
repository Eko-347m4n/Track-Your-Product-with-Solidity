const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ProductTrace Contract", function () {
  let ProductTrace;
  let productTrace;
  let owner;
  let producer1;
  let producer2;

  beforeEach(async function () {
    [owner, producer1, producer2] = await ethers.getSigners();

    ProductTrace = await ethers.getContractFactory("ProductTrace");
    productTrace = await ProductTrace.deploy();
    // await productTrace.deployed();

    // Add producer1 as authorized producer
    await productTrace.addProducer(producer1.address);
  });

    describe("inputRawMaterial", function () {
        it("should allow authorized producer to input raw material", async function () {
            const source = "Farm A";
            const quality = "High";
            const quantity = 100;
            const pickupTimeManual = "01/06/2024";

            await productTrace.connect(producer1).inputRawMaterial(source, quality, quantity, pickupTimeManual);

            const rawMaterial = await productTrace.rawMaterials(1);
            expect(rawMaterial.id).to.equal(1);
            expect(rawMaterial.source).to.equal(source);
            expect(rawMaterial.quality).to.equal(quality);
            expect(rawMaterial.quantity).to.equal(quantity);
            expect(rawMaterial.pickupTimeManual).to.equal(pickupTimeManual);
            expect(rawMaterial.producer).to.equal(producer1.address);
        });

        it("should revert if non-producer tries to input raw material", async function () {
            await expect(
                productTrace.connect(producer2).inputRawMaterial("Farm B", "Medium", 50, "02/06/2024")
            ).to.be.revertedWith("Not authorized");
        });
    });

  describe("startProduction", function () {
    it("should start a production batch with given raw material IDs", async function () {
      // Input raw materials first
      await productTrace.connect(producer1).inputRawMaterial("Farm A", "High", 100, "01/06/2024");
      await productTrace.connect(producer1).inputRawMaterial("Farm B", "Medium", 50, "02/06/2024");

      const rawMaterialIds = [1, 2];
      const startTimeManual = "10:00, 03/06/2024";

      await productTrace.connect(producer1).startProduction(rawMaterialIds, startTimeManual);

      const batch = await productTrace.batches(1);
      expect(batch.id).to.equal(1);
      const fullTrace = await productTrace.getFullTrace(1);
      expect(fullTrace.bahanIds.length).to.equal(2);
      expect(batch.startTime).to.be.gt(0);
      expect(batch.startTimeManual).to.equal(startTimeManual);
      expect(batch.packagingTime).to.equal(0);
      expect(batch.halalCertHash).to.equal("");
    });

    it("should revert if non-producer tries to start production", async function () {
      await expect(
        productTrace.connect(producer2).startProduction([1], "10:00, 03/06/2024")
      ).to.be.revertedWith("Not authorized");
    });
  });

  describe("packageProduct", function () {
    it("should package a product batch", async function () {
      // Input raw materials and start production first
      await productTrace.connect(producer1).inputRawMaterial("Farm A", "High", 100, "01/06/2024");
      const batchId = await productTrace.connect(producer1).startProduction([1], "10:00, 03/06/2024");

      const halalCertHash = "Qm123abc";
      const packagingTimeManual = "15:00, 04/06/2024";

      await productTrace.connect(producer1).packageProduct(1, halalCertHash, packagingTimeManual);

      const batch = await productTrace.batches(1);
      expect(batch.packagingTime).to.be.gt(0);
      expect(batch.halalCertHash).to.equal(halalCertHash);
      expect(batch.packagingTimeManual).to.equal(packagingTimeManual);
    });

    it("should revert if packaging a batch that has not started", async function () {
      await expect(
        productTrace.connect(producer1).packageProduct(999, "Qm123abc", "15:00, 04/06/2024")
      ).to.be.revertedWith("Batch not started");
    });

    it("should revert if non-producer tries to package product", async function () {
      await expect(
        productTrace.connect(producer2).packageProduct(1, "Qm123abc", "15:00, 04/06/2024")
      ).to.be.revertedWith("Not authorized");
    });
  });

  describe("getFullTrace", function () {
    it("should return full trace details for a batch", async function () {
      // Input raw materials and start production and package product
      await productTrace.connect(producer1).inputRawMaterial("Farm A", "High", 100, "01/06/2024");
      await productTrace.connect(producer1).inputRawMaterial("Farm B", "Medium", 50, "02/06/2024");
      await productTrace.connect(producer1).startProduction([1, 2], "10:00, 03/06/2024");
      await productTrace.connect(producer1).packageProduct(1, "Qm123abc", "15:00, 04/06/2024");

      const trace = await productTrace.getFullTrace(1);

      expect(trace.bahanIds.length).to.equal(2);
      expect(trace.sumber[0]).to.equal("Farm A");
      expect(trace.kualitas[1]).to.equal("Medium");
      expect(trace.waktuManual[0]).to.equal("01/06/2024");
      expect(trace.halalHash).to.equal("Qm123abc");
      expect(trace.waktuProduksiManual).to.equal("10:00, 03/06/2024");
      expect(trace.waktuKemasManual).to.equal("15:00, 04/06/2024");
    });
  });
});
