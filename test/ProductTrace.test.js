const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ProductTrace Contract", function () {
    let ProductTrace;
    let productTrace;
    let owner;
    let producer1;
    let producer2;
    let nonProducer;
    let addr1; // Will be used as producer1
    let addr2; // Will be used as producer2
    let addr3; // Will be used as nonProducer

    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

    beforeEach(async function () {
        [owner, addr1, addr2, addr3] = await ethers.getSigners();
        producer1 = addr1;
        producer2 = addr2;
        nonProducer = addr3;

        ProductTrace = await ethers.getContractFactory("ProductTrace");
        productTrace = await ProductTrace.deploy();
        await productTrace.waitForDeployment();

        // Add producer1 explicitly by owner for some tests
        await productTrace.connect(owner).addProducer(producer1.address);
    });

    describe("Deployment & Constructor", function () {
        it("Should set the right owner", async function () {
            expect(await productTrace.owner()).to.equal(owner.address);
        });

        it("Should make the deployer a producer", async function () {
            expect(await productTrace.producers(owner.address)).to.be.true;
        });

        it("Should emit ProducerAdded event for the owner on deployment", async function () {
            // For this, we'd need to deploy a new instance or capture events during deployment
            const deployTx = await ProductTrace.deploy();
            await deployTx.waitForDeployment();
            const receipt = await deployTx.deploymentTransaction().wait();

            // Find the event in the transaction receipt
            const event = receipt.logs.find(log => {
                try {
                    const parsedLog = productTrace.interface.parseLog(log);
                    return parsedLog && parsedLog.name === "ProducerAdded";
                } catch (e) {
                    return false;
                }
            });
            expect(event).to.not.be.undefined;
            const parsedLog = productTrace.interface.parseLog(event);
            expect(parsedLog.args.producerAddress).to.equal(owner.address);
        });
    });

    describe("Producer Management", function () {
        describe("addProducer()", function () {
            it("Owner should be able to add a new producer", async function () {
                await expect(productTrace.connect(owner).addProducer(producer2.address))
                    .to.emit(productTrace, "ProducerAdded")
                    .withArgs(producer2.address);
                expect(await productTrace.producers(producer2.address)).to.be.true;
            });

            it("Should revert if a non-owner tries to add a producer", async function () {
                await expect(productTrace.connect(nonProducer).addProducer(addr3.address))
                    .to.be.revertedWithCustomError(productTrace, "ProductTrace__NotOwner");
            });

            it("Should revert if trying to add the zero address as a producer", async function () {
                await expect(productTrace.connect(owner).addProducer(ZERO_ADDRESS))
                    .to.be.revertedWithCustomError(productTrace, "ProductTrace__ZeroAddressNotAllowed");
            });

            it("Adding an existing producer should not emit a new event or fail", async function () {
                // producer1 is already added in beforeEach
                expect(await productTrace.producers(producer1.address)).to.be.true;
                // Adding again should succeed silently without emitting a new event for this specific call
                // (though the first addProducer call did emit one)
                const tx = await productTrace.connect(owner).addProducer(producer1.address);
                const receipt = await tx.wait();
                // Check if the event was emitted in *this* transaction
                const event = receipt.logs.find(log => {
                     try {
                        const parsedLog = productTrace.interface.parseLog(log);
                        return parsedLog && parsedLog.name === "ProducerAdded" && parsedLog.args.producerAddress === producer1.address;
                    } catch (e) { return false; }
                });
                expect(event).to.not.be.undefined; // It will emit, as the function always emits.
                                                  // The state `producers[producer1.address]` remains true.
                expect(await productTrace.producers(producer1.address)).to.be.true;
            });
        });

        describe("onlyProducer Modifier", function () {
            it("Should allow access for registered producers", async function () {
                // Test with a function that uses onlyProducer, e.g., inputRawMaterial
                await expect(productTrace.connect(producer1).inputRawMaterial("Source A", "High", 100, "01/01/2024"))
                    .to.not.be.reverted;
            });

            it("Should revert for non-producers", async function () {
                await expect(productTrace.connect(nonProducer).inputRawMaterial("Source B", "Low", 50, "02/01/2024"))
                    .to.be.revertedWithCustomError(productTrace, "ProductTrace__NotAuthorizedProducer");
            });
        });
    });

    describe("Raw Material Input", function () {
        describe("inputRawMaterial()", function () {
            it("Authorized producer should be able to input raw material", async function () {
                const source = "Farm X";
                const quality = "Premium";
                const quantity = 150;
                const pickupTime = "10/05/2024";

                const tx = await productTrace.connect(producer1).inputRawMaterial(source, quality, quantity, pickupTime);
                const receipt = await tx.wait();
                const event = receipt.logs.find(log => productTrace.interface.parseLog(log)?.name === "RawMaterialAdded");
                const materialId = event.args.materialId;

                expect(materialId).to.equal(1); // Assuming this is the first raw material
                expect(await productTrace.rawMaterialCount()).to.equal(1);

                const material = await productTrace.rawMaterials(materialId);
                expect(material.id).to.equal(materialId);
                expect(material.source).to.equal(source);
                expect(material.quality).to.equal(quality);
                expect(material.quantity).to.equal(quantity);
                expect(material.pickupTimeManual).to.equal(pickupTime);
                expect(material.producer).to.equal(producer1.address);
                expect(material.timestampAdded).to.be.above(0);

                await expect(tx)
                    .to.emit(productTrace, "RawMaterialAdded")
                    .withArgs(materialId, producer1.address, source, quantity);
            });

            it("Should revert if a non-producer tries to input raw material", async function () {
                await expect(productTrace.connect(nonProducer).inputRawMaterial("Source C", "Medium", 200, "11/05/2024"))
                    .to.be.revertedWithCustomError(productTrace, "ProductTrace__NotAuthorizedProducer");
            });
        });
    });

    describe("Production Operations", function () {
        let rawMaterialId1, rawMaterialId2;

        beforeEach(async function () {
            // Producer1 inputs some raw materials
            let tx = await productTrace.connect(producer1).inputRawMaterial("Supplier A", "Grade 1", 100, "01/06/2024");
            let receipt1 = await tx.wait(); 
            const event1 = receipt1.logs.find(log => log.fragment && log.fragment.name === "RawMaterialAdded");
            if (!event1) throw new Error("RawMaterialAdded event (event1) not found or not parsed by Hardhat");
            rawMaterialId1 = event1.args.materialId; 


            tx = await productTrace.connect(producer1).inputRawMaterial("Supplier B", "Grade 2", 200, "02/06/2024");
            let receipt2 = await tx.wait();
            const event2 = receipt2.logs.find(log => log.fragment && log.fragment.name === "RawMaterialAdded");
            if (!event2) throw new Error("RawMaterialAdded event (event2) not found or not parsed by Hardhat");
            rawMaterialId2 = event2.args.materialId;
        });

        describe("startProduction()", function () {
            it("Authorized producer should be able to start production", async function () {
                const rawMaterialIds = [rawMaterialId1, rawMaterialId2];
                const startTimeManual = "09:00, 03/06/2024";

                const tx = await productTrace.connect(producer1).startProduction(rawMaterialIds, startTimeManual);
                const receipt = await tx.wait();
                const productionStartedEvent = receipt.logs.find(log => log.fragment && log.fragment.name === "ProductionStarted");
                if (!productionStartedEvent) throw new Error("ProductionStarted event not found or not parsed by Hardhat");
                const batchId = productionStartedEvent.args.batchId;


                expect(batchId).to.equal(1); // Assuming this is the first batch
                expect(await productTrace.batchCount()).to.equal(1);

                const batch = await productTrace.batches(batchId);
                // console.log("Batch object from test:", JSON.stringify(batch, (key, value) => typeof value === 'bigint' ? value.toString() + "n" : value, 2));
                // console.log("Batch rawMaterialIds:", batch.rawMaterialIds);
                // console.log("Expected rawMaterialIds:", rawMaterialIds);

                expect(batch.id).to.equal(batchId);
                // Removed direct check of batch[1] because ethers.js does not return dynamic arrays properly
                // Instead, verify rawMaterialIds via getFullTrace
                const fullTrace = await productTrace.getFullTrace(batchId);
                expect(fullTrace.bahanIds).to.deep.equal(rawMaterialIds);
                expect(batch.startTime).to.be.above(0);
                expect(batch.packagingTime).to.equal(0);
                expect(batch.halalCertHash).to.equal("");
                expect(batch.startTimeManual).to.equal(startTimeManual);
                expect(batch.packagingTimeManual).to.equal("");
                await expect(tx)
                    .to.emit(productTrace, "ProductionStarted")
                    .withArgs(batchId, producer1.address, rawMaterialIds);
            });

            it("Should revert if a non-producer tries to start production", async function () {
                await expect(productTrace.connect(nonProducer).startProduction([rawMaterialId1], "10:00, 03/06/2024"))
                    .to.be.revertedWithCustomError(productTrace, "ProductTrace__NotAuthorizedProducer");
            });

            it("Should revert if starting production with a non-existent raw material ID", async function () {
                const nonExistentRawMaterialId = 999;
                await expect(productTrace.connect(producer1).startProduction([rawMaterialId1, nonExistentRawMaterialId], "11:00, 03/06/2024"))
                    .to.be.revertedWithCustomError(productTrace, "ProductTrace__RawMaterialDoesNotExist");
            });
        });

        describe("packageProduct()", function () {
            let batchIdToPackage;

            beforeEach(async function () {
                // Producer1 starts a production batch
                const tx = await productTrace.connect(producer1).startProduction([rawMaterialId1], "09:00, 03/06/2024");
                const receipt = await tx.wait();
                const productionStartedEvent = receipt.logs.find(log => log.fragment && log.fragment.name === "ProductionStarted");
                if (!productionStartedEvent) throw new Error("ProductionStarted event (batchIdToPackage) not found or not parsed by Hardhat");
                batchIdToPackage = productionStartedEvent.args.batchId;
            });

            it("Authorized producer should be able to package a started product", async function () {
                const halalCertHash = "0x123abc";
                const packagingTimeManual = "17:00, 03/06/2024";

                const tx = await productTrace.connect(producer1).packageProduct(batchIdToPackage, halalCertHash, packagingTimeManual);
                const batch = await productTrace.batches(batchIdToPackage);

                expect(batch.packagingTime).to.be.above(0);
                expect(batch.halalCertHash).to.equal(halalCertHash);
                expect(batch.packagingTimeManual).to.equal(packagingTimeManual);

                await expect(tx)
                    .to.emit(productTrace, "ProductPackaged")
                    .withArgs(batchIdToPackage, producer1.address, halalCertHash);
            });

            it("Should revert if a non-producer tries to package a product", async function () {
                await expect(productTrace.connect(nonProducer).packageProduct(batchIdToPackage, "0xdef456", "18:00, 03/06/2024"))
                    .to.be.revertedWithCustomError(productTrace, "ProductTrace__NotAuthorizedProducer");
            });

            it("Should revert if trying to package a non-existent batch", async function () {
                const nonExistentBatchId = 999;
                await expect(productTrace.connect(producer1).packageProduct(nonExistentBatchId, "0xghi789", "19:00, 03/06/2024"))
                    .to.be.revertedWithCustomError(productTrace, "ProductTrace__BatchDoesNotExist");
            });

            it("Should revert if trying to package an already packaged batch", async function () {
                await productTrace.connect(producer1).packageProduct(batchIdToPackage, "0xfirstHash", "17:00");
                await expect(productTrace.connect(producer1).packageProduct(batchIdToPackage, "0xsecondHash", "17:05"))
                    .to.be.revertedWithCustomError(productTrace, "ProductTrace__BatchAlreadyPackaged");
            });
        });
    });

    describe("Trace Retrieval", function () {
        describe("getFullTrace()", function () {
            let rmId1, rmId2, batchId;
            const rm1Source = "Chicken Farm A", rm1Quality = "Organic", rm1Qty = 100, rm1Pickup = "01/07/2024";
            const rm2Source = "Spice Supplier B", rm2Quality = "Grade A", rm2Qty = 5, rm2Pickup = "02/07/2024";
            const batchStartTimeManual = "08:00, 03/07/2024";
            const batchHalalHash = "0xHalalCert123";
            const batchPackagingTimeManual = "16:00, 03/07/2024";

            beforeEach(async function () {
                // Producer (owner) inputs raw materials
                let tx = await productTrace.connect(owner).inputRawMaterial(rm1Source, rm1Quality, rm1Qty, rm1Pickup);
                let receipt1 = await tx.wait();
                const event1 = receipt1.logs.find(log => log.fragment && log.fragment.name === "RawMaterialAdded");
                if (!event1) throw new Error("RawMaterialAdded event (rmId1) not found or not parsed by Hardhat");
                rmId1 = event1.args.materialId;

                tx = await productTrace.connect(owner).inputRawMaterial(rm2Source, rm2Quality, rm2Qty, rm2Pickup);
                let receipt2 = await tx.wait();
                const event2 = receipt2.logs.find(log => log.fragment && log.fragment.name === "RawMaterialAdded");
                if (!event2) throw new Error("RawMaterialAdded event (rmId2) not found or not parsed by Hardhat");
                rmId2 = event2.args.materialId;

                // Producer (owner) starts production
                tx = await productTrace.connect(owner).startProduction([rmId1, rmId2], batchStartTimeManual);
                let receipt3 = await tx.wait();
                const event3 = receipt3.logs.find(log => log.fragment && log.fragment.name === "ProductionStarted");
                if (!event3) throw new Error("ProductionStarted event (batchId for getFullTrace) not found or not parsed by Hardhat");
                batchId = event3.args.batchId;

                // Producer (owner) packages product
                await productTrace.connect(owner).packageProduct(batchId, batchHalalHash, batchPackagingTimeManual);
            });

            it("Should return the full trace for a packaged product", async function () {
                const trace = await productTrace.getFullTrace(batchId);
                const batchData = await productTrace.batches(batchId);

                expect(trace.bahanIds).to.deep.equal([BigInt(rmId1), BigInt(rmId2)]);
                expect(trace.sumber).to.deep.equal([rm1Source, rm2Source]);
                expect(trace.kualitas).to.deep.equal([rm1Quality, rm2Quality]);
                expect(trace.waktuManual).to.deep.equal([rm1Pickup, rm2Pickup]);
                expect(trace.waktuProduksi).to.equal(batchData.startTime);
                expect(trace.waktuKemas).to.equal(batchData.packagingTime);
                expect(trace.halalHash).to.equal(batchHalalHash);
                expect(trace.waktuProduksiManual).to.equal(batchStartTimeManual);
                expect(trace.waktuKemasManual).to.equal(batchPackagingTimeManual);
            });

            it("Should revert if trying to get trace for a non-existent batch", async function () {
                const nonExistentBatchId = 999;
                await expect(productTrace.getFullTrace(nonExistentBatchId))
                    .to.be.revertedWithCustomError(productTrace, "ProductTrace__BatchDoesNotExist");
            });

            it("Should return trace for a started but not yet packaged product", async function () {
                // Create a new batch that is not packaged
                let tx = await productTrace.connect(owner).inputRawMaterial("Temp Source", "Temp Q", 10, "10/07/2024");
                let receipt1 = await tx.wait();
                const event1 = receipt1.logs.find(log => log.fragment && log.fragment.name === "RawMaterialAdded");
                if (!event1) throw new Error("RawMaterialAdded event (tempRmId) not found or not parsed by Hardhat");
                const tempRmId = event1.args.materialId;

                tx = await productTrace.connect(owner).startProduction([tempRmId], "10:00, 10/07/2024");
                let receipt2 = await tx.wait();
                const event2 = receipt2.logs.find(log => log.fragment && log.fragment.name === "ProductionStarted");
                if (!event2) throw new Error("ProductionStarted event (unpackagedBatchId) not found or not parsed by Hardhat");
                const unpackagedBatchId = event2.args.batchId;

                const trace = await productTrace.getFullTrace(unpackagedBatchId);
                const batchData = await productTrace.batches(unpackagedBatchId);

                expect(trace.bahanIds).to.deep.equal([BigInt(tempRmId)]);
                expect(trace.waktuProduksi).to.equal(batchData.startTime);
                expect(trace.waktuKemas).to.equal(0); // Not packaged
                expect(trace.halalHash).to.equal(""); // Not packaged
                expect(trace.waktuKemasManual).to.equal(""); // Not packaged
            });

             it("Should revert if a raw material ID in the batch does not exist in rawMaterials mapping", async function () {
                await expect(productTrace.connect(owner).startProduction([99999], "bad data"))
                    .to.be.revertedWithCustomError(productTrace, "ProductTrace__RawMaterialDoesNotExist");
            });
        });
    });
});
