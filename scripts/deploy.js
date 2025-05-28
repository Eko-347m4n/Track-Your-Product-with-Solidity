const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const ProductTrace = await hre.ethers.getContractFactory("ProductTrace");
  const productTrace = await ProductTrace.deploy();
  await productTrace.waitForDeployment();

  const address = await productTrace.getAddress();
  console.log("✅ ProductTrace deployed to:", address);

  // Simpan ABI dan alamat ke file untuk pengecekan atau frontend
  const data = {
    address: address,
    abi: ProductTrace.interface.format("json"),
  };
  // Menentukan path ke direktori product-trace-ui
  const uiDir = path.join(__dirname, "..", "product-trace-ui");
  // Memastikan direktori ada, jika tidak maka buat
  if (!fs.existsSync(uiDir)){ fs.mkdirSync(uiDir, { recursive: true }); }
  fs.writeFileSync(path.join(uiDir, "deployed.json"), JSON.stringify(data, null, 2));
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
