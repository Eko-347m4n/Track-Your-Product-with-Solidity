import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import * as QRCodeReact from 'qrcode.react'; // Use namespace import
import deployedConfig from '../deployed.json';
import { TrashIcon } from '@heroicons/react/24/outline'; // For a nicer remove button

const contractAddress = deployedConfig.address;

const Spinner = () => (
  <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

function App() {
  const [provider, setProvider] = useState(null);
  const QRCode = QRCodeReact.default;
  const [contract, setContract] = useState(null);
  const [account, setAccount] = useState(null);

  // New states for QR codes and inputs
  const [lastRawMaterialId, setLastRawMaterialId] = useState(null);
  const [rawMaterialInputs, setRawMaterialInputs] = useState([{ id: '' }]);
  const [lastBatchId, setLastBatchId] = useState(null);
  const [packagingConfirmed, setPackagingConfirmed] = useState(false);
  const [halalCertHash, setHalalCertHash] = useState('');
  const [fullTraceData, setFullTraceData] = useState(null);
  const [traceBatchIdInput, setTraceBatchIdInput] = useState('');

  // Loading states for async operations
  const [isAddingMaterial, setIsAddingMaterial] = useState(false);
  const [isStartingProduction, setIsStartingProduction] = useState(false);
  const [isPackagingProduct, setIsPackagingProduct] = useState(false);
  const [isFetchingTrace, setIsFetchingTrace] = useState(false);

  // Feedback messages
  const [initializationStatus, setInitializationStatus] = useState({ loading: true, message: 'Initializing: Connecting to MetaMask...', type: 'info' });
  const [addMaterialFeedback, setAddMaterialFeedback] = useState({ text: '', type: '' });
  const [startProductionFeedback, setStartProductionFeedback] = useState({ text: '', type: '' });
  const [packageProductFeedback, setPackageProductFeedback] = useState({ text: '', type: '' });
  const [getTraceFeedback, setGetTraceFeedback] = useState({ text: '', type: '' });

  useEffect(() => {
    const init = async () => {
      if (window.ethereum) {
        try {
          const prov = new ethers.BrowserProvider(window.ethereum);
          const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
          const signer = await prov.getSigner();
          const ctr = new ethers.Contract(contractAddress, deployedConfig.abi, signer);

          setProvider(prov);
          setContract(ctr);
          setAccount(accounts[0]);
          setInitializationStatus({ loading: false, message: `Connected as: ${accounts[0]}`, type: 'success' });
        } catch (error) {
          console.error("Failed to initialize connection or contract:", error);
          setInitializationStatus({ loading: false, message: "Failed to connect. Ensure MetaMask is installed, unlocked, and on the correct network.", type: 'error' });
        }
      } else {
        setInitializationStatus({ loading: false, message: "MetaMask not detected. Please install MetaMask.", type: 'error' });
      }
    };
    init();
  }, []);

  // Add raw material and generate QR code with rawMaterialId
  const handleAddRawMaterial = async (e) => {
    e.preventDefault();
    setAddMaterialFeedback({ text: '', type: '' }); // Clear previous feedback
    if (!contract) return setAddMaterialFeedback({ text: "Contract not ready.", type: 'error' });

    const form = e.target;
    const source = form.source.value;
    const quality = form.quality.value;
    const quantity = parseInt(form.quantity.value);
    const pickupTimeManual = form.pickupTimeManual.value;

    setIsAddingMaterial(true);
    try {
      const tx = await contract.inputRawMaterial(source, quality, quantity, pickupTimeManual);
      const receipt = await tx.wait();
      
      const event = receipt.events?.find(e => e.event === 'RawMaterialAdded');
      if (event && event.args) {
        const rawMaterialId = event.args.materialId.toString();
        setLastRawMaterialId(rawMaterialId);
        setAddMaterialFeedback({ text: `Raw material added with ID: ${rawMaterialId}`, type: 'success' });
      } else {
        console.warn("RawMaterialAdded event not found or args missing in transaction receipt.", receipt);
        setAddMaterialFeedback({ text: "Raw material added, but ID could not be retrieved from event.", type: 'warn' });
      }
      form.reset();
    } catch (error) {
      console.error("Failed to add raw material:", error);
      setAddMaterialFeedback({ text: `Failed to add raw material: ${error.message || "Unknown error"}`, type: 'error' });
    } finally {
      setIsAddingMaterial(false);
    }
  };

  // Handle dynamic input for multiple raw materials during production start
  const handleRawMaterialIdChange = (index, value) => {
    const newInputs = [...rawMaterialInputs];
    newInputs[index].id = value;
    setRawMaterialInputs(newInputs);
  };

  const addRawMaterialInput = () => {
    setRawMaterialInputs([...rawMaterialInputs, { id: '' }]);
  };

  const removeRawMaterialInput = (index) => {
    const newInputs = rawMaterialInputs.filter((_, i) => i !== index);
    setRawMaterialInputs(newInputs);
  };

  // Start production with multiple rawMaterialIds
  const handleStartProduction = async (e) => {
    e.preventDefault();
    setStartProductionFeedback({ text: '', type: '' });
    if (!contract) return setStartProductionFeedback({ text: "Contract not ready.", type: 'error' });

    const form = e.target;
    const startTimeManual = form.startTimeManual.value;

    // Collect rawMaterialIds from inputs
    const rawMaterialIds = rawMaterialInputs.map(input => parseInt(input.id)).filter(id => !isNaN(id));

    if (rawMaterialIds.length === 0) {
      return setStartProductionFeedback({ text: "Please enter at least one valid Raw Material ID.", type: 'error' });
    }

    setIsStartingProduction(true);
    try {
      const tx = await contract.startProduction(rawMaterialIds, startTimeManual);
      const receipt = await tx.wait();
      const event = receipt.events?.find(e => e.event === 'ProductionStarted');
      if (event && event.args) {
        const batchId = event.args.batchId.toString();
        setLastBatchId(batchId);
        setPackagingConfirmed(false); // Reset packaging confirmation for new batch
        setStartProductionFeedback({ text: `Production started with Batch ID: ${batchId}`, type: 'success' });
        form.reset();
      } else {
        console.warn("ProductionStarted event not found or args missing in transaction receipt.", receipt);
        setStartProductionFeedback({ text: "Production started, but Batch ID could not be retrieved from event.", type: 'warn' });
      }
      setRawMaterialInputs([{ id: '' }]); // Reset to one empty input
    } catch (error) {
      console.error("Failed to start production:", error);
      setStartProductionFeedback({ text: `Failed to start production: ${error.message || "Unknown error"}`, type: 'error' });
    } finally {
      setIsStartingProduction(false);
    }
  };

  // Confirm packaging and generate QR code
  const handlePackageProduct = async (e) => {
    e.preventDefault();
    setPackageProductFeedback({ text: '', type: '' });
    if (!contract) return setPackageProductFeedback({ text: "Contract not ready.", type: 'error' });
    if (!lastBatchId) return setPackageProductFeedback({ text: "No production batch to package.", type: 'error' });

    const form = e.target;
    const halalCertHashInput = form.halalCertHash.value;
    const packagingTimeManual = form.packagingTimeManual.value;

    setIsPackagingProduct(true);
    try {
      const tx = await contract.packageProduct(lastBatchId, halalCertHashInput, packagingTimeManual);
      await tx.wait();
      setPackagingConfirmed(true);
      setHalalCertHash(halalCertHashInput);
      setPackageProductFeedback({ text: `Product packaged for Batch ID: ${lastBatchId}`, type: 'success' });
      form.reset();
    } catch (error) {
      console.error("Failed to package product:", error);
      setPackageProductFeedback({ text: `Failed to package product: ${error.message || "Unknown error"}`, type: 'error' });
    } finally {
      setIsPackagingProduct(false);
    }
  };

  // Get full trace by batchId
  const handleGetFullTrace = async (e) => {
    e.preventDefault();
    setGetTraceFeedback({ text: '', type: '' });
    if (!contract) return setGetTraceFeedback({ text: "Contract not ready.", type: 'error' });

    const batchId = parseInt(traceBatchIdInput);
    if (isNaN(batchId) || batchId <= 0) return setGetTraceFeedback({ text: "Please enter a valid Batch ID.", type: 'error' });

    setFullTraceData(null); // Clear previous trace data
    setIsFetchingTrace(true);
    try {
      const [
        bahanIdsBigInt,
        sumber,
        kualitas,
        waktuManual,
        waktuProduksiBigInt,
        waktuKemasBigInt,
        halalHash,
        waktuProduksiManual,
        waktuKemasManual
      ] = await contract.getFullTrace(batchId);

      setFullTraceData({
        bahanIds: bahanIdsBigInt.map(id => id.toString()),
        sumber: sumber,
        kualitas: kualitas,
        waktuManual: waktuManual,
        waktuProduksi: new Date(Number(waktuProduksiBigInt) * 1000).toLocaleString(),
        waktuKemas: waktuKemasBigInt && Number(waktuKemasBigInt) > 0 
                      ? new Date(Number(waktuKemasBigInt) * 1000).toLocaleString() 
                      : 'Not packaged yet',
        halalHash: halalHash,
        waktuProduksiManual: waktuProduksiManual,
        waktuKemasManual: waktuKemasManual
      });
      setGetTraceFeedback({ text: `Trace data loaded for Batch ID: ${batchId}`, type: 'success' });
    } catch (error) {
      console.error("Failed to get full trace:", error);
      setGetTraceFeedback({ text: `Failed to get full trace: ${error.message || "Unknown error"}`, type: 'error' });
    } finally {
      setIsFetchingTrace(false);
    }
  };

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <header className="mb-10">
        <h1 className="text-4xl font-extrabold text-center text-indigo-400 tracking-wide">Product Traceability DApp</h1>
        <div className="mt-3 text-center text-sm text-gray-300">
          {initializationStatus.loading && <p>{initializationStatus.message}</p>}
          {!initializationStatus.loading && initializationStatus.message && (
            <p className={
              initializationStatus.type === 'error' ? 'text-red-500' :
              initializationStatus.type === 'success' ? 'text-green-400' : 'text-gray-400'
            }>
              {initializationStatus.message}
            </p>
          )}
        </div>
      </header>

      {contract && account && (
        <>
          {/* Add Raw Material Section */}
          <section className="mb-10 p-6 bg-gray-900 border border-gray-700 rounded-xl shadow-lg max-w-lg mx-auto">
            <h2 className="text-3xl font-semibold mb-6 text-indigo-300">1. Input Raw Material</h2>
            <form onSubmit={handleAddRawMaterial} className="space-y-5">
              <input name="source" placeholder="Source (e.g., Farm A)" className="border border-gray-600 p-3 w-full rounded-lg focus:ring-indigo-500 focus:border-indigo-500 bg-gray-800 text-white" required />
              <input name="quality" placeholder="Quality (e.g., Grade A)" className="border border-gray-600 p-3 w-full rounded-lg focus:ring-indigo-500 focus:border-indigo-500 bg-gray-800 text-white" required />
              <input name="quantity" type="number" placeholder="Quantity (e.g., 100)" className="border border-gray-600 p-3 w-full rounded-lg focus:ring-indigo-500 focus:border-indigo-500 bg-gray-800 text-white" required />
              <input name="pickupTimeManual" placeholder="Pickup Time (e.g., 25/12/2023 10:00)" className="border border-gray-600 p-3 w-full rounded-lg focus:ring-indigo-500 focus:border-indigo-500 bg-gray-800 text-white" required />
              <button type="submit" className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 w-full disabled:opacity-60 flex items-center justify-center gap-2 font-semibold" disabled={isAddingMaterial}>
                {isAddingMaterial ? <><Spinner /> Processing...</> : 'Add Raw Material'}
              </button>
            </form>
            {addMaterialFeedback.text && (
              <p className={`mt-4 text-base font-medium ${
                addMaterialFeedback.type === 'error' ? 'text-red-500' : 
                addMaterialFeedback.type === 'success' ? 'text-green-400' : 'text-yellow-400'
              }`}>
                {addMaterialFeedback.text}
              </p>
            )}
            {lastRawMaterialId && (
              <div className="mt-6 p-5 bg-indigo-900 rounded-xl shadow-inner text-center">
                <p className="font-semibold text-indigo-300 mb-3">Last Raw Material ID: {lastRawMaterialId}</p>
                <div className="qrcode-container inline-block">
                  <QRCode value={lastRawMaterialId} size={140} />
                </div>
              </div>
            )}
          </section>

          {/* Start Production Section */}
          <section className="mb-10 p-6 bg-gray-900 border border-gray-700 rounded-xl shadow-lg max-w-lg mx-auto">
            <h2 className="text-3xl font-semibold mb-6 text-yellow-400">2. Start Production</h2>
            <form onSubmit={handleStartProduction} className="space-y-5">
              {rawMaterialInputs.map((input, index) => (
                <div key={index} className="flex items-center gap-3">
                  <input
                    type="number"
                    placeholder="Raw Material ID"
                    value={input.id}
                    onChange={(e) => handleRawMaterialIdChange(index, e.target.value)}
                    className="border border-yellow-600 p-3 rounded-lg flex-grow bg-gray-800 text-yellow-300 focus:ring-yellow-500 focus:border-yellow-500"
                    required
                  />
                  {rawMaterialInputs.length > 1 && (
                    <button 
                      type="button" 
                      onClick={() => removeRawMaterialInput(index)} 
                      className="p-2 text-red-500 hover:text-red-700"
                      title="Remove Raw Material ID"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={addRawMaterialInput} className="bg-yellow-600 text-yellow-900 px-4 py-2 rounded-lg hover:bg-yellow-700 text-sm font-semibold">Add Another Raw Material ID</button>
              <input name="startTimeManual" placeholder="Production Start Time (e.g., 25/12/2023 14:00)" className="border border-yellow-600 p-3 w-full rounded-lg bg-gray-800 text-yellow-300 focus:ring-yellow-500 focus:border-yellow-500" required />
              <button type="submit" className="bg-yellow-500 text-gray-900 px-6 py-3 rounded-lg hover:bg-yellow-600 w-full disabled:opacity-60 flex items-center justify-center gap-2 font-semibold" disabled={isStartingProduction}>
                {isStartingProduction ? <><Spinner /> Processing...</> : 'Start Production'}
              </button>
            </form>
            {startProductionFeedback.text && (
              <p className={`mt-4 text-base font-medium ${
                startProductionFeedback.type === 'error' ? 'text-red-500' : 
                startProductionFeedback.type === 'success' ? 'text-green-400' : 'text-yellow-400'
              }`}>
                {startProductionFeedback.text}
              </p>
            )}
            {lastBatchId && (
              <div className="mt-6 p-5 bg-yellow-900 rounded-xl shadow-inner text-center">
                <p className="font-semibold text-yellow-300 mb-3">Last Production Batch ID: {lastBatchId}</p>
                <div className="qrcode-container inline-block">
                  <QRCode value={lastBatchId} size={140} />
                </div>
              </div>
            )}
          </section>

          {/* Package Product Section */}
          <section className="mb-10 p-6 bg-gray-900 border border-gray-700 rounded-xl shadow-lg max-w-lg mx-auto">
            <h2 className="text-3xl font-semibold mb-6 text-green-400">3. Package Product</h2>
            <form onSubmit={handlePackageProduct} className="space-y-5">
              <input name="halalCertHash" placeholder="Halal Certificate Hash (if any)" className="border border-green-600 p-3 w-full rounded-lg bg-gray-800 text-green-300 focus:ring-green-500 focus:border-green-500" />
              <input name="packagingTimeManual" placeholder="Packaging Time (e.g., 25/12/2023 18:00)" className="border border-green-600 p-3 w-full rounded-lg bg-gray-800 text-green-300 focus:ring-green-500 focus:border-green-500" required />
              <button type="submit" className="bg-green-600 text-gray-900 px-6 py-3 rounded-lg hover:bg-green-700 w-full disabled:opacity-60 flex items-center justify-center gap-2 font-semibold" disabled={!lastBatchId || isPackagingProduct}>
                {isPackagingProduct ? <><Spinner /> Processing...</> : 'Confirm Packaging'}
              </button>
            </form>
            {packageProductFeedback.text && (
              <p className={`mt-4 text-base font-medium ${packageProductFeedback.type === 'error' ? 'text-red-500' : 'text-green-400'}`}>
                {packageProductFeedback.text}
              </p>
            )}
            {packagingConfirmed && lastBatchId && (
              <div className="mt-6 p-5 bg-green-900 rounded-xl shadow-inner text-center">
                <p className="font-semibold text-green-300 mb-3">Packaging confirmed for Batch ID: {lastBatchId}</p>
                <div className="qrcode-container inline-block">
                  <QRCode value={lastBatchId} size={140} />
                </div>
              </div>
            )}
          </section>

          {/* Get Full Trace Section */}
          <section className="mb-10 p-6 bg-gray-900 border border-gray-700 rounded-xl shadow-lg max-w-lg mx-auto">
            <h2 className="text-3xl font-semibold mb-6 text-indigo-400">4. Get Full Product Trace</h2>
            <form onSubmit={handleGetFullTrace} className="space-y-5">
              <input
                type="number"
                placeholder="Enter Batch ID to Trace"
                value={traceBatchIdInput}
                onChange={(e) => setTraceBatchIdInput(e.target.value)}
                className="border border-indigo-600 p-3 w-full rounded-lg bg-gray-800 text-indigo-300 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <button type="submit" className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 w-full disabled:opacity-60 flex items-center justify-center gap-2 font-semibold" disabled={isFetchingTrace}>
                {isFetchingTrace ? <><Spinner /> Fetching Trace...</> : 'Get Full Trace'}
              </button>
            </form>
            {getTraceFeedback.text && (
              <p className={`mt-4 text-base font-medium ${
                getTraceFeedback.type === 'error' ? 'text-red-500' : 
                getTraceFeedback.type === 'success' ? 'text-green-400' : 'text-yellow-400'
              }`}>
                {getTraceFeedback.text}
              </p>
            )}
            {fullTraceData && (
              <div className="mt-6 p-6 bg-indigo-900 rounded-xl shadow-inner text-indigo-300">
                <h3 className="text-xl font-semibold mb-4">Trace Details for Batch ID: {traceBatchIdInput}</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full table-auto border-collapse border border-indigo-600 text-left">
                    <thead className="bg-indigo-800">
                      <tr>
                        <th className="border border-indigo-600 px-3 py-2 text-sm font-medium">Raw Material ID</th>
                        <th className="border border-indigo-600 px-3 py-2 text-sm font-medium">Source</th>
                        <th className="border border-indigo-600 px-3 py-2 text-sm font-medium">Quality</th>
                        <th className="border border-indigo-600 px-3 py-2 text-sm font-medium">Pickup Time</th>
                      </tr>
                    </thead>
                    <tbody className="bg-indigo-800">
                      {fullTraceData.bahanIds.map((id, idx) => (
                        <tr key={id} className="hover:bg-indigo-700">
                          <td className="border border-indigo-600 px-3 py-2 text-sm">{id}</td>
                          <td className="border border-indigo-600 px-3 py-2 text-sm">{fullTraceData.sumber[idx]}</td>
                          <td className="border border-indigo-600 px-3 py-2 text-sm">{fullTraceData.kualitas[idx]}</td>
                          <td className="border border-indigo-600 px-3 py-2 text-sm">{fullTraceData.waktuManual[idx]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-4 text-sm"><strong>Production Time:</strong> {fullTraceData.waktuProduksi} (Manual: {fullTraceData.waktuProduksiManual || 'N/A'})</p>
                <p className="text-sm"><strong>Packaging Time:</strong> {fullTraceData.waktuKemas} (Manual: {fullTraceData.waktuKemasManual || 'N/A'})</p>
                <p className="text-sm"><strong>Halal Certificate Hash:</strong> {fullTraceData.halalHash || 'N/A'}</p>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default App;
