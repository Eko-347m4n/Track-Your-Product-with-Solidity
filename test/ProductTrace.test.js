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
    const STAGES = {
        NOT_STARTED: 0,
        RAW_MATERIAL: 1,
        PRODUCTION: 2,
        PACKAGING: 3,
        DISTRIBUTION: 4,
    };

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
            // Deploy a new instance and capture events during deployment
            const deployTx = await ProductTrace.deploy();
            await deployTx.waitForDeployment();
            const receipt = await deployTx.deploymentTransaction().wait();

            // Find the ProducerAdded event in the transaction receipt
            const event = receipt.logs.find(log => {
                try {
                    const parsedLog = deployTx.interface.parseLog(log);
                    return parsedLog && parsedLog.name === "ProducerAdded";
                } catch (e) {
                    return false;
                }
            });
            expect(event).to.not.be.undefined;
            const parsedLog = deployTx.interface.parseLog(event);
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

            it("Adding an existing producer should not fail and still emit event", async function () {
                expect(await productTrace.producers(producer1.address)).to.be.true;
                const tx = await productTrace.connect(owner).addProducer(producer1.address);
                const receipt = await tx.wait();
                const event = receipt.logs.find(log => {
                    try {
                        const parsedLog = productTrace.interface.parseLog(log);
                        return parsedLog && parsedLog.name === "ProducerAdded" && parsedLog.args.producerAddress === producer1.address;
                    } catch (e) {
                        return false;
                    }
                });
                expect(event).to.not.be.undefined;
                expect(await productTrace.producers(producer1.address)).to.be.true;
            });
        });

        describe("removeProducer()", function () {
            it("Owner should be able to remove an existing producer", async function () {
                // Add producer2 first
                await productTrace.connect(owner).addProducer(producer2.address);
                expect(await productTrace.producers(producer2.address)).to.be.true;

                // Remove producer2
                await expect(productTrace.connect(owner).removeProducer(producer2.address))
                    .to.emit(productTrace, "ProducerRemoved")
                    .withArgs(producer2.address);
                expect(await productTrace.producers(producer2.address)).to.be.false;
            });

            it("Should revert if a non-owner tries to remove a producer", async function () {
                await expect(productTrace.connect(nonProducer).removeProducer(producer1.address))
                    .to.be.revertedWithCustomError(productTrace, "ProductTrace__NotOwner");
            });

            it("Should revert if trying to remove the zero address", async function () {
                await expect(productTrace.connect(owner).removeProducer(ZERO_ADDRESS))
                    .to.be.revertedWithCustomError(productTrace, "ProductTrace__ZeroAddressNotAllowed");
            });

            it("Should revert if trying to remove an address that is not a producer", async function () {
                expect(await productTrace.producers(nonProducer.address)).to.be.false;
                await expect(productTrace.connect(owner).removeProducer(nonProducer.address))
                    .to.be.revertedWithCustomError(productTrace, "ProductTrace__NotAuthorizedProducer");
            });
        });

        describe("onlyProducer Modifier", function () {
            it("Should allow access for registered producers", async function () {
                // Test with a function that uses onlyProducer, e.g., createProduct
                await expect(productTrace.connect(producer1).createProduct("Product A", "Source A", "High", 100, "01/01/2024"))
                    .to.not.be.reverted;
            });

            it("Should revert for non-producers", async function () {
                // inputRawMaterial function does not exist, replace with createProduct to test revert
                await expect(productTrace.connect(nonProducer).createProduct("Product B", "Source B", "Low", 50, "02/01/2024"))
                    .to.be.revertedWithCustomError(productTrace, "ProductTrace__NotAuthorizedProducer");
            });
        });
    });

    describe("Product Lifecycle", function () {
        describe("createProduct() - Step 1: Create Product (as Raw Material)", function () {
            it("Authorized producer should be able to create a product", async function () {
                const name = "Organic Apples";
                const source = "Farm X";
                const quality = "Premium";
                const initialQuantity = 150;
                const pickupTime = "10/05/2024";

                const tx = await productTrace.connect(producer1).createProduct(name, source, quality, initialQuantity, pickupTime);
                const receipt = await tx.wait();
                const event = receipt.logs.find(log => {
                    try { return productTrace.interface.parseLog(log)?.name === "ProductCreated"; } catch (e) { return false; }
                });
                expect(event).to.not.be.undefined;
                const { productId, productOwner, initialStage } = productTrace.interface.parseLog(event).args;

                expect(productId).to.equal(1); // Assuming this is the first product
                expect(await productTrace.productCount()).to.equal(1);

                const product = await productTrace.products(productId);
                expect(product.id).to.equal(productId);
                expect(product.name).to.equal(name);
                expect(product.source).to.equal(source);
                expect(product.quality).to.equal(quality);
                expect(product.initialQuantity).to.equal(initialQuantity);
                expect(product.availableQuantity).to.equal(initialQuantity);
                expect(product.pickupTimeManual).to.equal(pickupTime);
                expect(product.stage).to.equal(STAGES.RAW_MATERIAL);
                expect(product.productOwner).to.equal(producer1.address);
                expect(product.timestamp).to.be.above(0);
                expect(product.currentBatchId).to.equal(0);
                expect(product.distributionDetails).to.equal("");

                await expect(tx)
                    .to.emit(productTrace, "ProductCreated")
                    .withArgs(productId, name, productOwner, initialStage, (await ethers.provider.getBlock(receipt.blockNumber)).timestamp);
            });

            it("Should revert if a non-producer tries to create a product", async function () {
                await expect(productTrace.connect(nonProducer).createProduct("Illegal Apples", "Source C", "Medium", 200, "11/05/2024"))
                    .to.be.revertedWithCustomError(productTrace, "ProductTrace__NotAuthorizedProducer");
            });

            it("Should revert if initial quantity is zero", async function () {
                await expect(productTrace.connect(producer1).createProduct("Zero Qty Product", "Source D", "Low", 0, "12/05/2024"))
                    .to.be.revertedWithCustomError(productTrace, "ProductTrace__ZeroQuantityNotAllowed");
            });
        });

        describe("startProduction() - Step 2: Start Production", function () {
            let productToProcessId;
            let consumableProduct1Id, consumableProduct2Id;

            beforeEach(async function () {
                // Producer1 creates products to be used
                let tx = await productTrace.connect(producer1).createProduct("Main Product", "Factory A", "Standard", 1, "01/06/2024"); // Qty 1, as it's the item being processed
                let receipt = await tx.wait();
                productToProcessId = receipt.logs.find(log => productTrace.interface.parseLog(log)?.name === "ProductCreated").args.productId;

                tx = await productTrace.connect(producer1).createProduct("Ingredient X", "Supplier X", "Grade A", 100, "01/06/2024");
                receipt = await tx.wait();
                consumableProduct1Id = receipt.logs.find(log => productTrace.interface.parseLog(log)?.name === "ProductCreated").args.productId;

                tx = await productTrace.connect(producer1).createProduct("Ingredient Y", "Supplier Y", "Grade B", 200, "02/06/2024");
                receipt = await tx.wait();
                consumableProduct2Id = receipt.logs.find(log => productTrace.interface.parseLog(log)?.name === "ProductCreated").args.productId;
            });

            it("Product owner should be able to start production", async function () {
                const consumedProductIds = [consumableProduct1Id, consumableProduct2Id];
                const quantitiesUsed = [50, 75];
                const startTimeManual = "09:00, 03/06/2024";

                const tx = await productTrace.connect(producer1).startProduction(productToProcessId, consumedProductIds, quantitiesUsed, startTimeManual);
                const receipt = await tx.wait();

                const batchCreatedEvent = receipt.logs.find(log => productTrace.interface.parseLog(log)?.name === "BatchCreated");
                expect(batchCreatedEvent).to.not.be.undefined;
                const { batchId, productId: eventProductId, createdBy, consumedProductIds: eventConsumedIds, quantitiesUsed: eventQuantities } = productTrace.interface.parseLog(batchCreatedEvent).args;

                expect(batchId).to.equal(1);
                expect(await productTrace.batchCount()).to.equal(1);

                const productProcessed = await productTrace.products(productToProcessId);
                expect(productProcessed.stage).to.equal(STAGES.PRODUCTION);
                expect(productProcessed.currentBatchId).to.equal(batchId);
                expect(productProcessed.timestamp).to.be.above(0);

                const batch = await productTrace.batches(batchId);
                expect(batch.id).to.equal(batchId);
                const rawMaterialIds = await productTrace.getBatchRawMaterialIds(batchId);
                const quantitiesUsedArr = await productTrace.getBatchQuantitiesUsed(batchId);
                expect(rawMaterialIds).to.deep.equal(consumedProductIds.map(id => BigInt(id)));
                expect(quantitiesUsedArr).to.deep.equal(quantitiesUsed.map(q => BigInt(q)));
                expect(batch.startTimeManual).to.equal(startTimeManual);

                const consumable1After = await productTrace.products(consumableProduct1Id);
                expect(consumable1After.availableQuantity).to.equal(100 - 50);
                const consumable2After = await productTrace.products(consumableProduct2Id);
                expect(consumable2After.availableQuantity).to.equal(200 - 75);

                await expect(tx)
                    .to.emit(productTrace, "BatchCreated")
                    .withArgs(batchId, productToProcessId, producer1.address, consumedProductIds, quantitiesUsed, (await ethers.provider.getBlock(receipt.blockNumber)).timestamp);
                await expect(tx)
                    .to.emit(productTrace, "ProductStageChanged")
                    .withArgs(productToProcessId, STAGES.RAW_MATERIAL, STAGES.PRODUCTION, producer1.address, (await ethers.provider.getBlock(receipt.blockNumber)).timestamp);
                await expect(tx)
                    .to.emit(productTrace, "ProductQuantityUpdated")
                    .withArgs(consumableProduct1Id, quantitiesUsed[0], 100 - quantitiesUsed[0], (await ethers.provider.getBlock(receipt.blockNumber)).timestamp);
                await expect(tx)
                    .to.emit(productTrace, "ProductQuantityUpdated")
                    .withArgs(consumableProduct2Id, quantitiesUsed[1], 200 - quantitiesUsed[1], (await ethers.provider.getBlock(receipt.blockNumber)).timestamp);
            });

            it("Should revert if caller is not the product owner", async function () {
                await expect(productTrace.connect(producer2).startProduction(productToProcessId, [consumableProduct1Id], [10], "10:00"))
                    .to.be.revertedWithCustomError(productTrace, "ProductTrace__NotProductOwner");
            });

            it("Should revert if product to process is not in RawMaterial stage", async function () {
                // Start production once
                await productTrace.connect(producer1).startProduction(productToProcessId, [consumableProduct1Id], [10], "10:00");
                // Try to start again
                await expect(productTrace.connect(producer1).startProduction(productToProcessId, [consumableProduct2Id], [10], "10:05"))
                    .to.be.revertedWithCustomError(productTrace, "ProductTrace__InvalidProductStage")
                    .withArgs(productToProcessId, STAGES.PRODUCTION, STAGES.RAW_MATERIAL);
            });

            it("Should revert if a consumed product does not exist", async function () {
                await expect(productTrace.connect(producer1).startProduction(productToProcessId, [999], [10], "10:00"))
                    .to.be.revertedWithCustomError(productTrace, "ProductTrace__ProductNotFound");
            });

            it("Should revert if a consumed product is not in RawMaterial stage", async function () {
                // Create another product and put it in production
                let tx = await productTrace.connect(producer1).createProduct("Another Main", "Factory B", "Standard", 1, "01/06/2024");
                let receipt = await tx.wait();
                const anotherMainId = receipt.logs.find(log => productTrace.interface.parseLog(log)?.name === "ProductCreated").args.productId;

                tx = await productTrace.connect(producer1).createProduct("Consumable for Another", "Supplier Z", "Grade C", 50, "01/06/2024");
                receipt = await tx.wait();
                const consumableForAnotherId = receipt.logs.find(log => productTrace.interface.parseLog(log)?.name === "ProductCreated").args.productId;

                await productTrace.connect(producer1).startProduction(anotherMainId, [consumableForAnotherId], [5], "11:00"); // anotherMainId is now in Production

                // Try to use 'anotherMainId' (which is in Production) as a consumable for 'productToProcessId'
                await expect(productTrace.connect(producer1).startProduction(productToProcessId, [anotherMainId], [1], "10:00"))
                    .to.be.revertedWithCustomError(productTrace, "ProductTrace__InvalidProductStage")
                    .withArgs(anotherMainId, STAGES.PRODUCTION, STAGES.RAW_MATERIAL);
            });

            it("Should revert if insufficient quantity of a consumed product", async function () {
                await expect(productTrace.connect(producer1).startProduction(productToProcessId, [consumableProduct1Id], [1000], "10:00")) // consumableProduct1Id has 100
                    .to.be.revertedWithCustomError(productTrace, "ProductTrace__InsufficientProductQuantity")
                    .withArgs(consumableProduct1Id, 1000, 100);
            });

            it("Should revert if consumedProductIds and quantitiesUsed array lengths mismatch", async function () {
                await expect(productTrace.connect(producer1).startProduction(productToProcessId, [consumableProduct1Id], [10, 20], "10:00"))
                    .to.be.revertedWithCustomError(productTrace, "ProductTrace__ArrayLengthMismatch");
            });

            it("Should revert if no inputs for production are provided", async function () {
                await expect(productTrace.connect(producer1).startProduction(productToProcessId, [], [], "10:00"))
                    .to.be.revertedWithCustomError(productTrace, "ProductTrace__NoInputsForProduction");
            });

            it("Should revert if zero quantity is specified for a consumed product", async function () {
                await expect(productTrace.connect(producer1).startProduction(productToProcessId, [consumableProduct1Id], [0], "10:00"))
                    .to.be.revertedWithCustomError(productTrace, "ProductTrace__ZeroQuantityNotAllowed");
            });
        });

        describe("packageProduct() - Step 3: Package Product", function () {
            let productToPackageId;
            let batchIdForPackaging;

            beforeEach(async function () {
                // Create a product
                let tx = await productTrace.connect(producer1).createProduct("Juice Batch 1", "Mixing Tank", "Standard", 1, "01/07/2024");
                const receipt = await tx.wait();
                productToPackageId = receipt.logs.find(log => productTrace.interface.parseLog(log)?.name === "ProductCreated").args.productId;

                // Create a consumable product
                tx = await productTrace.connect(producer1).createProduct("Fruit Concentrate", "Supplier Z", "High", 50, "01/07/2024");
                const consumableId = (await tx.wait()).logs.find(log => productTrace.interface.parseLog(log)?.name === "ProductCreated").args.productId;

                // Start production for productToPackageId
                tx = await productTrace.connect(producer1).startProduction(productToPackageId, [consumableId], [20], "09:00, 03/07/2024");
                batchIdForPackaging = (await tx.wait()).logs.find(log => productTrace.interface.parseLog(log)?.name === "BatchCreated").args.batchId;
            });

            it("Product owner should be able to package a product in Production stage", async function () {
                const halalCertHash = "0x123abc";
                const bpomCertHash = "0x456def";
                const packagingTimeManual = "17:00, 03/06/2024";

                const tx = await productTrace.connect(producer1).packageProduct(productToPackageId, halalCertHash, bpomCertHash, packagingTimeManual);
                const receipt = await tx.wait();

                const productPackaged = await productTrace.products(productToPackageId);
                expect(productPackaged.stage).to.equal(STAGES.PACKAGING);
                expect(productPackaged.timestamp).to.be.above(0);

                const batch = await productTrace.batches(batchIdForPackaging);
                expect(batch.packagingTime).to.be.above(0);
                expect(batch.halalCertHash).to.equal(halalCertHash);
                expect(batch.bpomCertHash).to.equal(bpomCertHash);
                expect(batch.packagingTimeManual).to.equal(packagingTimeManual);

                await expect(tx)
                    .to.emit(productTrace, "BatchPackaged")
                    .withArgs(batchIdForPackaging, productToPackageId, producer1.address, halalCertHash, bpomCertHash, (await ethers.provider.getBlock(receipt.blockNumber)).timestamp);
                await expect(tx)
                    .to.emit(productTrace, "ProductStageChanged")
                    .withArgs(productToPackageId, STAGES.PRODUCTION, STAGES.PACKAGING, producer1.address, (await ethers.provider.getBlock(receipt.blockNumber)).timestamp);
            });

            it("Should revert if caller is not the product owner", async function () {
                await expect(productTrace.connect(producer2).packageProduct(productToPackageId, "0xdef", "0xabc", "18:00"))
                    .to.be.revertedWithCustomError(productTrace, "ProductTrace__NotProductOwner");
            });

            it("Should revert if product is not in Production stage", async function () {
                // Create a new product (it will be in RawMaterial stage)
                let tx = await productTrace.connect(producer1).createProduct("Not In Prod", "Source", "Q", 1, "Time");
                const newProdId = (await tx.wait()).logs.find(log => productTrace.interface.parseLog(log)?.name === "ProductCreated").args.productId;

                await expect(productTrace.connect(producer1).packageProduct(newProdId, "0xdef", "0xabc", "18:00"))
                    .to.be.revertedWithCustomError(productTrace, "ProductTrace__InvalidProductStage")
                    .withArgs(newProdId, STAGES.RAW_MATERIAL, STAGES.PRODUCTION);
            });

            it("Should revert if trying to package an already packaged batch", async function () {
                await productTrace.connect(producer1).packageProduct(productToPackageId, "0xfirstHash", "0xfirstBpom", "17:00");
                await expect(productTrace.connect(producer1).packageProduct(productToPackageId, "0xsecondHash", "0xsecondBpom", "17:05"))
                    .to.be.revertedWithCustomError(productTrace, "ProductTrace__InvalidProductStage");
            });
        });

        describe("distributeProduct() - Step 4: Distribute Product", function () {
            let productToDistributeId;

            beforeEach(async function () {
                // Create a product
                let tx = await productTrace.connect(producer1).createProduct("Packaged Goods", "Packaging Line", "Final", 1, "01/08/2024");
                productToDistributeId = (await tx.wait()).logs.find(log => productTrace.interface.parseLog(log)?.name === "ProductCreated").args.productId;

                // Create a consumable product
                tx = await productTrace.connect(producer1).createProduct("Packaging Material", "Supplier P", "Standard", 10, "01/08/2024");
                const consumableId = (await tx.wait()).logs.find(log => productTrace.interface.parseLog(log)?.name === "ProductCreated").args.productId;

                // Start production
                await productTrace.connect(producer1).startProduction(productToDistributeId, [consumableId], [1], "10:00, 01/08/2024");

                // Package product
                await productTrace.connect(producer1).packageProduct(productToDistributeId, "0xhalalDist", "0xbpomDist", "14:00, 01/08/2024");
            });

            it("Product owner should be able to distribute a product in Packaging stage", async function () {
                const distributionDetails = "Shipped via Truck #123 to Warehouse Z";
                const tx = await productTrace.connect(producer1).distributeProduct(productToDistributeId, distributionDetails);
                const receipt = await tx.wait();

                const productDistributed = await productTrace.products(productToDistributeId);
                expect(productDistributed.stage).to.equal(STAGES.DISTRIBUTION);
                expect(productDistributed.distributionDetails).to.equal(distributionDetails);
                expect(productDistributed.timestamp).to.be.above(0);

                await expect(tx)
                    .to.emit(productTrace, "ProductStageChanged")
                    .withArgs(productToDistributeId, STAGES.PACKAGING, STAGES.DISTRIBUTION, producer1.address, (await ethers.provider.getBlock(receipt.blockNumber)).timestamp);
            });

            it("Should revert if caller is not the product owner", async function () {
                await expect(productTrace.connect(producer2).distributeProduct(productToDistributeId, "Details"))
                    .to.be.revertedWithCustomError(productTrace, "ProductTrace__NotProductOwner");
            });

            it("Should revert if product is not in Packaging stage", async function () {
                // Create a new product (it will be in RawMaterial stage)
                let tx = await productTrace.connect(producer1).createProduct("Not Packaged", "Source", "Q", 1, "Time");
                const newProdId = (await tx.wait()).logs.find(log => productTrace.interface.parseLog(log)?.name === "ProductCreated").args.productId;

                await expect(productTrace.connect(producer1).distributeProduct(newProdId, "Details"))
                    .to.be.revertedWithCustomError(productTrace, "ProductTrace__InvalidProductStage")
                    .withArgs(newProdId, STAGES.RAW_MATERIAL, STAGES.PACKAGING);
            });
        });
    });

    describe("Trace Retrieval", function () {
        describe("getFullTrace()", function () {
            let mainProductId, consumableProd1Id, consumableProd2Id;
            let batchId;
            const mainProductName = "Finished Goods Batch Alpha";
            const mainProductSource = "Assembly Line 1";
            const mainProductQuality = "Premium Grade";
            const mainProductInitialQty = 1; // The product being tracked through stages
            const mainProductPickup = "N/A";

            const consumable1Name = "Component X";
            const consumable1Source = "Supplier Foo";
            const consumable1Quality = "High";
            const consumable1Qty = 100;
            const consumable1Pickup = "01/07/2024";

            const consumable2Name = "Component Y";
            const consumable2Source = "Supplier Bar";
            const consumable2Quality = "Standard";
            const consumable2Qty = 50;
            const consumable2Pickup = "02/07/2024";

            const consumedQty1 = 20;
            const consumedQty2 = 10;

            const prodStartTimeManual = "08:00, 03/07/2024";
            const packageHalalHash = "0xHalalCert123";
            const packageBpomHash = "0xBpomCertABC";
            const packageTimeManual = "16:00, 03/07/2024";
            const distributionInfo = "Shipped to Retailer Z";

            beforeEach(async function () {
                // Create main product
                let tx = await productTrace.connect(owner).createProduct(mainProductName, mainProductSource, mainProductQuality, mainProductInitialQty, mainProductPickup);
                mainProductId = (await tx.wait()).logs.find(log => productTrace.interface.parseLog(log)?.name === "ProductCreated").args.productId;

                // Create consumable products
                tx = await productTrace.connect(owner).createProduct(consumable1Name, consumable1Source, consumable1Quality, consumable1Qty, consumable1Pickup);
                consumableProd1Id = (await tx.wait()).logs.find(log => productTrace.interface.parseLog(log)?.name === "ProductCreated").args.productId;

                tx = await productTrace.connect(owner).createProduct(consumable2Name, consumable2Source, consumable2Quality, consumable2Qty, consumable2Pickup);
                consumableProd2Id = (await tx.wait()).logs.find(log => productTrace.interface.parseLog(log)?.name === "ProductCreated").args.productId;

                // Start production for main product
                tx = await productTrace.connect(owner).startProduction(mainProductId, [consumableProd1Id, consumableProd2Id], [consumedQty1, consumedQty2], prodStartTimeManual);
                batchId = (await tx.wait()).logs.find(log => productTrace.interface.parseLog(log)?.name === "BatchCreated").args.batchId;

                // Package main product
                await productTrace.connect(owner).packageProduct(mainProductId, packageHalalHash, packageBpomHash, packageTimeManual);

                // Distribute main product
                await productTrace.connect(owner).distributeProduct(mainProductId, distributionInfo);
            });

            it("Should return the full trace for a distributed product", async function () {
                const trace = await productTrace.getFullTrace(mainProductId);
                const productData = await productTrace.products(mainProductId);
                const batchData = await productTrace.batches(batchId);

                // Product Details
                expect(trace.productId).to.equal(mainProductId);
                expect(trace.productName).to.equal(mainProductName);
                expect(trace.productSource).to.equal(mainProductSource);
                expect(trace.productQuality).to.equal(mainProductQuality);
                expect(trace.productInitialQuantity).to.equal(mainProductInitialQty);
                expect(trace.productAvailableQuantity).to.equal(mainProductInitialQty); // Remains 1 for the main product
                expect(trace.productPickupTimeManual).to.equal(mainProductPickup);
                expect(trace.productStage).to.equal(STAGES.DISTRIBUTION);
                expect(trace.productLastUpdateTimestamp).to.equal(productData.timestamp);
                expect(trace.productOwner).to.equal(owner.address);
                expect(trace.productDistributionDetails).to.equal(distributionInfo);

                // Batch Details
                expect(trace.batchId).to.equal(batchId);
                expect(trace.consumedProductIds).to.deep.equal([consumableProd1Id, consumableProd2Id].map(id => BigInt(id)));
                expect(trace.consumedProductNames).to.deep.equal([consumable1Name, consumable2Name]);
                expect(trace.consumedProductSources).to.deep.equal([consumable1Source, consumable2Source]);
                expect(trace.consumedQuantitiesUsed).to.deep.equal([BigInt(consumedQty1), BigInt(consumedQty2)]);
                expect(trace.batchStartTime).to.equal(batchData.startTime);
                expect(trace.batchPackagingTime).to.equal(batchData.packagingTime);
                expect(trace.batchHalalCertHash).to.equal(packageHalalHash);
                expect(trace.batchBpomCertHash).to.equal(packageBpomHash);
                expect(trace.batchStartTimeManual).to.equal(prodStartTimeManual);
                expect(trace.batchPackagingTimeManual).to.equal(packageTimeManual);
            });

            it("Should return trace for a product in RawMaterial stage (no batch info)", async function () {
                let tx = await productTrace.connect(producer1).createProduct("Raw Only", "Source Raw", "Q Raw", 10, "Time Raw");
                const rawOnlyId = (await tx.wait()).logs.find(log => productTrace.interface.parseLog(log)?.name === "ProductCreated").args.productId;

                const trace = await productTrace.getFullTrace(rawOnlyId);
                const productData = await productTrace.products(rawOnlyId);

                expect(trace.productId).to.equal(rawOnlyId);
                expect(trace.productName).to.equal("Raw Only");
                expect(trace.productStage).to.equal(STAGES.RAW_MATERIAL);
                expect(trace.productOwner).to.equal(producer1.address);
                expect(trace.batchId).to.equal(0); // No batch yet
                expect(trace.consumedProductIds.length).to.equal(0);
            });

            it("Should revert if trying to get trace for a non-existent product ID", async function () {
                await expect(productTrace.getFullTrace(9999))
                    .to.be.revertedWithCustomError(productTrace, "ProductTrace__ProductNotFound");
            });
        });
    });

    describe("onlyProductOwner Modifier", function () {
        let productId;
        beforeEach(async function() {
            const tx = await productTrace.connect(producer1).createProduct("Owned Product", "S", "Q", 1, "T");
            productId = (await tx.wait()).logs.find(log => productTrace.interface.parseLog(log)?.name === "ProductCreated").args.productId;
        });

        it("Should allow product owner to call functions guarded by onlyProductOwner", async function () {
            // Example: startProduction (requires consumable, so we'll just test the modifier part by expecting other errors if it passes)
            // For a simpler test, let's assume distributeProduct is called on a product not yet packaged
            await expect(productTrace.connect(producer1).distributeProduct(productId, "details"))
                .to.be.revertedWithCustomError(productTrace, "ProductTrace__InvalidProductStage"); // Reverts due to stage, not ownership
        });

        it("Should revert if non-owner calls functions guarded by onlyProductOwner", async function () {
            await expect(productTrace.connect(producer2).distributeProduct(productId, "details"))
                .to.be.revertedWithCustomError(productTrace, "ProductTrace__NotProductOwner");
        });

        it("Should revert if product does not exist for onlyProductOwner", async function () {
             await expect(productTrace.connect(producer1).distributeProduct(999, "details"))
                .to.be.revertedWithCustomError(productTrace, "ProductTrace__ProductNotFound");
        });
});

describe("getAllProducts()", function () {
    it("Should return all products created", async function () {
        const productNames = ["Prod A", "Prod B", "Prod C"];
        for (const name of productNames) {
            await productTrace.connect(producer1).createProduct(name, "Source", "Quality", 10, "PickupTime");
        }
        const count = await productTrace.productCount();
        const allProducts = await productTrace.getAllProducts();

        expect(allProducts.length).to.equal(count);

        for (let i = 0; i < allProducts.length; i++) {
            expect(allProducts[i].id).to.equal(i + 1);
            expect(allProducts[i].name).to.equal(productNames[i]);
            expect(allProducts[i].initialQuantity).to.equal(10);
            expect(allProducts[i].availableQuantity).to.equal(10);
            expect(allProducts[i].stage).to.equal(STAGES.RAW_MATERIAL);
        }
    });
});
    it("Should return all products created", async function () {
        const productNames = ["Prod A", "Prod B", "Prod C"];
        for (const name of productNames) {
            await productTrace.connect(producer1).createProduct(name, "Source", "Quality", 10, "PickupTime");
        }
        const count = await productTrace.productCount();
        const allProducts = await productTrace.getAllProducts();

        expect(allProducts.length).to.equal(count);

        for (let i = 0; i < allProducts.length; i++) {
            expect(allProducts[i].id).to.equal(i + 1);
            expect(allProducts[i].name).to.equal(productNames[i]);
            expect(allProducts[i].initialQuantity).to.equal(10);
            expect(allProducts[i].availableQuantity).to.equal(10);
            expect(allProducts[i].stage).to.equal(STAGES.RAW_MATERIAL);
        }
    });
});
