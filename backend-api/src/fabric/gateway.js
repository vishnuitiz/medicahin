// Simplified Fabric gateway - works immediately, MongoDB-ready for deployment
const { MedicalRecord } = require('../models/MedicalRecord');

let useDatabase = false;
const memoryStore = new Map();

// Try to connect to MongoDB, fallback to memory
async function initStorage() {
    if (useDatabase) return;

    try {
        const connectDB = require('../config/database');
        await connectDB();
        useDatabase = true;
        console.log('✅ Using MongoDB for storage');
    } catch (error) {
        console.log('⚠️  MongoDB not available, using in-memory storage');
        useDatabase = false;
    }
}

class SimpleFabricGateway {
    async getContract(channelName, chaincodeName) {
        await initStorage();
        return new SimpleFabricContract();
    }
    close() { }
}

class SimpleFabricContract {
    async submitTransaction(functionName, ...args) {
        console.log(`[Fabric] ${functionName}(${args.slice(0, 2).join(', ')}...)`);

        if (functionName === 'initLedger') {
            return Buffer.from(JSON.stringify({ success: true }));
        }

        if (functionName === 'storeProtectedMedicalData') {
            const [recordId, medicalDataJson, providerId, patientId] = args;
            const record = {
                recordId,
                medicalData: JSON.parse(medicalDataJson),
                providerId,
                patientId,
                protectionId: `prot-${Date.now()}`,
                createdAt: new Date()
            };

            if (useDatabase) {
                await new MedicalRecord(record).save();
            } else {
                memoryStore.set(recordId, record);
            }

            console.log(`✅ Stored: ${recordId}`);
            return Buffer.from(JSON.stringify({
                recordId: record.recordId,
                protectionId: record.protectionId,
                timestamp: record.createdAt.toISOString()
            }));
        }

        throw new Error(`Unknown function: ${functionName}`);
    }

    async evaluateTransaction(functionName, ...args) {
        console.log(`[Fabric] Query: ${functionName}`);

        if (functionName === 'getPatientRecords') {
            const [patientId] = args;
            let records;

            if (useDatabase) {
                records = await MedicalRecord.find({ patientId }).sort({ createdAt: -1 }).lean();
            } else {
                records = Array.from(memoryStore.values())
                    .filter(r => r.patientId === patientId)
                    .sort((a, b) => b.createdAt - a.createdAt);
            }

            console.log(`✅ Found ${records.length} records`);
            return Buffer.from(JSON.stringify({ records }));
        }

        return Buffer.from(JSON.stringify({ records: [] }));
    }
}

module.exports = {
    getContract: async (channel, chaincode) => {
        const gw = new SimpleFabricGateway();
        return gw.getContract(channel, chaincode);
    },
    closeGateway: () => { }
};
